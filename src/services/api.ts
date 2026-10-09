import { PatientCase, AuditLogEntry, ReferralDraft, UserRole, SupportedLanguage } from '../types';

export const api = {
  async transcribeAudio(audioBase64: string, audioMime?: string): Promise<{ transcript: string }> {
    const res = await fetch('/api/transcribe-audio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioBase64, audioMime: audioMime || 'audio/webm' }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to transcribe audio');
    }
    return res.json();
  },

  async getCases(): Promise<PatientCase[]> {
    const res = await fetch('/api/cases');
    if (!res.ok) throw new Error('Failed to fetch cases');
    const data = await res.json();
    return data.cases;
  },

  async getCase(id: string): Promise<PatientCase> {
    const res = await fetch(`/api/cases/${id}`);
    if (!res.ok) throw new Error('Failed to fetch case');
    const data = await res.json();
    return data.case;
  },

  async createCase(params: {
    syntheticName?: string;
    age?: number | string;
    sex?: string;
    language?: SupportedLanguage;
    facility?: string;
    consentGiven: boolean;
  }): Promise<PatientCase> {
    const res = await fetch('/api/cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to create case');
    }
    const data = await res.json();
    return data.case;
  },

  async updateCase(id: string, updates: Partial<PatientCase> & { actorRole?: UserRole; actionDesc?: string }): Promise<PatientCase> {
    const res = await fetch(`/api/cases/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error('Failed to update case');
    const data = await res.json();
    return data.case;
  },

  async generateHandoffSummary(id: string, forceRegenerate = false): Promise<ReferralDraft> {
    const res = await fetch(`/api/cases/${id}/generate-handoff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ forceRegenerate }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to generate handoff summary');
    }
    const data = await res.json();
    return data.draft;
  },

  async processIntake(
    id: string,
    payload: {
      inputType: 'TEXT' | 'VOICE' | 'DOCUMENT';
      text?: string;
      audioBase64?: string;
      audioMime?: string;
      docBase64?: string;
      docMime?: string;
      docName?: string;
      language?: SupportedLanguage;
    }
  ): Promise<PatientCase> {
    const res = await fetch(`/api/cases/${id}/process-intake`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to process intake');
    }
    const data = await res.json();
    return data.case;
  },

  async answerQuestion(id: string, questionId: string, answer: string): Promise<PatientCase> {
    const res = await fetch(`/api/cases/${id}/answer-question`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionId, answer }),
    });
    if (!res.ok) throw new Error('Failed to record answer');
    const data = await res.json();
    return data.case;
  },

  async verifyLab(
    id: string,
    payload: { labId: string; verified: boolean; correctedValue?: string | number; notes?: string }
  ): Promise<PatientCase> {
    const res = await fetch(`/api/cases/${id}/verify-lab`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to verify lab value');
    const data = await res.json();
    return data.case;
  },

  async approveCase(
    id: string,
    payload: { reviewerName: string; reviewerNotes?: string; assignedReviewer?: string }
  ): Promise<PatientCase> {
    const res = await fetch(`/api/cases/${id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to approve case');
    const data = await res.json();
    return data.case;
  },

  async escalateCase(id: string, payload: { reason: string; reviewerName: string }): Promise<PatientCase> {
    const res = await fetch(`/api/cases/${id}/escalate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to escalate case');
    const data = await res.json();
    return data.case;
  },

  async generateReferral(
    id: string,
    payload?: { facilityTo?: string; reasonForReferral?: string }
  ): Promise<ReferralDraft> {
    const res = await fetch(`/api/cases/${id}/referral`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
    });
    if (!res.ok) throw new Error('Failed to generate referral draft');
    const data = await res.json();
    return data.referralDraft;
  },

  async getCaseAudit(id: string): Promise<AuditLogEntry[]> {
    const res = await fetch(`/api/cases/${id}/audit`);
    if (!res.ok) throw new Error('Failed to fetch case audit');
    const data = await res.json();
    return data.logs;
  },

  async getAllAudit(): Promise<AuditLogEntry[]> {
    const res = await fetch('/api/audit-logs');
    if (!res.ok) throw new Error('Failed to fetch audit trail');
    const data = await res.json();
    return data.logs;
  },

  async syncAuditBatch(events: AuditLogEntry[]): Promise<{ processedCount: number; syncedIds: string[] }> {
    const res = await fetch('/api/audit-logs/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to batch sync audit events');
    }
    return res.json();
  },

  async logSyncEvent(caseId: string, payload: Partial<AuditLogEntry>): Promise<void> {
    const res = await fetch(`/api/cases/${caseId}/audit-sync-log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to log sync event');
    }
  },

  async getStats(): Promise<{
    totalCases: number;
    urgentCount: number;
    priorityCount: number;
    routineCount: number;
    waitingCount: number;
    reviewedCount: number;
  }> {
    const res = await fetch('/api/stats');
    if (!res.ok) throw new Error('Failed to fetch stats');
    return res.json();
  },

  async resetDemo(): Promise<void> {
    const res = await fetch('/api/demo/seed', { method: 'POST' });
    if (!res.ok) throw new Error('Failed to reset demo');
  },
};
