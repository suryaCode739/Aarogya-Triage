import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { PatientCase, ReviewPriority, CaseStatus, SupportedLanguage, Vitals, UserRole } from '../types';
import { api } from './api';
import { offlineAudioStorage, OfflineAudioStorageService } from './offlineAudioStorage';
import { offlineAuditStorage } from './offlineAuditStorage';

const PENDING_SYNC_STORAGE_KEY = 'aarogya_minimal_pending_cases_queue';

export type SyncStatus = 'PENDING_SYNC' | 'SYNCING' | 'SYNC_FAILED' | 'SYNCED';

export interface MinimalPendingSyncCase {
  id: string;
  createdAt: string;
  updatedAt: string;
  language: SupportedLanguage;
  facility: string;
  consentGiven: boolean;
  patient: {
    syntheticName: string;
    age: number | null;
    sex: 'M' | 'F' | 'OTHER' | null;
  };
  chief_complaint: string;
  symptoms: Array<{
    id: string;
    name: string;
    duration?: string;
    severity?: 'MILD' | 'MODERATE' | 'SEVERE';
    source: string;
  }>;
  vitals: Vitals;
  review_priority: ReviewPriority;
  case_status: CaseStatus;
  sync_status: SyncStatus;
  lastSyncAttempt?: string;
  syncError?: string;
  remoteConflict?: boolean;
  audioRecordingId?: string;
}

// Extract only minimum essential clinical fields to minimize local storage footprint
export function toMinimalPendingCase(fullCase: PatientCase): MinimalPendingSyncCase {
  return {
    id: fullCase.id,
    createdAt: fullCase.createdAt || new Date().toISOString(),
    updatedAt: fullCase.updatedAt || new Date().toISOString(),
    language: fullCase.language || 'en',
    facility: fullCase.facility || 'Health Facility',
    consentGiven: Boolean(fullCase.consentGiven),
    patient: {
      syntheticName: fullCase.patient?.syntheticName || 'Demo Patient',
      age: fullCase.patient?.age ?? null,
      sex: fullCase.patient?.sex ?? null,
    },
    chief_complaint: fullCase.chief_complaint || 'Awaiting symptom intake',
    symptoms: Array.isArray(fullCase.symptoms)
      ? fullCase.symptoms.map((s) => ({
          id: s.id,
          name: s.name,
          duration: s.duration,
          severity: s.severity,
          source: s.source,
        }))
      : [],
    vitals: fullCase.vitals || {},
    review_priority: fullCase.review_priority || 'ROUTINE',
    case_status: fullCase.case_status || 'WAITING',
    sync_status: 'PENDING_SYNC',
    audioRecordingId:
      fullCase.audioRecordingId ||
      (fullCase.audioRecordingUrl?.startsWith('idb://')
        ? fullCase.audioRecordingUrl.replace('idb://', '')
        : undefined),
  };
}

class OfflineSyncManager {
  private listeners: Set<(count: number) => void> = new Set();

  public getPendingCases(): MinimalPendingSyncCase[] {
    try {
      const raw = localStorage.getItem(PENDING_SYNC_STORAGE_KEY);
      if (!raw) return [];
      return JSON.parse(raw);
    } catch (e) {
      console.warn('Failed to parse pending sync cases from localStorage:', e);
      return [];
    }
  }

  public getPendingCount(): number {
    return this.getPendingCases().length;
  }

  public subscribe(listener: (count: number) => void): () => void {
    this.listeners.add(listener);
    listener(this.getPendingCount());
    return () => this.listeners.delete(listener);
  }

  private notify() {
    const count = this.getPendingCount();
    this.listeners.forEach((l) => l(count));
  }

