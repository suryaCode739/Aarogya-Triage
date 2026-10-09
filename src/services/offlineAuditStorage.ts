// Durable IndexedDB audit storage service for AarogyaTriage
// Persists all local/offline audit events durably across page refreshes, browser reloads, and offline periods.
// Provides idempotent sync and retry lifecycle.

import { AuditLogEntry, UserRole, AuditOrigin, AuditSyncStatus } from '../types';

const DB_NAME = 'aarogya_audit_events_db';
const DB_VERSION = 1;
const STORE_NAME = 'audit_events';

function openAuditDB(): Promise<IDBDatabase> {
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
        store.createIndex('syncStatus', 'syncStatus', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('origin', 'origin', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open audit IndexedDB'));
  });
}

export class OfflineAuditStorageService {
  /**
   * Persists an audit event entry into IndexedDB durably.
   * Resolves only after the transaction completes successfully.
   */
  public async saveAuditEvent(entry: AuditLogEntry): Promise<AuditLogEntry> {
    const db = await openAuditDB();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        const record: AuditLogEntry = {
          ...entry,
          clientEventId: entry.clientEventId || entry.id,
          createdAt: entry.createdAt || entry.timestamp || new Date().toISOString(),
          retryCount: entry.retryCount ?? 0,
        };

        const putReq = store.put(record);

        transaction.oncomplete = () => {
          resolve(record);
        };

        transaction.onerror = (e) => {
          reject(transaction.error || (e.target as any)?.error || new Error('Failed to save audit event'));
        };

        putReq.onerror = () => {
          reject(putReq.error || new Error('Failed to put audit event into store'));
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Helper to construct and immediately persist a new audit event.
   */
  public async recordAuditEvent(params: {
    caseId: string;
    action: string;
    details: string;
    userRole: UserRole;
    actorId?: string;
    userId?: string;
    origin?: AuditOrigin;
    syncStatus?: AuditSyncStatus;
    changes?: Record<string, any>;
  }): Promise<AuditLogEntry> {
    const now = new Date().toISOString();
    const id = `AUD_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const origin = params.origin || 'OFFLINE';
    const syncStatus = params.syncStatus || (origin === 'ONLINE' ? 'SYNCED' : 'PENDING');
    const actor = params.actorId || params.userId || (params.userRole === 'REVIEWER' ? 'DR_MED_OFFICER' : 'ASHA_WORKER_01');

    const entry: AuditLogEntry = {
      id,
      clientEventId: id,
      timestamp: now,
      createdAt: now,
      caseId: params.caseId,
      userRole: params.userRole,
      actorId: actor,
      userId: actor,
      action: params.action,
      details: params.details,
      changes: params.changes,
      origin,
      syncStatus,
      retryCount: 0,
      syncedAt: syncStatus === 'SYNCED' ? now : undefined,
    };

    return this.saveAuditEvent(entry);
  }

  /**
   * Retrieves all audit events currently queued for synchronization.
   */
  public async getPendingAuditEvents(): Promise<AuditLogEntry[]> {
    const db = await openAuditDB();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const req = store.getAll();

        req.onsuccess = () => {
          const all: AuditLogEntry[] = req.result || [];
          const pending = all.filter(
            (e) => e.syncStatus === 'PENDING' || e.syncStatus === 'SYNC_FAILED'
          );
          // Sort oldest first for proper audit replay ordering
          pending.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
          resolve(pending);
        };

        req.onerror = () => {
          reject(req.error || new Error('Failed to retrieve pending audit events'));
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Retrieves all audit events stored locally.
   */
  public async getAllAuditEvents(): Promise<AuditLogEntry[]> {
    const db = await openAuditDB();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const req = store.getAll();

        req.onsuccess = () => {
          const all: AuditLogEntry[] = req.result || [];
          all.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          resolve(all);
        };

        req.onerror = () => {
          reject(req.error || new Error('Failed to retrieve all audit events'));
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Retrieves all local audit events for a specific patient case.
   */
  public async getAuditEventsForCase(caseId: string): Promise<AuditLogEntry[]> {
    const db = await openAuditDB();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const index = store.index('caseId');
        const req = index.getAll(caseId);

        req.onsuccess = () => {
          const events: AuditLogEntry[] = req.result || [];
          events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          resolve(events);
        };

        req.onerror = () => {
          reject(req.error || new Error('Failed to retrieve case audit events'));
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Marks a set of audit events as in-flight / SYNCING.
   */
  public async markEventsSyncing(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const db = await openAuditDB();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        let completed = 0;
        let hasError = false;

        ids.forEach((id) => {
          const getReq = store.get(id);
          getReq.onsuccess = () => {
            if (getReq.result) {
              const updated: AuditLogEntry = {
                ...getReq.result,
                syncStatus: 'SYNCING',
              };
              store.put(updated);
            }
            completed++;
            if (completed === ids.length && !hasError) {
              // wait for transaction complete
            }
          };
          getReq.onerror = () => {
            hasError = true;
          };
        });

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error || new Error('Failed to mark events syncing'));
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Marks events as successfully synced to server.
   */
  public async markEventsSynced(ids: string[], syncedAt: string = new Date().toISOString()): Promise<void> {
    if (ids.length === 0) return;
    const db = await openAuditDB();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        ids.forEach((id) => {
          const getReq = store.get(id);
          getReq.onsuccess = () => {
            if (getReq.result) {
              const updated: AuditLogEntry = {
                ...getReq.result,
                syncStatus: 'SYNCED',
                syncedAt,
              };
              store.put(updated);
            }
          };
        });

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error || new Error('Failed to mark events synced'));
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Marks a single event as failed with error details and increments retry count.
   */
  public async markEventFailed(id: string, error: string): Promise<void> {
    const db = await openAuditDB();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const getReq = store.get(id);

        getReq.onsuccess = () => {
          if (getReq.result) {
            const current = getReq.result as AuditLogEntry;
            const updated: AuditLogEntry = {
              ...current,
              syncStatus: 'SYNC_FAILED',
              retryCount: (current.retryCount || 0) + 1,
              lastError: error,
            };
            store.put(updated);
          }
        };

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error || new Error('Failed to mark event failed'));
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Deletes a specific audit event from IndexedDB if necessary.
   */
  public async deleteAuditEvent(id: string): Promise<void> {
    const db = await openAuditDB();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        store.delete(id);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error || new Error('Failed to delete event'));
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Clear all audit events (for demo reset or testing)
   */
  public async clearAllAuditEvents(): Promise<void> {
    const db = await openAuditDB();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        store.clear();
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error || new Error('Failed to clear events'));
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Synchronizes all pending audit events to the backend server with retry lifecycle and idempotency.
   */
  public async syncPendingAuditEvents(): Promise<{ syncedCount: number; failedCount: number }> {
    const pending = await this.getPendingAuditEvents();
    if (pending.length === 0) {
      return { syncedCount: 0, failedCount: 0 };
    }

    const ids = pending.map((e) => e.id);
    await this.markEventsSyncing(ids);

    let syncedCount = 0;
    let failedCount = 0;

    try {
      const res = await fetch('/api/audit-logs/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: pending }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server responded with HTTP ${res.status}`);
      }

      const result = await res.json();
      const acknowledgedIds: string[] = result.syncedIds || ids;
      await this.markEventsSynced(acknowledgedIds);
      syncedCount = acknowledgedIds.length;
    } catch (err: any) {
      console.warn('Batch audit sync failed, marking individual events as failed:', err);
      // Mark all pending as failed with the error message and retain for next cycle
      for (const item of pending) {
        failedCount++;
        await this.markEventFailed(item.id, err.message || 'Network sync failure').catch(() => {});
      }
    }

    return { syncedCount, failedCount };
  }
}

export const offlineAuditStorage = new OfflineAuditStorageService();
