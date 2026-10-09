import fs from 'fs';
import path from 'path';
import {
  PatientCase,
  AuditLogEntry,
  UserRole,
} from '../src/types/index.js';
import { evaluatePatientCaseSafety } from './safetyEngine.js';

const DATA_DIR = path.join(process.cwd(), '.data');
const AUDIT_FILE = path.join(DATA_DIR, 'audit_logs.json');

class CaseStore {
  private cases: Map<string, PatientCase> = new Map();
  private auditLogs: AuditLogEntry[] = [];

  constructor() {
    this.seedDemoCases();
    this.loadPersistedAuditLogs();
  }

  private persistAuditLogs(): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(AUDIT_FILE, JSON.stringify(this.auditLogs, null, 2), 'utf-8');
    } catch (err) {
      console.warn('Failed to persist audit logs to disk:', err);
    }
  }

  private loadPersistedAuditLogs(): boolean {
    try {
      if (fs.existsSync(AUDIT_FILE)) {
        const data = fs.readFileSync(AUDIT_FILE, 'utf-8');
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.auditLogs = parsed;
          return true;
        }
      }
    } catch (err) {
      console.warn('Failed to load persisted audit logs from disk:', err);
    }
    return false;
  }

  public getAllCases(): PatientCase[] {
    return Array.from(this.cases.values()).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  public getCaseById(id: string): PatientCase | undefined {
    return this.cases.get(id);
  }

  public saveCase(
    patientCase: PatientCase,
    actorRole: UserRole = 'PATIENT_WORKER',
    actionDesc = 'Case updated',
    actorId?: string
  ): PatientCase {
    // Re-evaluate deterministic safety rules and missing info
    const safetyResult = evaluatePatientCaseSafety(patientCase);
    patientCase.safety_flags = safetyResult.safetyFlags;
    patientCase.contradictions = safetyResult.contradictions;
    patientCase.missing_information = safetyResult.missingInformation;
    
    // Update review priority if not explicitly overridden by human
    if (patientCase.case_status === 'WAITING' || !patientCase.reviewedBy) {
      patientCase.review_priority = safetyResult.recommendedPriority;
    }

    patientCase.updatedAt = new Date().toISOString();
    this.cases.set(patientCase.id, patientCase);

    const actor = actorId || (actorRole === 'REVIEWER' ? 'DR_MED_OFFICER' : actorRole === 'ADMIN' ? 'SYSTEM_ADMIN' : 'ASHA_WORKER_01');

    this.addAuditLog({
      caseId: patientCase.id,
      userRole: actorRole,
      actorId: actor,
      userId: actor,
      action: actionDesc,
      details: `Case ${patientCase.id} updated. Priority: ${patientCase.review_priority}, Status: ${patientCase.case_status}`,
      origin: 'ONLINE',
      syncStatus: 'SYNCED',
    });

    return patientCase;
  }

  public addAuditLog(entry: Partial<AuditLogEntry> & { caseId: string; userRole: UserRole; action: string; details: string }): AuditLogEntry {
    const eventId = entry.id || entry.clientEventId || `LOG_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    
    // Idempotent deduplication check: do not duplicate events with identical ID or clientEventId
    const existing = this.auditLogs.find(
      (l) => l.id === eventId || (entry.clientEventId && l.clientEventId === entry.clientEventId)
    );
    if (existing) {
      return existing;
    }

    const actor = entry.actorId || entry.userId || (entry.userRole === 'REVIEWER' ? 'DR_MED_OFFICER' : entry.userRole === 'ADMIN' ? 'SYSTEM_ADMIN' : 'ASHA_WORKER_01');

    const log: AuditLogEntry = {
      id: eventId,
      clientEventId: entry.clientEventId || eventId,
      timestamp: entry.timestamp || new Date().toISOString(),
      createdAt: entry.createdAt || entry.timestamp || new Date().toISOString(),
      caseId: entry.caseId,
      userRole: entry.userRole,
      actorId: actor,
      userId: actor,
      action: entry.action,
      details: entry.details,
      changes: entry.changes,
      origin: entry.origin || 'ONLINE',
      syncStatus: 'SYNCED',
      syncedAt: entry.syncedAt || new Date().toISOString(),
      retryCount: entry.retryCount ?? 0,
      lastError: entry.lastError,
    };

    this.auditLogs.unshift(log);
    this.persistAuditLogs();
    return log;
  }

  public batchAddAuditLogs(entries: AuditLogEntry[]): { processed: number; added: number; syncedIds: string[] } {
    let addedCount = 0;
    const syncedIds: string[] = [];

    for (const entry of entries) {
      const eventId = entry.id || entry.clientEventId;
      if (!eventId) continue;

      const existingIndex = this.auditLogs.findIndex(
        (l) => l.id === eventId || (entry.clientEventId && l.clientEventId === entry.clientEventId)
      );

      if (existingIndex >= 0) {
        // Idempotent update: mark synced and acknowledge
        this.auditLogs[existingIndex].syncStatus = 'SYNCED';
        this.auditLogs[existingIndex].syncedAt = new Date().toISOString();
        syncedIds.push(eventId);
      } else {
        const actor = entry.actorId || entry.userId || (entry.userRole === 'REVIEWER' ? 'DR_MED_OFFICER' : 'ASHA_WORKER_01');
        const newLog: AuditLogEntry = {
          ...entry,
          id: eventId,
          clientEventId: entry.clientEventId || eventId,
          timestamp: entry.timestamp || new Date().toISOString(),
          createdAt: entry.createdAt || entry.timestamp || new Date().toISOString(),
          actorId: actor,
          userId: actor,
          origin: entry.origin || 'OFFLINE',
          syncStatus: 'SYNCED',
          syncedAt: new Date().toISOString(),
        };
        this.auditLogs.unshift(newLog);
        addedCount++;
        syncedIds.push(eventId);
      }
    }

    this.auditLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    this.persistAuditLogs();

    return {
      processed: entries.length,
      added: addedCount,
      syncedIds,
    };
  }

  public getAuditLogsForCase(caseId: string): AuditLogEntry[] {
    return this.auditLogs.filter(l => l.caseId === caseId);
  }

  public getAllAuditLogs(): AuditLogEntry[] {
    return this.auditLogs;
  }

  public seedDemoCases(): void {
    this.cases.clear();
    this.auditLogs = [];

    // Case C: Safety Signal (Dengue warning signs / Thrombocytopenia)
    const caseC: PatientCase = {
      id: 'PT-101',
      createdAt: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      facility: 'Balipatna Community Health Centre (CHC)',
      language: 'or',
      consentGiven: true,
      consentTimestamp: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
      patient: {
        syntheticName: 'Debendra Mohapatra (Synthetic Demo)',
        age: 34,
        sex: 'M',
        contactNote: 'Attended by ASHA Worker',
      },
      chief_complaint: 'Acute High Fever, Severe Retro-orbital Headache & Repeated Vomiting',
      originalStatement: 'ମୋତେ ୩ ଦିନ ହେଲା ପ୍ରବଳ ଜ୍ୱର ହେଉଛି। ଆଖି ପଛପଟେ ପ୍ରବଳ ଯନ୍ତ୍ରଣା ହେଉଛି ଏବଂ ଆଜି ୩ ଥର ବାନ୍ତି ହୋଇଛି। ହାତରେ ଲାଲ ଦାଗ ଦେଖାଯାଉଛି।',
      translatedStatement: 'I have had high fever for 3 days. Severe pain behind my eyes and vomited 3 times today. Small red spots (rash) have appeared on my arms.',
      symptoms: [
        {
          id: 'SYM_C1',
          name: 'High Fever',
          duration: '3 days',
          onset: 'Sudden onset',
          severity: 'SEVERE',
          source: 'PATIENT_VOICE',
          evidenceQuote: 'ମୋତେ ୩ ଦିନ ହେଲା ପ୍ରବଳ ଜ୍ୱର ହେଉଛି (High fever for 3 days)',
          confidence: 'HIGH',
        },
        {
          id: 'SYM_C2',
          name: 'Retro-orbital Headache',
          duration: '2 days',
          severity: 'SEVERE',
          source: 'PATIENT_VOICE',
          evidenceQuote: 'Severe pain behind eyes',
          confidence: 'HIGH',
        },
        {
          id: 'SYM_C3',
          name: 'Persistent Vomiting',
          duration: 'Today',
          severity: 'SEVERE',
          source: 'PATIENT_VOICE',
          evidenceQuote: 'Vomited 3 times today',
          confidence: 'HIGH',
        },
        {
          id: 'SYM_C4',
          name: 'Petechial rash / Red spots on arms',
          duration: 'Today',
          severity: 'SEVERE',
          source: 'PATIENT_STATEMENT',
          evidenceQuote: 'Small red spots have appeared on arms',
          confidence: 'HIGH',
        },
      ],
      timeline: [
        {
          id: 'TL_C1',
          timeframe: 'Day 1 (3 days ago)',
          description: 'Sudden onset of high-grade fever with intense chills.',
          source: 'Patient Audio Transcript',
          isApproximate: false,
        },
        {
          id: 'TL_C2',
          timeframe: 'Day 2 (2 days ago)',
          description: 'Development of severe retro-orbital headache and body aches.',
          source: 'Patient Statement',
          isApproximate: false,
        },
        {
          id: 'TL_C3',
          timeframe: 'Day 3 (Today morning)',
          description: '3 episodes of intractable vomiting; petechial rash observed on upper limbs.',
          source: 'ASHA Clinical Note',
          isApproximate: false,
        },
        {
          id: 'TL_C4',
          timeframe: 'Today (1 hr ago)',
          description: 'Point-of-care CBC processed at CHC lab.',
          source: 'Laboratory Report CBC_092.pdf',
          isApproximate: false,
        },
      ],
      vitals: {
        temperature: { value: 103.2, unit: 'F', source: 'CHC Triage Nurse', status: 'HIGH' },
        blood_pressure: { systolic: 102, diastolic: 68, source: 'CHC Triage Nurse', status: 'NORMAL' },
        heart_rate: { value: 110, unit: 'bpm', source: 'Pulse Oximeter', status: 'TACHYCARDIA' },
        spo2: { value: 96, unit: '%', source: 'Pulse Oximeter', status: 'NORMAL' },
        respiratory_rate: { value: 22, unit: 'breaths/min', source: 'Nurse Assessment', status: 'NORMAL' },
      },
      medical_history: ['No prior chronic illness'],
      medications: ['Paracetamol 650mg taken 4 hours ago'],
      allergies: ['No known drug allergies reported'],
      documents: [
        {
          id: 'DOC_C1',
          name: 'CHC_Lab_CBC_Report_092.pdf',
          type: 'LAB_REPORT',
          fileMime: 'application/pdf',
          extractedText: 'HEMOGLOBIN: 13.8 g/dL\nTOTAL LEUKOCYTES: 3,100 /µL (Low)\nPLATELET COUNT: 38,000 /µL (CRITICAL LOW - Ref: 150,000-450,000)\nHEMATOCRIT: 44%\nDate: Today 10:45 AM',
          ocrConfidence: 'HIGH',
          uploadedAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
        },
      ],
      extracted_labs: [
        {
          id: 'LAB_C1',
          test: 'Platelet Count',
          value: '38,000',
          numericValue: 38000,
          unit: '/µL',
          referenceRange: '150,000 - 450,000',
          status: 'CRITICAL',
          sourceDocument: 'CHC_Lab_CBC_Report_092.pdf',
          page: 1,
          confidence: 'HIGH',
          verifiedByHuman: false,
        },
        {
          id: 'LAB_C2',
          test: 'Total Leukocyte Count (WBC)',
          value: '3,100',
          numericValue: 3100,
          unit: '/µL',
          referenceRange: '4,000 - 11,000',
          status: 'ABNORMAL',
          sourceDocument: 'CHC_Lab_CBC_Report_092.pdf',
          page: 1,
          confidence: 'HIGH',
          verifiedByHuman: false,
        },
        {
          id: 'LAB_C3',
          test: 'Hemoglobin',
          value: '13.8',
          numericValue: 13.8,
          unit: 'g/dL',
          referenceRange: '13.0 - 17.0',
          status: 'NORMAL',
          sourceDocument: 'CHC_Lab_CBC_Report_092.pdf',
          page: 1,
          confidence: 'HIGH',
          verifiedByHuman: true,
        },
      ],
      missing_information: [
        'Urine output volume in past 12 hours not documented',
        'Warning signs of postural dizziness unverified',
      ],
      follow_up_questions: [
        {
          id: 'Q_C1',
          question: 'Have you noticed any bleeding from gums, nose, or black-colored stools?',
          category: 'RED_FLAG_SCREEN',
          reason: 'Screening for hemorrhagic manifestations given platelet count of 38,000 /µL.',
          answered: false,
        },
        {
          id: 'Q_C2',
          question: 'How many times have you passed urine since this morning?',
          category: 'SYMPTOM_DETAIL',
          reason: 'Assessing hydration and microvascular plasma leakage risk.',
          answered: false,
        },
      ],
      safety_flags: [
        {
          id: 'FLAG_C1',
          ruleId: 'LAB_THROMBOCYTOPENIA_CRITICAL',
          flag: 'Critical Thrombocytopenia Signal (Platelets 38,000 /µL)',
          severity: 'URGENT',
          reason: 'Platelet count is markedly below safe threshold (< 50,000 /µL). Presents severe risk of spontaneous bleeding.',
          evidence: ['Platelet count: 38,000 /µL extracted from CHC_Lab_CBC_Report_092.pdf'],
          source: 'Laboratory Report CBC_092.pdf',
          requires_human_review: true,
        },
        {
          id: 'FLAG_C2',
          ruleId: 'FEVER_ACUTE_WARNING_SIGNS',
          flag: 'Acute Febrile Illness with Warning Signs Signal',
          severity: 'URGENT',
          reason: 'Fever accompanied by persistent vomiting and petechial signs (endemic Dengue warning signals).',
          evidence: [
            'High fever (103.2°F)',
            'Reported 3 vomiting episodes today',
            'Petechial rash on upper limbs',
          ],
          source: 'Patient Audio Transcript & Clinical Vitals',
          requires_human_review: true,
        },
      ],
      contradictions: [],
      review_priority: 'URGENT',
      case_status: 'WAITING',
      ai_summary: {
        narrative: '34-year-old male with 3-day history of acute high-grade fever, severe retro-orbital headache, persistent vomiting, and petechiae. Laboratory report indicates severe thrombocytopenia (platelets 38,000/µL) and leukopenia (WBC 3,100/µL). Deterministic safety engine triggered URGENT human review.',
        keyPoints: [
          'Critical platelet count: 38,000 /µL requiring urgent hematologic/clinical monitoring.',
          'Active warning signs: persistent vomiting, high pyrexia (103.2°F), tachycardia (110 bpm).',
          'Urgent referral evaluation to District Hospital required if fluid balance or bleeding risk worsens.',
        ],
        suggestedFocus: 'Immediate physician evaluation, assess tourniquet sign/bleeding, verify intravenous fluid protocol, prepare District Hospital referral.',
      },
      ai_disclaimer: 'Advisory / Triage Support Only — Final assessment must be performed by a qualified healthcare professional.',
    };

    // Case B: Missing Information (Abdominal pain, vague history, triggers adaptive follow-up questions)
    const caseB: PatientCase = {
      id: 'PT-102',
      createdAt: new Date(Date.now() - 50 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
      facility: 'Primary Health Centre (PHC) Pipili',
      language: 'hi',
      consentGiven: true,
      consentTimestamp: new Date(Date.now() - 50 * 60 * 1000).toISOString(),
      patient: {
        syntheticName: 'Sunita Devi (Synthetic Demo)',
        age: 28,
        sex: 'F',
      },
      chief_complaint: 'Abdominal Pain & Nausea',
      originalStatement: 'पेट में दर्द है और जी मिचला रहा है। कुछ खाने का मन नहीं कर रहा।',
      translatedStatement: 'Having stomach pain and nausea. Do not feel like eating anything.',
      symptoms: [
        {
          id: 'SYM_B1',
          name: 'Abdominal Pain',
          duration: '', // Missing duration!
          severity: 'MODERATE',
          source: 'PATIENT_STATEMENT',
          confidence: 'HIGH',
        },
        {
          id: 'SYM_B2',
          name: 'Nausea / Loss of appetite',
          duration: '',
          severity: 'MILD',
          source: 'PATIENT_STATEMENT',
          confidence: 'HIGH',
        },
      ],
      timeline: [
        {
          id: 'TL_B1',
          timeframe: 'Recent (Approximate)',
          description: 'Onset of abdominal cramps and nausea.',
          source: 'Patient Statement',
          isApproximate: true,
        },
      ],
      vitals: {}, // Completely missing vitals!
      medical_history: [],
      medications: [],
      allergies: [],
      documents: [],
      extracted_labs: [],
      missing_information: [
        'Symptom duration not specified',
        'Specific abdominal pain quadrant / location not specified',
        'Temperature reading not recorded',
        'Blood pressure not measured / provided',
        'Pulse oximetry (SpO2) not recorded',
        'Current medication history not specified',
        'Drug allergy status not documented',
        'Pregnancy / LMP status not recorded (clinically relevant for acute abdominal pain in female of reproductive age)',
      ],
      follow_up_questions: [
        {
          id: 'Q_B1',
          question: 'Where exactly in your stomach is the pain (upper right, lower right, around the navel)?',
          category: 'SYMPTOM_DETAIL',
          reason: 'Crucial for discriminating appendicitis, cholecystitis, or gastritis.',
          answered: false,
        },
        {
          id: 'Q_B2',
          question: 'How many days or hours ago did this pain start, and did it come suddenly or gradually?',
          category: 'SYMPTOM_DETAIL',
          reason: 'Onset timeline missing from intake.',
          answered: false,
        },
        {
          id: 'Q_B3',
          question: 'When was your last menstrual period (LMP), and is there any chance of pregnancy?',
          category: 'HISTORY',
          reason: 'Essential clinical safety rule to rule out ectopic pregnancy.',
          answered: false,
        },
        {
          id: 'Q_B4',
          question: 'Do you have fever, vomiting, or burning sensation during urination?',
          category: 'RED_FLAG_SCREEN',
          reason: 'Screening for acute peritonitis, UTI, or pelvic inflammatory signals.',
          answered: false,
        },
      ],
      safety_flags: [
        {
          id: 'FLAG_B1',
          ruleId: 'ACUTE_ABDOMEN_SCREEN',
          flag: 'Acute Abdominal Discomfort Signal (Uncharacterized Quadrant)',
          severity: 'PRIORITY',
          reason: 'Uncharacterized acute abdominal pain in female of reproductive age requires focused physical palpation and vitals triage.',
          evidence: ['Patient reports acute abdominal pain with nausea.'],
          source: 'Patient Statement',
          requires_human_review: true,
        },
      ],
      contradictions: [],
      review_priority: 'PRIORITY',
      case_status: 'WAITING',
      ai_summary: {
        narrative: '28-year-old female presents with acute abdominal pain and nausea. Essential clinical fields (exact location, duration, vitals, LMP, allergy status) are missing. Adaptive question engine generated 4 targeted follow-up questions for the triage worker/patient.',
        keyPoints: [
          'Multiple critical triage variables missing (vitals, pain quadrant, duration).',
          'Targeted follow-up questions queued for healthcare worker.',
          'Assigned PRIORITY review pending physical vitals check.',
        ],
        suggestedFocus: 'Record complete vitals (BP, Temp, HR), palpate abdomen for guarding/rebound, obtain LMP history.',
      },
      ai_disclaimer: 'Advisory / Triage Support Only — Final assessment must be performed by a qualified healthcare professional.',
    };

    // Case A: Routine (Mild upper respiratory symptoms, complete info, normal vitals, routine priority)
    const caseA: PatientCase = {
      id: 'PT-103',
      createdAt: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      facility: 'NALCO Township Health Centre',
      language: 'en',
      consentGiven: true,
      consentTimestamp: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
      patient: {
        syntheticName: 'Rajesh Kumar Swain (Synthetic Demo)',
        age: 42,
        sex: 'M',
      },
      chief_complaint: 'Mild Rhinorrhea, Sneezing & Low-grade Sore Throat',
      originalStatement: 'I have had a runny nose and mild sore throat for 2 days. No breathing problems or high fever.',
      translatedStatement: 'I have had a runny nose and mild sore throat for 2 days. No breathing problems or high fever.',
      symptoms: [
        {
          id: 'SYM_A1',
          name: 'Rhinorrhea (Runny nose)',
          duration: '2 days',
          severity: 'MILD',
          source: 'PATIENT_STATEMENT',
          confidence: 'HIGH',
        },
        {
          id: 'SYM_A2',
          name: 'Sore throat',
          duration: '2 days',
          severity: 'MILD',
          source: 'PATIENT_STATEMENT',
          confidence: 'HIGH',
        },
      ],
      timeline: [
        {
          id: 'TL_A1',
          timeframe: 'Day 1 (2 days ago)',
          description: 'Mild nasal congestion and frequent sneezing began after travel.',
          source: 'Patient Statement',
          isApproximate: false,
        },
        {
          id: 'TL_A2',
          timeframe: 'Day 2 (Yesterday)',
          description: 'Mild scratchy throat sensation, able to swallow liquids and solid food normally.',
          source: 'Patient Statement',
          isApproximate: false,
        },
      ],
      vitals: {
        temperature: { value: 98.6, unit: 'F', source: 'Clinic Nurse', status: 'NORMAL' },
        blood_pressure: { systolic: 122, diastolic: 80, source: 'Digital Monitor', status: 'NORMAL' },
        heart_rate: { value: 74, unit: 'bpm', source: 'Pulse Oximeter', status: 'NORMAL' },
        spo2: { value: 99, unit: '%', source: 'Pulse Oximeter', status: 'NORMAL' },
        respiratory_rate: { value: 16, unit: 'breaths/min', source: 'Nurse', status: 'NORMAL' },
      },
      medical_history: ['No chronic medical illnesses'],
      medications: ['Steam inhalation only; no regular medications'],
      allergies: ['No known allergies (NKDA)'],
      documents: [],
      extracted_labs: [],
      missing_information: [],
      follow_up_questions: [
        {
          id: 'Q_A1',
          question: 'Are there any chest tightness, shortness of breath, or ear pain symptoms?',
          category: 'RED_FLAG_SCREEN',
          reason: 'Routine upper respiratory infection screening.',
          answered: true,
          answer: 'No breathing issues or ear pain.',
        },
      ],
      safety_flags: [],
      contradictions: [],
      review_priority: 'ROUTINE',
      case_status: 'WAITING',
      ai_summary: {
        narrative: '42-year-old male presenting with mild 2-day coryza and pharyngeal irritation. Vitals are completely within normal physiological limits (BP 122/80, SpO2 99%, Temp 98.6°F). No red flag respiratory signals identified.',
        keyPoints: [
          'Symptoms consistent with uncomplicated viral upper respiratory irritation.',
          'All vitals stable and normal.',
          'Assigned ROUTINE priority review.',
        ],
        suggestedFocus: 'Routine medical officer consultation, symptom relief guidance, red flag return precautions.',
      },
      ai_disclaimer: 'Advisory / Triage Support Only — Final assessment must be performed by a qualified healthcare professional.',
    };

    this.cases.set(caseC.id, caseC);
    this.cases.set(caseB.id, caseB);
    this.cases.set(caseA.id, caseA);

    this.addAuditLog({
      caseId: 'SYSTEM',
      userRole: 'ADMIN',
      action: 'SYSTEM_BOOTSTRAP',
      details: 'Synthetic demonstration datasets initialized (Case A Routine, Case B Missing Info, Case C Critical Dengue Signal).',
    });
  }
}

export const store = new CaseStore();
