import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { store } from './store.js';
import {
  extractClinicalInformation,
  processMultimodalAudio,
  transcribeAudioOnly,
  processDocumentOCR,
  generateReferralDraftNote,
  generateHandoffSummary,
} from './geminiService.js';
import { evaluatePatientCaseSafety } from './safetyEngine.js';
import { PatientCase, UserRole, SupportedLanguage } from '../src/types/index.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Support high payload size for base64 audio and document images
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ---------------------------------------------------------------------------
// REST APIs
// ---------------------------------------------------------------------------

// Dedicated Speech-to-Text endpoint using gemini-3.5-transcribe
app.post('/api/transcribe-audio', async (req, res) => {
  try {
    const { audioBase64, audioMime } = req.body;
    if (!audioBase64) {
      return res.status(400).json({ error: 'audioBase64 payload is required' });
    }
    const result = await transcribeAudioOnly(audioBase64, audioMime || 'audio/webm');
    res.json(result);
  } catch (err: any) {
    console.error('Audio transcription error:', err);
    res.status(500).json({ error: err.message || 'Failed to transcribe audio' });
  }
});

// 1. List cases
app.get('/api/cases', (req, res) => {
  try {
    const cases = store.getAllCases();
    res.json({ cases });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to list cases' });
  }
});

// 2. Get single case
app.get('/api/cases/:id', (req, res) => {
  try {
    const foundCase = store.getCaseById(req.params.id);
    if (!foundCase) {
      return res.status(404).json({ error: 'Case not found' });
    }
    res.json({ case: foundCase });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch case' });
  }
});

// 3. Create new case (Consent strictly checked)
app.post('/api/cases', (req, res) => {
  try {
    const { syntheticName, age, sex, language, facility, consentGiven } = req.body;

    if (!consentGiven) {
      return res.status(400).json({
        error: 'Explicit patient/health-worker consent is required before creating a case.',
      });
    }

    const newId = `PT-${Math.floor(100 + Math.random() * 900)}`;
    const newCase: PatientCase = {
      id: newId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      language: language || 'en',
      facility: facility || 'District Health Facility',
      consentGiven: true,
      consentTimestamp: new Date().toISOString(),
      patient: {
        syntheticName: syntheticName || `Patient ${newId}`,
        age: age !== undefined && age !== null && age !== '' ? parseInt(age, 10) : null,
        sex: sex || null,
      },
      chief_complaint: 'Awaiting symptom intake',
      symptoms: [],
      timeline: [],
      vitals: {},
      medical_history: [],
      medications: [],
      allergies: [],
      documents: [],
      extracted_labs: [],
      missing_information: [
        'Symptoms not yet provided',
        'Temperature not recorded',
        'Blood pressure not recorded',
      ],
      follow_up_questions: [],
      safety_flags: [],
      contradictions: [],
      review_priority: 'ROUTINE',
      case_status: 'WAITING',
      ai_summary: {
        narrative: 'New patient case registered. Awaiting symptom entry.',
        keyPoints: ['Case created and awaiting intake.'],
        suggestedFocus: 'Collect chief complaint, vitals, and relevant history.',
      },
      ai_disclaimer:
        'Advisory / Triage Support Only — Final assessment must be performed by a qualified healthcare professional.',
    };

    store.saveCase(newCase, 'PATIENT_WORKER', 'Case initialized with consent');
    res.status(201).json({ case: newCase });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create case' });
  }
});

// 4. Update case (Human Reviewer edits, overrides, notes)
app.put('/api/cases/:id', (req, res) => {
  try {
    const existing = store.getCaseById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Case not found' });
    }

    const updates = req.body;
    const actorRole: UserRole = updates.actorRole || 'REVIEWER';

    const updatedCase: PatientCase = {
      ...existing,
      ...updates,
      id: existing.id,
      updatedAt: new Date().toISOString(),
    };

    const saved = store.saveCase(updatedCase, actorRole, updates.actionDesc || 'Reviewer modified clinical triage details');
    res.json({ case: saved });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update case' });
  }
});