  // Queue a case locally with only minimal fields - strictly idempotent
  public queueCase(patientCase: PatientCase): MinimalPendingSyncCase {
    const pendingCases = this.getPendingCases();
    const minimal = toMinimalPendingCase(patientCase);

    const existingIdx = pendingCases.findIndex((c) => c.id === minimal.id);
    if (existingIdx >= 0) {
      const existing = pendingCases[existingIdx];
      // Idempotent update: update clinical fields while retaining sync attempt info
      pendingCases[existingIdx] = {
        ...existing,
        ...minimal,
        // Retain SYNCING if actively in progress, otherwise ensure PENDING_SYNC
        sync_status: existing.sync_status === 'SYNCING' ? 'SYNCING' : 'PENDING_SYNC',
        lastSyncAttempt: existing.lastSyncAttempt,
        syncError: existing.syncError,
        remoteConflict: existing.remoteConflict,
      };
    } else {
      pendingCases.push(minimal);
    }

    // Deduplicate any records with the same case ID
    const seenIds = new Set<string>();
    const deduplicatedCases: MinimalPendingSyncCase[] = [];
    for (const c of pendingCases) {
      if (!seenIds.has(c.id)) {
        seenIds.add(c.id);
        deduplicatedCases.push(c);
      }
    }

    try {
      localStorage.setItem(PENDING_SYNC_STORAGE_KEY, JSON.stringify(deduplicatedCases));
    } catch (e) {
      console.error('LocalStorage quota or storage error while queueing minimal case:', e);
    }

    this.notify();
    return deduplicatedCases.find((c) => c.id === minimal.id) || minimal;
  }

  // Remove local data after successful Firebase synchronization
  public removeLocalCase(caseId: string): void {
    const pendingCases = this.getPendingCases().filter((c) => c.id !== caseId);
    try {
      if (pendingCases.length === 0) {
        localStorage.removeItem(PENDING_SYNC_STORAGE_KEY);
      } else {
        localStorage.setItem(PENDING_SYNC_STORAGE_KEY, JSON.stringify(pendingCases));
      }
    } catch (e) {
      console.warn('Failed to update pending cases after eviction:', e);
    }
    this.notify();
  }

