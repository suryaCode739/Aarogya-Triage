export type ReviewPriority = 'ROUTINE' | 'PRIORITY' | 'URGENT';
export type CaseStatus = 'WAITING' | 'IN_REVIEW' | 'REVIEWED' | 'ESCALATED' | 'REFERRED';
export type SyncStatus = 'PENDING_SYNC' | 'SYNCING' | 'SYNC_FAILED' | 'SYNCED';
export type ExtractionConfidence = 'HIGH' | 'MEDIUM' | 'LOW';
export type UserRole = 'PATIENT_WORKER' | 'REVIEWER' | 'ADMIN';
export type SupportedLanguage = 'en' | 'hi' | 'or' | 'bn' | 'te' | 'ta' | 'mr';

export interface Symptom {
  id: string;
  name: string;
  duration?: string;
  onset?: string;
  severity?: 'MILD' | 'MODERATE' | 'SEVERE';
  status?: string;
  source: 'PATIENT_STATEMENT' | 'PATIENT_VOICE' | 'REPORT' | 'CLINICAL_WORKER';
  evidenceQuote?: string;
  confidence: ExtractionConfidence;
}

export interface TimelineEvent {
  id: string;
  timeframe: string; // e.g. "Day 1 (3 days ago)", "Day 2", "Today"
  description: string;
  source: string;
  isApproximate?: boolean;
}

export interface Vitals {
  temperature?: { value: number; unit: 'F' | 'C'; source: string; status?: 'NORMAL' | 'ELEVATED' | 'HIGH' };
  blood_pressure?: { systolic: number; diastolic: number; source: string; status?: 'NORMAL' | 'ELEVATED' | 'CRITICAL' };
  heart_rate?: { value: number; unit: 'bpm'; source: string; status?: 'NORMAL' | 'TACHYCARDIA' | 'BRADYCARDIA' };
  spo2?: { value: number; unit: '%'; source: string; status?: 'NORMAL' | 'LOW' | 'CRITICAL' };
  respiratory_rate?: { value: number; unit: 'breaths/min'; source: string; status?: 'NORMAL' | 'HIGH' };
}

export interface ExtractedLabValue {
  id: string;
  test: string;
  value: string;
  numericValue?: number;
  unit: string;
  referenceRange?: string;
  status: 'NORMAL' | 'ABNORMAL' | 'CRITICAL' | 'UNKNOWN';
  sourceDocument: string;
  page?: number;
  confidence: ExtractionConfidence;
  verifiedByHuman: boolean;
  notes?: string;
}

export interface SafetyFlag {
  id: string;
  flag: string;
  severity: 'URGENT' | 'PRIORITY' | 'ROUTINE';
  reason: string;
  evidence: string[];
  source: string;
  ruleId: string;
  requires_human_review: boolean;
}

export interface Contradiction {
  id: string;
  title: string;
  description: string;
  itemA: { source: string; statement: string };
  itemB: { source: string; statement: string };
  actionRequired: string;
}

export interface FollowUpQuestion {
  id: string;
  question: string;
  questionTranslated?: Record<string, string>;
  category: 'SYMPTOM_DETAIL' | 'VITALS' | 'HISTORY' | 'RED_FLAG_SCREEN';
  reason: string;
  answered: boolean;
  answer?: string;
}

export interface UploadedDocument {
  id: string;
  name: string;
  type: 'LAB_REPORT' | 'PRESCRIPTION' | 'VITALS_SLIP' | 'OTHER';
  fileData?: string; // base64 / data URL
  fileMime: string;
  extractedText?: string;
  ocrConfidence: ExtractionConfidence;
  uploadedAt: string;
}

export interface ReferralDraft {
  referralId: string;
  generatedAt: string;
  facilityFrom: string;
  facilityTo: string;
  patientId: string;
  presentingComplaint: string;
  relevantSymptoms: string[];
  timelineSummary: string;
  vitalsSummary: string;
  investigationsSummary: string;
  safetySignals: string[];
  missingInformation: string[];
  reasonForReferral: string;
  supportingDocuments: string[];
  status: 'DRAFT' | 'APPROVED';
  approvedBy?: string;
}

export type AuditOrigin = 'ONLINE' | 'OFFLINE';
export type AuditSyncStatus = 'PENDING' | 'SYNCING' | 'SYNCED' | 'SYNC_FAILED';

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  caseId: string;
  userRole: UserRole;
  actorId?: string;
  userId?: string;
  action: string;
  details: string;
  changes?: Record<string, any>;
  origin?: AuditOrigin;
  syncStatus?: AuditSyncStatus;
  syncedAt?: string;
  createdAt?: string;
  clientEventId?: string;
  retryCount?: number;
  lastError?: string;
}

export interface PatientCase {
  id: string;
  createdAt: string;
  updatedAt: string;
  language: SupportedLanguage;
  facility: string;
  consentGiven: boolean;
  consentTimestamp?: string;
  
  patient: {
    syntheticName: string;
    age: number | null;
    sex: 'M' | 'F' | 'OTHER' | null;
    contactNote?: string;
  };

  chief_complaint: string;
  originalStatement?: string;
  translatedStatement?: string;
  audioRecordingUrl?: string;
  audioRecordingId?: string;

  symptoms: Symptom[];
  timeline: TimelineEvent[];
  vitals: Vitals;
  medical_history: string[];
  medications: string[];
  allergies: string[];
  
  documents: UploadedDocument[];
  extracted_labs: ExtractedLabValue[];
  
  missing_information: string[];
  follow_up_questions: FollowUpQuestion[];
  safety_flags: SafetyFlag[];
  contradictions: Contradiction[];
  
  review_priority: ReviewPriority;
  case_status: CaseStatus;
  sync_status?: SyncStatus;
  pending_sync?: boolean;
  sync_error?: string;
  assignedReviewer?: string;

  ai_summary: {
    narrative: string;
    keyPoints: string[];
    suggestedFocus: string;
  };

  human_reviewer_notes?: string;
  reviewedAt?: string;
  reviewedBy?: string;

  referral_draft?: ReferralDraft | null;
  ai_disclaimer: string;
}