// 5. Multimodal intake processing (Text, Voice, or Document Image/PDF)
app.post('/api/cases/:id/process-intake', async (req, res) => {
  try {
    const existing = store.getCaseById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Case not found' });
    }

    const {
      inputType, // 'TEXT' | 'VOICE' | 'DOCUMENT'
      text,
      audioBase64,
      audioMime,
      docBase64,
      docMime,
      docName,
      language,
    } = req.body;

    let narrativeToExtract = '';
    let voiceDetails: any = null;

    if (inputType === 'VOICE' && audioBase64) {
      voiceDetails = await processMultimodalAudio(audioBase64, audioMime || 'audio/webm', language || existing.language);
      existing.originalStatement = voiceDetails.originalTranscript;
      existing.translatedStatement = voiceDetails.translatedText;
      narrativeToExtract = voiceDetails.translatedText || voiceDetails.originalTranscript;

      store.addAuditLog({
        caseId: existing.id,
        userRole: 'PATIENT_WORKER',
        action: 'VOICE_TRANSCRIPTION_COMPLETED',
        details: `Voice captured in ${voiceDetails.detectedLanguage}. Factual English translation generated.`,
      });
    } else if (inputType === 'TEXT' && text) {
      narrativeToExtract = text;
      existing.originalStatement = text;
      existing.translatedStatement = text;

      store.addAuditLog({
        caseId: existing.id,
        userRole: 'PATIENT_WORKER',
        action: 'TEXT_INTAKE_SUBMITTED',
        details: 'Patient symptom narrative submitted via text input.',
      });
    }

    // Process Document / OCR if provided
    if (docBase64 && docName) {
      const ocrResult = await processDocumentOCR(docBase64, docMime || 'image/jpeg', docName);
      const newDoc = {
        id: `DOC_${Date.now()}`,
        name: docName,
        type: (docName.toLowerCase().includes('cbc') || docName.toLowerCase().includes('lab') ? 'LAB_REPORT' : 'OTHER') as any,
        fileMime: docMime || 'image/jpeg',
        extractedText: ocrResult.extractedText,
        ocrConfidence: ocrResult.confidence,
        uploadedAt: new Date().toISOString(),
      };
      existing.documents.push(newDoc);

      // Append extracted labs
      existing.extracted_labs = [...existing.extracted_labs, ...ocrResult.labs];

      store.addAuditLog({
        caseId: existing.id,
        userRole: 'PATIENT_WORKER',
        action: 'DOCUMENT_OCR_COMPLETED',
        details: `Document "${docName}" processed. Extracted ${ocrResult.labs.length} test records with ${ocrResult.confidence} confidence.`,
      });
    }

    // If there is narrative text, run clinical structured extraction
    if (narrativeToExtract) {
      const extraction = await extractClinicalInformation({
        text: narrativeToExtract,
        language: (language as SupportedLanguage) || existing.language,
        existingCase: existing,
      });

      existing.chief_complaint = extraction.chief_complaint || existing.chief_complaint;
      
      // Merge or append symptoms
      if (extraction.symptoms && extraction.symptoms.length > 0) {
        existing.symptoms = extraction.symptoms;
      }

      // Merge timeline
      if (extraction.timeline && extraction.timeline.length > 0) {
        existing.timeline = extraction.timeline;
      }

      // Update vitals if extracted
      if (extraction.vitalsExtracted) {
        const v = extraction.vitalsExtracted;
        if (v.temperature !== undefined) {
          existing.vitals.temperature = {
            value: v.temperature,
            unit: v.tempUnit || 'F',
            source: 'Patient Reported',
            status: v.temperature >= 101 ? 'HIGH' : 'NORMAL',
          };
        }
        if (v.systolicBP !== undefined && v.diastolicBP !== undefined) {
          existing.vitals.blood_pressure = {
            systolic: v.systolicBP,
            diastolic: v.diastolicBP,
            source: 'Patient Reported',
            status: v.systolicBP >= 140 ? 'ELEVATED' : 'NORMAL',
          };
        }
        if (v.spo2 !== undefined) {
          existing.vitals.spo2 = {
            value: v.spo2,
            unit: '%',
            source: 'Patient Reported',
            status: v.spo2 < 94 ? 'LOW' : 'NORMAL',
          };
        }
      }

      if (extraction.medical_history && extraction.medical_history.length > 0) {
        existing.medical_history = Array.from(new Set([...existing.medical_history, ...extraction.medical_history]));
      }
      if (extraction.medications && extraction.medications.length > 0) {
        existing.medications = Array.from(new Set([...existing.medications, ...extraction.medications]));
      }
      if (extraction.allergies && extraction.allergies.length > 0) {
        existing.allergies = Array.from(new Set([...existing.allergies, ...extraction.allergies]));
      }

      // Follow up questions
      if (extraction.follow_up_questions && extraction.follow_up_questions.length > 0) {
        existing.follow_up_questions = extraction.follow_up_questions;
      }

      existing.ai_summary = {
        narrative: extraction.narrative_summary,
        keyPoints: extraction.key_points,
        suggestedFocus: extraction.suggested_focus,
      };
    }

    // Run deterministic safety & missing info evaluation
    const safetyResult = evaluatePatientCaseSafety(existing);
    existing.safety_flags = safetyResult.safetyFlags;
    existing.contradictions = safetyResult.contradictions;
    existing.missing_information = safetyResult.missingInformation;
    existing.review_priority = safetyResult.recommendedPriority;

    store.saveCase(existing, 'PATIENT_WORKER', 'Multimodal clinical intake processed');
    res.json({ case: existing });
  } catch (err: any) {
    console.error('Intake processing error:', err);
    res.status(500).json({ error: err.message || 'Failed to process intake' });
  }
});