  // Synchronize all pending cases to Cloud Firestore
  // Never silently overwrite: checks remote updatedAt before update
  public async syncPendingToFirebase(
    fullCasesMap: Map<string, PatientCase>
  ): Promise<{ synced: number; failed: number; conflicts: number }> {
    const pending = this.getPendingCases();
    if (pending.length === 0) {
      return { synced: 0, failed: 0, conflicts: 0 };
    }

    let syncedCount = 0;
    let failedCount = 0;
    let conflictCount = 0;

    for (const pendingItem of pending) {
      const caseRef = doc(db, 'cases', pendingItem.id);
      try {
        pendingItem.sync_status = 'SYNCING';

        // Concurrency Guard: Never silently overwrite a case
        const remoteSnap = await getDoc(caseRef);

        if (remoteSnap.exists()) {
          const remoteData = remoteSnap.data();
          const remoteUpdated = new Date(remoteData.updatedAt || 0).getTime();
          const localUpdated = new Date(pendingItem.updatedAt || 0).getTime();

          // Remote is strictly newer than our local edit
          if (remoteUpdated > localUpdated) {
            conflictCount++;
            pendingItem.sync_status = 'SYNC_FAILED';
            pendingItem.remoteConflict = true;
            pendingItem.syncError = `Remote case updated by another reviewer at ${new Date(remoteUpdated).toLocaleTimeString()}. Manual reconciliation required.`;
            
            // Record failure/conflict in audit log
            await this.logSyncEvent(
              pendingItem.id,
              'FIREBASE_SYNC_CONFLICT_DETECTED',
              `Conflict detected for Case ${pendingItem.id}: Remote document timestamp is newer. Overwrite prevented.`
            );
            continue;
          }
        }

        // Prepare full or minimal payload
        const full = fullCasesMap.get(pendingItem.id);
        const payloadToUpload: PatientCase = full
          ? {
              ...full,
              id: pendingItem.id,
              updatedAt: new Date().toISOString(),
              sync_status: 'SYNCED',
              pending_sync: false,
            }
          : {
              ...pendingItem,
              id: pendingItem.id,
              updatedAt: new Date().toISOString(),
              sync_status: 'SYNCED',
              pending_sync: false,
              symptoms: pendingItem.symptoms.map((s) => ({
                id: s.id,
                name: s.name,
                duration: s.duration,
                severity: s.severity,
                source: (s.source as any) || 'PATIENT_STATEMENT',
                confidence: 'MEDIUM' as const,
              })),
              timeline: [],
              medical_history: [],
              medications: [],
              allergies: [],
              documents: [],
              extracted_labs: [],
              missing_information: [],
              follow_up_questions: [],
              safety_flags: [],
              contradictions: [],
              ai_summary: {
                narrative: pendingItem.chief_complaint,
                keyPoints: [],
                suggestedFocus: 'Direct physical assessment by Medical Officer; check vitals.',
              },
              ai_disclaimer: 'Advisory / Triage Support Only — Verification required.',
            };

        // Check if there is an associated offline audio recording in IndexedDB
        const audioRecId = pendingItem.audioRecordingId || (full && full.audioRecordingId);
        let audioRecord = null;
        try {
          if (audioRecId) {
            audioRecord = await offlineAudioStorage.getAudioRecording(audioRecId);
          }
          if (!audioRecord) {
            audioRecord = await offlineAudioStorage.getAudioRecordingForCase(pendingItem.id);
          }
        } catch (audioCheckErr) {
          console.warn('Could not inspect IndexedDB audio before sync:', audioCheckErr);
        }

        // If audio exists and clinical narrative hasn't been transcribed yet, transcribe now using online Gemini
        if (audioRecord && !audioRecord.transcribed) {
          try {
            const b64 = await OfflineAudioStorageService.blobToBase64(audioRecord.blob);
            const transcriptionResult = await api.transcribeAudio(b64, audioRecord.mimeType || 'audio/webm');
            if (transcriptionResult && transcriptionResult.transcript) {
              payloadToUpload.originalStatement = transcriptionResult.transcript;
              payloadToUpload.translatedStatement = transcriptionResult.transcript;
              if (
                !payloadToUpload.chief_complaint ||
                payloadToUpload.chief_complaint.includes('Voice intake recorded offline') ||
                payloadToUpload.chief_complaint.includes('Awaiting symptom intake')
              ) {
                payloadToUpload.chief_complaint = transcriptionResult.transcript.slice(0, 120);
              }
              if (payloadToUpload.ai_summary) {
                payloadToUpload.ai_summary.narrative = transcriptionResult.transcript;
              }
            }
          } catch (transcribeErr) {
            console.warn('Audio transcription during sync failed or timed out:', transcribeErr);
            // Non-fatal: continue with payload upload, but do not delete audio if write fails
          }
        }

        // Write to Cloud Firestore
        await setDoc(caseRef, payloadToUpload);

        // Also update backend server store if reachable
        try {
          await api.updateCase(pendingItem.id, payloadToUpload).catch(async () => {
            await fetch(`/api/cases`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ...payloadToUpload,
                syntheticName: payloadToUpload.patient?.syntheticName,
                age: payloadToUpload.patient?.age,
                sex: payloadToUpload.patient?.sex,
                consentGiven: true,
              }),
            }).catch(() => {});
          });
        } catch {}

        // Remove local metadata after successful synchronization!
        this.removeLocalCase(pendingItem.id);

        // Safely remove the corresponding local IndexedDB audio recording only after successful sync
        try {
          if (audioRecId) {
            await offlineAudioStorage.deleteAudioRecording(audioRecId).catch(() => {});
          }
          await offlineAudioStorage.deleteAudioForCase(pendingItem.id).catch(() => {});
        } catch (delAudioErr) {
          console.warn('Could not delete synced audio recording from IndexedDB:', delAudioErr);
        }

