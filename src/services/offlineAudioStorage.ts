// Durable IndexedDB storage service for offline audio recordings
// Safely stores audio Blobs across page reloads, browser restarts, and navigation

export interface StoredAudioRecording {
  id: string; // Stable recording ID or case-associated recording ID
  caseId?: string; // Associated case ID
  blob: Blob; // The raw binary audio Blob
  mimeType: string; // e.g. 'audio/webm'
  durationSeconds?: number;
  createdAt: string; // ISO timestamp
  transcribed?: boolean;
  transcript?: string;
  source?: string;
}

const DB_NAME = 'aarogya_offline_audio_db';
const DB_VERSION = 1;
const STORE_NAME = 'audio_recordings';

function openAudioDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not supported in this environment'));
      return;
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('caseId', 'caseId', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open audio IndexedDB'));
  });
}

export class OfflineAudioStorageService {
  /**
   * Persists an audio Blob to IndexedDB
   * Resolves only after the transaction is successfully committed to durable storage
   */
  public async saveAudioRecording(record: {
    id: string;
    caseId?: string;
    blob: Blob;
    mimeType?: string;
    durationSeconds?: number;
    transcript?: string;
  }): Promise<void> {
    const db = await openAudioDB();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        const data: StoredAudioRecording = {
          id: record.id,
          caseId: record.caseId,
          blob: record.blob,
          mimeType: record.mimeType || record.blob.type || 'audio/webm',
          durationSeconds: record.durationSeconds,
          createdAt: new Date().toISOString(),
          transcribed: Boolean(record.transcript),
          transcript: record.transcript,
          source: 'OFFLINE_MIC_RECORDING',
        };

        const putReq = store.put(data);

        transaction.oncomplete = () => {
          resolve();
        };

        transaction.onerror = (e) => {
          reject(transaction.error || (e.target as any)?.error || new Error('Transaction failed'));
        };

        putReq.onerror = () => {
          reject(putReq.error || new Error('Failed to store audio blob in IndexedDB'));
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Verifies that the audio recording exists in IndexedDB and has valid content
   */
  public async hasAudioRecording(id: string): Promise<boolean> {
    try {
      const record = await this.getAudioRecording(id);
      return Boolean(record && record.blob && record.blob.size > 0);
    } catch {
      return false;
    }
  }

  /**
   * Retrieves a stored audio record by its recording ID
   */
  public async getAudioRecording(id: string): Promise<StoredAudioRecording | null> {
    const db = await openAudioDB();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(id);

        request.onsuccess = () => {
          resolve(request.result || null);
        };

        request.onerror = () => {
          reject(request.error || new Error('Failed to retrieve audio from IndexedDB'));
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Retrieves an audio recording associated with a specific case ID
   */
  public async getAudioRecordingForCase(caseId: string): Promise<StoredAudioRecording | null> {
    // 1. Direct key match (in case recordingId === caseId or begins with it)
    const direct = await this.getAudioRecording(caseId);
    if (direct) return direct;

    const db = await openAudioDB();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);

        if (store.indexNames.contains('caseId')) {
          const index = store.index('caseId');
          const request = index.get(caseId);
          request.onsuccess = () => {
            if (request.result) {
              resolve(request.result);
              return;
            }
            // Fallback scan
            this.scanByCaseId(store, caseId).then(resolve).catch(reject);
          };
          request.onerror = () => {
            this.scanByCaseId(store, caseId).then(resolve).catch(reject);
          };
        } else {
          this.scanByCaseId(store, caseId).then(resolve).catch(reject);
        }
      } catch (err) {
        reject(err);
      }
    });
  }

  private scanByCaseId(store: IDBObjectStore, caseId: string): Promise<StoredAudioRecording | null> {
    return new Promise((resolve) => {
      const cursorReq = store.openCursor();
      cursorReq.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest).result as IDBCursorWithValue;
        if (cursor) {
          const val = cursor.value as StoredAudioRecording;
          if (val.caseId === caseId || val.id === caseId || val.id.includes(caseId)) {
            resolve(val);
            return;
          }
          cursor.continue();
        } else {
          resolve(null);
        }
      };
      cursorReq.onerror = () => resolve(null);
    });
  }

  /**
   * Deletes a stored recording from IndexedDB
   */
  public async deleteAudioRecording(id: string): Promise<void> {
    const db = await openAudioDB();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const req = store.delete(id);

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error || new Error('Failed to delete audio recording'));
        req.onerror = () => reject(req.error || new Error('Failed to delete audio recording'));
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Deletes all recordings associated with a case ID
   */
  public async deleteAudioForCase(caseId: string): Promise<void> {
    try {
      const rec = await this.getAudioRecordingForCase(caseId);
      if (rec) {
        await this.deleteAudioRecording(rec.id);
      }
      // Also try direct deletion by caseId in case key matches
      await this.deleteAudioRecording(caseId).catch(() => {});
    } catch (e) {
      console.warn('Error deleting audio for case:', caseId, e);
    }
  }

  /**
   * Returns all stored audio recordings (e.g. for queue audit or bulk recovery)
   */
  public async getAllRecordings(): Promise<StoredAudioRecording[]> {
    const db = await openAudioDB();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const req = store.getAll();

        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error || new Error('Failed to load recordings'));
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Converts a Blob to a base64 string (without data URL prefix)
   */
  public static async blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const res = reader.result as string;
        const b64 = res.includes(',') ? res.split(',')[1] : res;
        resolve(b64);
      };
      reader.onerror = () => reject(reader.error || new Error('Failed to convert Blob to base64'));
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Creates a playable URL from a Blob or stored record
   */
  public static createPlayableUrl(blob: Blob): string {
    return URL.createObjectURL(blob);
  }
}

export const offlineAudioStorage = new OfflineAudioStorageService();