// 6. Answer follow-up question
app.post('/api/cases/:id/answer-question', (req, res) => {
  try {
    const existing = store.getCaseById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Case not found' });
    }

    const { questionId, answer } = req.body;
    const targetQ = existing.follow_up_questions.find(q => q.id === questionId);
    if (!targetQ) {
      return res.status(404).json({ error: 'Question not found' });
    }

    targetQ.answered = true;
    targetQ.answer = answer;

    // Check if answer contains medication, allergy, or symptom details
    const lowerAns = answer.toLowerCase();
    if (targetQ.category === 'HISTORY') {
      if (lowerAns.includes('allergic to') || lowerAns.includes('allergy')) {
        existing.allergies.push(answer);
      } else if (lowerAns.includes('taking') || lowerAns.includes('medicine')) {
        existing.medications.push(answer);
      }
    }

    // Re-evaluate safety rules
    const safety = evaluatePatientCaseSafety(existing);
    existing.safety_flags = safety.safetyFlags;
    existing.missing_information = safety.missingInformation;
    existing.review_priority = safety.recommendedPriority;

    store.saveCase(existing, 'PATIENT_WORKER', `Follow-up question answered: "${targetQ.question.slice(0, 40)}..."`);
    res.json({ case: existing });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to record answer' });
  }
});

// 7. Verify / correct extracted lab value
app.post('/api/cases/:id/verify-lab', (req, res) => {
  try {
    const existing = store.getCaseById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Case not found' });
    }

    const { labId, verified, correctedValue, notes } = req.body;
    const lab = existing.extracted_labs.find(l => l.id === labId);
    if (!lab) {
      return res.status(404).json({ error: 'Lab item not found' });
    }

    lab.verifiedByHuman = verified ?? true;
    if (correctedValue !== undefined && correctedValue !== null) {
      lab.value = String(correctedValue);
      const parsedNum = parseFloat(String(correctedValue).replace(/,/g, ''));
      if (!isNaN(parsedNum)) {
        lab.numericValue = parsedNum;
      }
    }
    if (notes) {
      lab.notes = notes;
    }

    // Re-evaluate safety rules with corrected lab values
    const safety = evaluatePatientCaseSafety(existing);
    existing.safety_flags = safety.safetyFlags;
    existing.review_priority = safety.recommendedPriority;

    store.saveCase(existing, 'REVIEWER', `Healthcare reviewer verified lab value: ${lab.test} = ${lab.value} ${lab.unit}`);
    res.json({ case: existing });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to verify lab value' });
  }
});

// 8. Human reviewer approves final triage note
app.post('/api/cases/:id/approve', (req, res) => {
  try {
    const existing = store.getCaseById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Case not found' });
    }

    const { reviewerName, reviewerNotes, assignedReviewer } = req.body;
    existing.case_status = 'REVIEWED';
    existing.reviewedBy = reviewerName || 'Dr. Medical Officer';
    existing.reviewedAt = new Date().toISOString();
    if (reviewerNotes) {
      existing.human_reviewer_notes = reviewerNotes;
    }
    if (assignedReviewer) {
      existing.assignedReviewer = assignedReviewer;
    }

    store.saveCase(existing, 'REVIEWER', `Case approved and signed off by ${existing.reviewedBy}`);
    res.json({ case: existing });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to approve case' });
  }
});

// 9. Human reviewer escalates case
app.post('/api/cases/:id/escalate', (req, res) => {
  try {
    const existing = store.getCaseById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Case not found' });
    }

    const { reason, reviewerName } = req.body;
    existing.case_status = 'ESCALATED';
    existing.reviewedBy = reviewerName || 'Triage Officer';
    existing.reviewedAt = new Date().toISOString();
    existing.human_reviewer_notes = `[ESCALATED]: ${reason || 'Escalated for immediate senior physician / emergency attention.'}`;

    store.saveCase(existing, 'REVIEWER', `Case escalated: ${reason || 'Immediate escalation triggered'}`);
    res.json({ case: existing });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to escalate case' });
  }
});