        syncedCount++;

        // Record sync success in audit log
        await this.logSyncEvent(
          pendingItem.id,
          'FIREBASE_SYNC_SUCCESS',
          `Case ${pendingItem.id} successfully synchronized to Cloud Firestore. Temporary local cache evicted.`
        );
      } catch (err: any) {
        failedCount++;
        pendingItem.sync_status = 'SYNC_FAILED';
        pendingItem.lastSyncAttempt = new Date().toISOString();
        pendingItem.syncError = err.message || 'Network write failure';

        // Record sync failure in audit log
        await this.logSyncEvent(
          pendingItem.id,
          'FIREBASE_SYNC_FAILED',
          `Failed to sync Case ${pendingItem.id} to Cloud Firestore: ${err.message || 'Unknown network error'}. Case retained in local pending queue.`
        );
      }
    }

    // Persist any updated error or conflict states for remaining cases
    try {
      const remainingPending = pending.filter((p) => this.getPendingCases().some((c) => c.id === p.id));
      if (remainingPending.length > 0) {
        localStorage.setItem(PENDING_SYNC_STORAGE_KEY, JSON.stringify(remainingPending));
      }
    } catch (e) {
      console.warn('Failed to persist error states to localStorage:', e);
    }

    // Also synchronize durable offline audit queue
    try {
      await offlineAuditStorage.syncPendingAuditEvents();
    } catch (auditSyncErr) {
      console.warn('Audit queue sync encountered error:', auditSyncErr);
    }

    this.notify();
    return { synced: syncedCount, failed: failedCount, conflicts: conflictCount };
  }

  public isCasePending(caseId: string): boolean {
    return this.getPendingCases().some((c) => c.id === caseId);
  }

  public getPendingCase(caseId: string): MinimalPendingSyncCase | undefined {
    return this.getPendingCases().find((c) => c.id === caseId);
  }

  public clearAllPending(): void {
    try {
      localStorage.removeItem(PENDING_SYNC_STORAGE_KEY);
      this.notify();
    } catch (e) {
      console.warn('Failed to clear pending sync cache:', e);
    }
  }

  public async syncAuditQueue(): Promise<{ syncedCount: number; failedCount: number }> {
    return offlineAuditStorage.syncPendingAuditEvents();
  }

  public async logSyncEvent(
    caseId: string,
    action: string,
    details: string,
    options?: {
      userRole?: UserRole;
      actorId?: string;
      origin?: 'ONLINE' | 'OFFLINE';
    }
  ): Promise<void> {
    const role: UserRole = options?.userRole || 'PATIENT_WORKER';
    const actor = options?.actorId || 'ASHA_WORKER_01';
    const origin = options?.origin || 'OFFLINE';

    // 1. Durably record locally in IndexedDB first so it survives reload/shutdown
    const event = await offlineAuditStorage.recordAuditEvent({
      caseId,
      action,
      details,
      userRole: role,
      actorId: actor,
      userId: actor,
      origin,
      syncStatus: 'PENDING',
    });

    // 2. Attempt immediate dispatch to backend server if reachable
    try {
      const res = await fetch(`/api/cases/${caseId}/audit-sync-log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: event.id,
          clientEventId: event.id,
          action,
          details,
          userRole: role,
          actorId: actor,
          origin,
          timestamp: event.timestamp,
        }),
      });

      if (res.ok) {
        await offlineAuditStorage.markEventsSynced([event.id]);
      } else {
        await offlineAuditStorage.markEventFailed(event.id, `Server HTTP ${res.status}`);
      }
    } catch (netErr: any) {
      // Offline or network error: retain in IndexedDB for automatic background sync upon reconnection
      await offlineAuditStorage.markEventFailed(event.id, netErr.message || 'Offline');
    }
  }
}

export const offlineSyncService = new OfflineSyncManager();