// 10. Generate referral draft note
app.post('/api/cases/:id/referral', async (req, res) => {
  try {
    const existing = store.getCaseById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Case not found' });
    }

    const referralDraft = await generateReferralDraftNote(existing);
    if (req.body.facilityTo) {
      referralDraft.facilityTo = req.body.facilityTo;
    }
    if (req.body.reasonForReferral) {
      referralDraft.reasonForReferral = req.body.reasonForReferral;
    }

    existing.referral_draft = referralDraft;
    store.saveCase(existing, 'REVIEWER', 'Referral note draft compiled for human doctor approval');
    res.json({ referralDraft });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to draft referral' });
  }
});

// Batch synchronize offline audit events to durable server store
app.post('/api/audit-logs/batch', (req, res) => {
  try {
    const { events } = req.body;
    if (!Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ error: 'Array of audit events required' });
    }
    const result = store.batchAddAuditLogs(events);
    res.json({
      success: true,
      processedCount: result.processed,
      addedCount: result.added,
      syncedIds: result.syncedIds,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to batch process audit logs' });
  }
});

// Record sync audit events (success, failure, conflict) with idempotency and actor metadata
app.post('/api/cases/:id/audit-sync-log', (req, res) => {
  try {
    const { id, clientEventId, action, details, userRole, actorId, origin, timestamp } = req.body;
    const logged = store.addAuditLog({
      id: id || clientEventId,
      clientEventId: clientEventId || id,
      timestamp: timestamp || new Date().toISOString(),
      caseId: req.params.id,
      userRole: userRole || 'PATIENT_WORKER',
      actorId: actorId || (userRole === 'REVIEWER' ? 'DR_MED_OFFICER' : 'ASHA_WORKER_01'),
      action: action || 'FIREBASE_SYNC_EVENT',
      details: details || `Firebase sync event for case ${req.params.id}`,
      origin: origin || 'ONLINE',
      syncStatus: 'SYNCED',
    });
    res.json({ success: true, log: logged });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to log sync event' });
  }
});

// 11. Retrieve audit logs for case
app.get('/api/cases/:id/audit', (req, res) => {
  try {
    const logs = store.getAuditLogsForCase(req.params.id);
    res.json({ logs });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch audit logs' });
  }
});

// 12. Full institutional audit trail
app.get('/api/audit-logs', (req, res) => {
  try {
    const logs = store.getAllAuditLogs();
    res.json({ logs });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch audit logs' });
  }
});

// 13. System Metrics / Dashboard Stats
app.get('/api/stats', (req, res) => {
  try {
    const cases = store.getAllCases();
    const urgentCount = cases.filter(c => c.review_priority === 'URGENT').length;
    const priorityCount = cases.filter(c => c.review_priority === 'PRIORITY').length;
    const routineCount = cases.filter(c => c.review_priority === 'ROUTINE').length;
    const waitingCount = cases.filter(c => c.case_status === 'WAITING').length;
    const reviewedCount = cases.filter(c => c.case_status === 'REVIEWED').length;

    res.json({
      totalCases: cases.length,
      urgentCount,
      priorityCount,
      routineCount,
      waitingCount,
      reviewedCount,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch stats' });
  }
});

// 14. Reset / seed demo dataset
app.post('/api/demo/seed', (req, res) => {
  try {
    store.seedDemoCases();
    res.json({ success: true, message: 'Synthetic demo cases re-initialized successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to seed demo data' });
  }
});

// 15. Generate Handoff Summary
app.post('/api/cases/:id/generate-handoff', async (req, res) => {
  try {
    const existing = store.getCaseById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Case not found' });
    
    // Check if handoff already exists to avoid unnecessary calls unless requested
    const forceRegenerate = req.body?.forceRegenerate === true;
    if (existing.referral_draft && !forceRegenerate) {
       return res.json({ draft: existing.referral_draft });
    }

    const draft = await generateHandoffSummary(existing);
    
    existing.referral_draft = draft;
    store.saveCase(existing, 'REVIEWER', 'AI-assisted handoff summary drafted successfully using available evidence.');
    
    res.json({ draft });
  } catch (err: any) {
    console.error('Handoff API error:', err);
    res.status(500).json({ error: err.message || 'Failed to generate handoff summary' });
  }
});

// Export the Express app for Vercel Serverless
export default app;
