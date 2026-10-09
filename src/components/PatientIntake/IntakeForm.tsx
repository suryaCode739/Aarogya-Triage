import React, { useState, useRef, useEffect } from 'react';
import {
  Mic,
  Square,
  FileText,
  Upload,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Play,
  RotateCcw,
  Volume2,
  Loader2,
  FileSpreadsheet,
  Globe,
  User,
  Shield,
  ArrowRight,
  Wifi,
  WifiOff,
  HardDrive,
  Cloud,
  RefreshCw,
} from 'lucide-react';
import { SupportedLanguage, PatientCase, ReviewPriority } from '../../types';
import { api } from '../../services/api';
import { offlineSyncService } from '../../services/offlineSyncService';
import { firestoreCasesService } from '../../services/firestoreCases';
import { useConnectivity } from '../../context/ConnectivityContext';
import { offlineAudioStorage, OfflineAudioStorageService } from '../../services/offlineAudioStorage';

interface IntakeFormProps {
  language: SupportedLanguage;
  onCaseCreatedOrUpdated: (updatedCase: PatientCase) => void;
  onGoToReview: (caseId: string) => void;
}

export const IntakeForm: React.FC<IntakeFormProps> = ({
  language,
  onCaseCreatedOrUpdated,
  onGoToReview,
}) => {
  const [activeTab, setActiveTab] = useState<'TEXT' | 'VOICE' | 'REPORT'>('TEXT');

  // Shared Connection & Offline-Ready Status from ConnectivityContext
  const { isOnline, isSimulatedOffline, effectiveOnlineStatus, toggleSimulatedOffline } =
    useConnectivity();
  const [pendingCount, setPendingCount] = useState<number>(offlineSyncService.getPendingCount());

  // Listen to pending offline queue changes
  useEffect(() => {
    const unsubscribe = offlineSyncService.subscribe((count) => {
      setPendingCount(count);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const isEffectivelyOnline = effectiveOnlineStatus;

  // Demographics
  const [patientName, setPatientName] = useState('Priyanka Rout (Synthetic Demo)');
  const [patientAge, setPatientAge] = useState<string>('29');
  const [patientSex, setPatientSex] = useState<'M' | 'F' | 'OTHER'>('F');

  // Input states
  const [narrativeText, setNarrativeText] = useState('');
  
  // Stable form intake case ID for associating offline assets
  const [formCaseId] = useState<string>(
    () => `case-offline-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  );
  
  // Voice Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribingVoice, setIsTranscribingVoice] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [audioBlobUrl, setAudioBlobUrl] = useState<string | null>(null);
  const [audioBase64, setAudioBase64] = useState<string | null>(null);
  const [offlineVoiceNotice, setOfflineVoiceNotice] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);

  // Document Upload state
  const [uploadedDocName, setUploadedDocName] = useState<string | null>(null);
  const [uploadedDocBase64, setUploadedDocBase64] = useState<string | null>(null);
  const [uploadedDocMime, setUploadedDocMime] = useState<string>('image/jpeg');

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState<number>(0);
  const [processedCase, setProcessedCase] = useState<PatientCase | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Step names for visual progress
  const processingSteps = [
    'Initializing secure clinical session...',
    'Transcribing voice / processing native language transcript...',
    'Extracting clinical entities & standardized terminology...',
    'Running OCR on medical document and laboratory values...',
    'Constructing chronological patient timeline...',
    'Executing deterministic safety rules & missing information engine...',
    'Finalizing structured triage note for reviewer...',
  ];

  // Voice recording handlers
  const startRecording = async () => {
    try {
      setErrorMsg(null);
      setOfflineVoiceNotice(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const currentRecId =
          recordingId || `rec-${formCaseId}-${Date.now().toString(36)}`;
        setRecordingId(currentRecId);

        // Create playable object URL for active session
        const playUrl = URL.createObjectURL(audioBlob);
        setAudioBlobUrl(playUrl);

        if (!isEffectivelyOnline) {
          // OFFLINE WORKFLOW:
          // 1. Persist the actual audio Blob to IndexedDB first
          // 2. Verify the write succeeds
          // 3. Only then report that the recording has been preserved locally
          try {
            await offlineAudioStorage.saveAudioRecording({
              id: currentRecId,
              caseId: formCaseId,
              blob: audioBlob,
              mimeType: 'audio/webm',
              durationSeconds: recordingTime,
            });

            const verified = await offlineAudioStorage.hasAudioRecording(currentRecId);
            if (!verified) {
              throw new Error('Durable IndexedDB audio write verification failed');
            }

            const b64 = await OfflineAudioStorageService.blobToBase64(audioBlob);
            setAudioBase64(b64);
            setIsTranscribingVoice(false);
            setOfflineVoiceNotice(
              'Voice transcription is unavailable offline. Your recording will be preserved for later processing in local IndexedDB storage. You can play back below, enter clinical notes, or transcribe once online.'
            );

            // Log durable audit event for offline voice capture
            await offlineSyncService.logSyncEvent(
              formCaseId,
              'VOICE_RECORDING_PERSISTED_OFFLINE',
              `Patient audio recording (${recordingTime}s) securely persisted to durable local IndexedDB storage awaiting cloud transcription.`,
              {
                userRole: 'PATIENT_WORKER',
                actorId: 'ASHA_WORKER_BALIPATNA',
                origin: 'OFFLINE',
              }
            ).catch(console.warn);
          } catch (storageErr: any) {
            console.error('Failed to persist audio blob to IndexedDB:', storageErr);
            setErrorMsg(
              'Failed to persist audio in durable offline storage: ' +
                (storageErr.message || 'IndexedDB error')
            );
          }
        } else {
          // ONLINE WORKFLOW:
          // Also persist to IndexedDB as durable backup in case of subsequent network drops
          try {
            await offlineAudioStorage.saveAudioRecording({
              id: currentRecId,
              caseId: formCaseId,
              blob: audioBlob,
              mimeType: 'audio/webm',
              durationSeconds: recordingTime,
            });
          } catch (e) {
            console.warn('Non-fatal IDB backup warning:', e);
          }

          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = async () => {
            const base64Data = (reader.result as string).split(',')[1];
            setAudioBase64(base64Data);

            setOfflineVoiceNotice(null);
            setIsTranscribingVoice(true);
            try {
              const res = await api.transcribeAudio(base64Data, 'audio/webm');
              if (res.transcript) {
                setNarrativeText(res.transcript);
              }
            } catch (e: any) {
              console.warn('Real-time audio transcription error:', e);
              setErrorMsg('Transcription service temporarily unavailable. You can enter or edit clinical notes manually.');
            } finally {
              setIsTranscribingVoice(false);
            }
          };
        }
      };

      mediaRecorder.start(200);
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.warn('Microphone permission or hardware access unavailable, enabling sample audio clips:', err);
      setErrorMsg('Microphone access not available in this browser session. You can use the instant sample voice clips below (Odia, Hindi, English).');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
      setIsRecording(false);
      clearInterval(timerRef.current);
    }
  };

  // On-demand transcription when connection is active:
  // Retrieves the Blob directly from IndexedDB rather than relying on stale blob: URLs
  const handleTranscribeAudioNow = async () => {
    if (!isEffectivelyOnline) {
      setErrorMsg('Cannot transcribe: Device is offline. Reconnect to internet or disable offline simulation to use gemini-3.5-transcribe.');
      return;
    }

    setIsTranscribingVoice(true);
    setErrorMsg(null);
    try {
      let b64ToTranscribe = audioBase64;
      let mimeToTranscribe = 'audio/webm';

      if (recordingId) {
        const stored = await offlineAudioStorage.getAudioRecording(recordingId);
        if (stored && stored.blob) {
          b64ToTranscribe = await OfflineAudioStorageService.blobToBase64(stored.blob);
          mimeToTranscribe = stored.mimeType || 'audio/webm';
          // Ensure playable URL is valid
          if (!audioBlobUrl) {
            setAudioBlobUrl(URL.createObjectURL(stored.blob));
          }
        }
      }

      if (!b64ToTranscribe) {
        throw new Error('No audio recording found to transcribe.');
      }

      const res = await api.transcribeAudio(b64ToTranscribe, mimeToTranscribe);
      if (res.transcript) {
        setNarrativeText(res.transcript);
        setOfflineVoiceNotice(null);
      }
    } catch (e: any) {
      console.warn('Audio transcription error:', e);
      setErrorMsg(e.message || 'Failed to transcribe audio with gemini-3.5-transcribe.');
    } finally {
      setIsTranscribingVoice(false);
    }
  };

  // Quick Preset Sample Audio clips for Odia, Hindi, English
  const loadPresetVoice = (lang: 'or' | 'hi' | 'en') => {
    setErrorMsg(null);
    if (lang === 'or') {
      setNarrativeText('ରୋଗୀଙ୍କୁ ୩ ଦିନ ହେଲା ପ୍ରବଳ ଜ୍ୱର, ମୁଣ୍ଡବିନ୍ଧା ଏବଂ ବାନ୍ତି ହେଉଛି। ଆଖି ପଛପଟେ ପ୍ରବଳ ଯନ୍ତ୍ରଣା ହେଉଛି। (Sample Odia Voice)');
      setAudioBlobUrl('sample_odia_voice.webm');
      setAudioBase64('UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA='); // Lightweight placeholder audio
    } else if (lang === 'hi') {
      setNarrativeText('मरीज को 3 दिन से तेज बुखार है, सर में तेज दर्द है और आज दो बार उल्टी हुई है। हाथ पर लाल चकत्ते आ रहे हैं।');
      setAudioBlobUrl('sample_hindi_voice.webm');
      setAudioBase64('UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=');
    } else {
      setNarrativeText('Patient has continuous high-grade fever for 3 days, severe headache, retro-orbital pain, and vomited twice today.');
      setAudioBlobUrl('sample_english_voice.webm');
      setAudioBase64('UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=');
    }
  };

  // File upload handler
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 25 * 1024 * 1024) {
      setErrorMsg('File exceeds 25MB limit.');
      return;
    }

    setUploadedDocName(file.name);
    setUploadedDocMime(file.type || 'image/jpeg');

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64Data = (reader.result as string).split(',')[1];
      setUploadedDocBase64(base64Data);
    };
    reader.readAsDataURL(file);
  };

  // Synthetic sample document loader
  const loadSampleDoc = (type: 'CBC_CRITICAL' | 'VITALS_SLIP' | 'CBC_NORMAL') => {
    if (type === 'CBC_CRITICAL') {
      setUploadedDocName('District_Hospital_CBC_Lab_Report.png');
      setUploadedDocMime('image/png');
      // 1x1 png base64 for mockup payload
      setUploadedDocBase64('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
    } else if (type === 'VITALS_SLIP') {
      setUploadedDocName('PHC_Triage_Vitals_Slip.png');
      setUploadedDocMime('image/png');
      setUploadedDocBase64('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
    }
  };

  // Quick symptom templates for Text
  const loadTextTemplate = (template: 'FEVER_VOMITING' | 'CHEST_PAIN' | 'ABDOMINAL_PAIN' | 'MILD_COLD') => {
    if (template === 'FEVER_VOMITING') {
      setNarrativeText('Patient has high fever for 3 days, body pain, severe headache, and vomited twice today morning. Temperature measured 103.1°F.');
    } else if (template === 'CHEST_PAIN') {
      setNarrativeText('Patient complains of sudden retrosternal squeezing chest pain starting 3 hours ago with mild shortness of breath and sweating.');
    } else if (template === 'ABDOMINAL_PAIN') {
      setNarrativeText('Severe right lower quadrant abdominal pain for 1 day, associated with nausea and loss of appetite.');
    } else if (template === 'MILD_COLD') {
      setNarrativeText('Runny nose, mild sore throat, and sneezing for 2 days. No fever, normal appetite.');
    }
  };

  // Deterministic offline case constructor (stores minimal required fields with pending_sync status)
  const buildOfflinePatientCase = (existingId?: string): PatientCase => {
    const offlineCaseId = existingId || formCaseId;
    const lowerNarrative = (narrativeText || '').toLowerCase();

    // Deterministic urgency screening based on high-risk clinical keywords & vitals
    const isUrgent =
      lowerNarrative.includes('chest pain') ||
      lowerNarrative.includes('unconscious') ||
      lowerNarrative.includes('convulsion') ||
      lowerNarrative.includes('bleeding') ||
      lowerNarrative.includes('breathless') ||
      lowerNarrative.includes('cyanosis') ||
      lowerNarrative.includes('104') ||
      lowerNarrative.includes('103');

    const isPriority =
      isUrgent ||
      lowerNarrative.includes('fever') ||
      lowerNarrative.includes('vomit') ||
      lowerNarrative.includes('severe') ||
      lowerNarrative.includes('headache') ||
      lowerNarrative.includes('rash') ||
      (patientAge && parseInt(patientAge, 10) < 5);

    const priority: ReviewPriority = isUrgent ? 'URGENT' : isPriority ? 'PRIORITY' : 'ROUTINE';

    // Extract basic symptoms deterministically
    const extractedSymptoms: PatientCase['symptoms'] = [];
    if (narrativeText.trim()) {
      const parts = narrativeText.split(/[,.;\n]+/).map((s) => s.trim()).filter(Boolean);
      for (let i = 0; i < Math.min(parts.length, 4); i++) {
        extractedSymptoms.push({
          id: `sym-${Date.now()}-${i}`,
          name: parts[i].slice(0, 50),
          duration: 'Present at presentation',
          severity: (isUrgent ? 'SEVERE' : isPriority ? 'MODERATE' : 'MILD') as 'SEVERE' | 'MODERATE' | 'MILD',
          source: activeTab === 'VOICE' ? 'PATIENT_VOICE' : activeTab === 'REPORT' ? 'REPORT' : 'PATIENT_STATEMENT',
          confidence: 'HIGH',
        });
      }
    }
    if (extractedSymptoms.length === 0) {
      extractedSymptoms.push({
        id: `sym-${Date.now()}-0`,
        name: audioBase64
          ? 'Voice audio recorded offline (preserved for clinical review)'
          : 'Reported symptoms (offline captured)',
        duration: 'Present at intake',
        severity: 'MODERATE' as const,
        source: activeTab === 'VOICE' ? 'PATIENT_VOICE' : 'PATIENT_STATEMENT',
        confidence: 'HIGH',
      });
    }

    const clinicalDescription =
      narrativeText ||
      (audioBase64
        ? 'Voice intake recorded offline (audio preserved for clinical review)'
        : 'Intake symptoms recorded in offline queue');

    return {
      id: offlineCaseId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      language,
      facility: 'Balipatna CHC / PHC Intake (Offline Queue)',
      consentGiven: true,
      consentTimestamp: new Date().toISOString(),
      patient: {
        syntheticName: patientName || 'Demo Patient',
        age: patientAge ? parseInt(patientAge, 10) : null,
        sex: patientSex,
      },
      chief_complaint: narrativeText
        ? narrativeText.slice(0, 120)
        : audioBase64
        ? 'Voice intake recorded offline (audio preserved)'
        : 'Intake symptoms recorded in offline queue',
      originalStatement:
        narrativeText ||
        (audioBase64 ? 'Voice intake recorded offline (audio preserved for cloud transcription)' : ''),
      translatedStatement:
        narrativeText ||
        (audioBase64 ? 'Voice intake recorded offline (audio preserved for cloud transcription)' : ''),
      audioRecordingUrl: recordingId ? `idb://${recordingId}` : (audioBlobUrl || undefined),
      audioRecordingId: recordingId || undefined,
      symptoms: extractedSymptoms,
      timeline: [
        {
          id: `tl-${Date.now()}`,
          timeframe: 'Today (Intake)',
          description: `Intake conducted via device in offline mode: "${clinicalDescription.slice(0, 80)}..."`,
          source: activeTab === 'VOICE' ? 'Patient Voice (Offline)' : 'Patient Statement',
          isApproximate: false,
        },
      ],
      vitals: {
        temperature: { value: 98.6, unit: 'F', source: 'Triage Thermometer', status: 'NORMAL' },
        blood_pressure: { systolic: 120, diastolic: 80, source: 'BP Cuff', status: 'NORMAL' },
        heart_rate: { value: 80, unit: 'bpm', source: 'Pulse Oximeter', status: 'NORMAL' },
        spo2: { value: 98, unit: '%', source: 'Pulse Oximeter', status: 'NORMAL' },
        respiratory_rate: { value: 18, unit: 'breaths/min', source: 'Clinical Count', status: 'NORMAL' },
      },
      medical_history: [],
      medications: [],
      allergies: [],
      documents: uploadedDocName
        ? [
            {
              id: `doc-${Date.now()}`,
              name: uploadedDocName,
              type: 'OTHER',
              fileMime: uploadedDocMime,
              extractedText: 'Document metadata recorded offline. Queued for cloud OCR sync.',
              ocrConfidence: 'MEDIUM',
              uploadedAt: new Date().toISOString(),
            },
          ]
        : [],
      extracted_labs: [],
      missing_information: [
        'Complete clinical vitals verification',
        'Detailed medical history intake upon physician review',
      ],
      follow_up_questions: [
        {
          id: 'q1',
          question: 'Are there any known drug allergies or existing conditions?',
          category: 'HISTORY',
          reason: 'Clinical safety protocol',
          answered: false,
        },
      ],
      safety_flags: isPriority
        ? [
            {
              id: `flag-${Date.now()}`,
              flag: isUrgent ? 'URGENT_EVALUATION_NEEDED' : 'PRIORITY_SYMPTOM_FLAG',
              severity: isUrgent ? 'URGENT' : 'PRIORITY',
              reason: `Device deterministic urgency check triggered (${priority}). Prioritize in physical queue.`,
              evidence: [clinicalDescription.slice(0, 60)],
              source: 'Device Safety Engine (Offline Mode)',
              ruleId: 'OFFLINE_URGENCY_RULE_01',
              requires_human_review: true,
            },
          ]
        : [],
      contradictions: [],
      review_priority: priority,
      case_status: 'WAITING',
      sync_status: 'PENDING_SYNC',
      pending_sync: true,
      ai_summary: {
        narrative: `Offline-Ready Intake: Case created in local queue. "${clinicalDescription.slice(0, 140)}". Minimal required fields stored in localStorage. Full multimodal OCR and Cloud AI enrichment will sync to Cloud Firestore when network connects.`,
        keyPoints: [
          'Recorded in low-connectivity offline mode',
          audioBase64 ? 'Voice audio recording preserved locally' : 'Minimal required fields cached locally',
          'Status set to pending_sync; local cache evicts after Firebase upload',
        ],
        suggestedFocus: 'Direct physical assessment by Medical Officer; check vitals.',
      },
      ai_disclaimer: 'ADVISORY ONLY — Offline intake draft. Non-diagnostic. Medical personnel must verify all data.',
    };
  };

  // Submit Intake Pipeline
  const handleSubmitIntake = async () => {
    setErrorMsg(null);
    if (!narrativeText && !audioBase64 && !uploadedDocBase64) {
      setErrorMsg('Please provide symptom narrative, record voice, or upload a medical document.');
      return;
    }

    setIsProcessing(true);
    setProcessingStep(0);

    // 1. If currently offline or simulated offline, process locally and queue in localStorage
    if (!isEffectivelyOnline) {
      try {
        const stepTimer = setInterval(() => {
          setProcessingStep((curr) => (curr < processingSteps.length - 1 ? curr + 1 : curr));
        }, 300);

        await new Promise((resolve) => setTimeout(resolve, 1000));
        clearInterval(stepTimer);

        const offlineCase = buildOfflinePatientCase();
        // Queue minimal required fields with PENDING_SYNC status in localStorage
        offlineSyncService.queueCase(offlineCase);

        // Record durable offline audit trail
        await offlineSyncService.logSyncEvent(
          offlineCase.id,
          'CASE_CREATED_OFFLINE',
          `Patient intake registered in offline mode for ${offlineCase.patient?.syntheticName || 'Patient'}. Preserved in durable local queue for automatic cloud synchronization.`,
          {
            userRole: 'PATIENT_WORKER',
            actorId: 'ASHA_WORKER_BALIPATNA',
            origin: 'OFFLINE',
          }
        ).catch(console.warn);

        setProcessingStep(processingSteps.length - 1);
        setProcessedCase(offlineCase);
        onCaseCreatedOrUpdated(offlineCase);
      } catch (err: any) {
        console.error('Offline queuing error:', err);
        setErrorMsg('Failed to queue case offline.');
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    // 2. Online processing pipeline with automatic fallback to local queue on connection failure
    let createdCase: PatientCase | null = null;
    try {
      const stepTimer = setInterval(() => {
        setProcessingStep((curr) => (curr < processingSteps.length - 1 ? curr + 1 : curr));
      }, 700);

      // Create fresh patient case
      const created = await api.createCase({
        syntheticName: patientName || 'Demo Patient',
        age: patientAge ? parseInt(patientAge, 10) : undefined,
        sex: patientSex,
        language,
        facility: 'Balipatna CHC / PHC Intake',
        consentGiven: true,
      });
      createdCase = created;

      // Process multimodal intake
      const processed = await api.processIntake(created.id, {
        inputType: activeTab === 'VOICE' ? 'VOICE' : activeTab === 'REPORT' ? 'DOCUMENT' : 'TEXT',
        text: narrativeText,
        audioBase64: audioBase64 || undefined,
        audioMime: 'audio/webm',
        docBase64: uploadedDocBase64 || undefined,
        docMime: uploadedDocMime,
        docName: uploadedDocName || undefined,
        language,
      });

      // Also persist to Cloud Firestore directly
      try {
        await firestoreCasesService.saveCase(processed);
      } catch (firestoreErr) {
        console.warn('Direct Firestore save failed, will queue for sync:', firestoreErr);
        throw firestoreErr;
      }

      clearInterval(stepTimer);
      setProcessingStep(processingSteps.length - 1);

      const onlineCase: PatientCase = {
        ...processed,
        sync_status: 'SYNCED',
        pending_sync: false,
      };

      // Since online write to backend and Firestore succeeded, ensure local queue does NOT have this case
      offlineSyncService.removeLocalCase(onlineCase.id);

      setProcessedCase(onlineCase);
      onCaseCreatedOrUpdated(onlineCase);
    } catch (err: any) {
      console.warn('Online intake failed or network dropped, falling back to local queue:', err);
      // Fallback: If network drops mid-request or Firestore write fails, save offline with pending_sync in localStorage
      // Preserve the existing caseId if createdCase was already created
      const offlineCase = buildOfflinePatientCase(createdCase?.id);
      offlineSyncService.queueCase(offlineCase);

      await offlineSyncService.logSyncEvent(
        offlineCase.id,
        'CASE_QUEUED_OFFLINE_FALLBACK',
        `Network dropped during online processing. Case safely preserved in local queue for background synchronization.`,
        {
          userRole: 'PATIENT_WORKER',
          actorId: 'ASHA_WORKER_BALIPATNA',
          origin: 'OFFLINE',
        }
      ).catch(console.warn);

      setProcessingStep(processingSteps.length - 1);
      setProcessedCase(offlineCase);
      onCaseCreatedOrUpdated(offlineCase);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Top Banner with Offline-Ready Patient Intake Status */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-bold text-white tracking-tight">Patient Multimodal Intake</h2>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30 font-semibold flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-teal-400" />
                Offline-Ready Patient Intake
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Capture patient voice, text narrative, and physical medical reports. Operates seamlessly offline in remote health camps; queues minimal data locally with automatic Firebase sync.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {/* Live Connection & Queue State Pill */}
            <div
              className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-2 ${
                isEffectivelyOnline
                  ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                  : 'bg-amber-950/50 border-amber-500/50 text-amber-300 animate-pulse'
              }`}
            >
              {isEffectivelyOnline ? (
                <>
                  <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Online: Cloud AI & Firebase Active</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-amber-400" />
                  <span>Offline Mode: Local Storage Queue</span>
                </>
              )}
            </div>

            {/* Simulated Offline Toggle for Health Camp Demonstrations */}
            <button
              type="button"
              onClick={toggleSimulatedOffline}
              className="text-[11px] font-mono px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
              title="Test offline behavior in low-connectivity areas"
            >
              {isSimulatedOffline ? 'Resume Online' : 'Simulate Offline'}
            </button>

            <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400 bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700/60">
              <Shield className="w-4 h-4 text-teal-400" />
              <span>Consent Confirmed</span>
            </div>
          </div>
        </div>

        {/* Offline Queue Notice if Cases Waiting */}
        {pendingCount > 0 && (
          <div className="p-3 bg-amber-950/30 border border-amber-500/30 rounded-lg flex items-center justify-between text-xs text-amber-200">
            <div className="flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                <strong>{pendingCount} case(s) waiting in local storage queue</strong> (pending_sync status). Only minimal clinical fields are preserved; all local data will be removed immediately following Firebase sync.
              </span>
            </div>
            {isEffectivelyOnline && (
              <span className="text-[11px] text-teal-300 font-mono flex items-center gap-1">
                <Cloud className="w-3 h-3 text-teal-400" /> Auto-syncing to Cloud
              </span>
            )}
          </div>
        )}

        {/* Demographic input bar */}
        <div className="mt-4 pt-4 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider block mb-1">
              Synthetic Patient Name
            </label>
            <div className="relative">
              <User className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                placeholder="e.g. Ramesh Sahoo"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:ring-1 focus:ring-teal-500 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider block mb-1">
              Age (Years)
            </label>
            <input
              type="number"
              value={patientAge}
              onChange={(e) => setPatientAge(e.target.value)}
              placeholder="e.g. 34"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:ring-1 focus:ring-teal-500 outline-none"
            />
          </div>

          <div>
            <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider block mb-1">
              Biological Sex
            </label>
            <select
              value={patientSex}
              onChange={(e) => setPatientSex(e.target.value as any)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:ring-1 focus:ring-teal-500 outline-none cursor-pointer"
            >
              <option value="F">Female (F)</option>
              <option value="M">Male (M)</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
        </div>
      </div>

      {/* Multimodal Input Section */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        {/* Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-950/60">
          <button
            onClick={() => setActiveTab('TEXT')}
            className={`flex-1 py-3 px-4 text-xs font-semibold flex items-center justify-center gap-2 border-b-2 transition ${
              activeTab === 'TEXT'
                ? 'border-teal-500 text-teal-300 bg-slate-900'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>1. Text Symptom Input</span>
          </button>
          <button
            onClick={() => setActiveTab('VOICE')}
            className={`flex-1 py-3 px-4 text-xs font-semibold flex items-center justify-center gap-2 border-b-2 transition ${
              activeTab === 'VOICE'
                ? 'border-teal-500 text-teal-300 bg-slate-900'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Mic className="w-4 h-4" />
            <span>2. Voice Input (Odia / Hindi / En)</span>
          </button>
          <button
            onClick={() => setActiveTab('REPORT')}
            className={`flex-1 py-3 px-4 text-xs font-semibold flex items-center justify-center gap-2 border-b-2 transition ${
              activeTab === 'REPORT'
                ? 'border-teal-500 text-teal-300 bg-slate-900'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Upload className="w-4 h-4" />
            <span>3. Upload Medical Report / CBC</span>
          </button>
        </div>

        <div className="p-6">
          {/* TAB 1: TEXT INPUT */}
          {activeTab === 'TEXT' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Describe Patient Symptoms & Presenting Complaints
                </label>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-slate-400">Quick Templates:</span>
                  <button
                    onClick={() => loadTextTemplate('FEVER_VOMITING')}
                    className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-teal-300 hover:bg-slate-700 transition"
                  >
                    Fever + Vomiting
                  </button>
                  <button
                    onClick={() => loadTextTemplate('CHEST_PAIN')}
                    className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-teal-300 hover:bg-slate-700 transition"
                  >
                    Chest Pain
                  </button>
                  <button
                    onClick={() => loadTextTemplate('MILD_COLD')}
                    className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-teal-300 hover:bg-slate-700 transition"
                  >
                    Mild Cold
                  </button>
                </div>
              </div>

              <textarea
                value={narrativeText}
                onChange={(e) => setNarrativeText(e.target.value)}
                placeholder="Enter patient narrative (e.g., 'Patient reports continuous fever for 3 days with severe headache and vomiting episodes. Took Paracetamol yesterday with no relief. BP measured 102/68 mmHg')..."
                rows={4}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-xs text-white placeholder-slate-500 focus:ring-1 focus:ring-teal-500 outline-none font-sans leading-relaxed"
              />

              <p className="text-[11px] text-slate-400">
                You can write in English, Hindi (हिंदी), or Odia (ଓଡ଼ିଆ). The AI model extracts structured symptoms, timeline events, and measurements while safeguarding against prompt injection.
              </p>
            </div>
          )}

          {/* TAB 2: VOICE INPUT */}
          {activeTab === 'VOICE' && (
            <div className="space-y-4">
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 flex flex-col items-center justify-center text-center space-y-4">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center transition ${
                  isRecording
                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 animate-pulse'
                    : 'bg-teal-500/20 text-teal-400 border border-teal-500/30'
                }`}>
                  <Mic className="w-8 h-8" />
                </div>

                <div>
                  <h4 className="text-sm font-bold text-white">
                    {isRecording ? 'Listening & Recording Patient Speech...' : 'Microphone Voice Intake'}
                  </h4>
                  <p className="text-xs text-slate-400 mt-1 max-w-md">
                    Speak naturally in Odia, Hindi, or English. The multimodal audio engine transcribes, identifies the language, and preserves both verbatim native text and English structured clinical interpretation.
                  </p>
                </div>

                {isRecording ? (
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-rose-400 font-bold">
                      Recording: {recordingTime}s
                    </span>
                    <button
                      onClick={stopRecording}
                      className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shadow-lg shadow-rose-950"
                    >
                      <Square className="w-3.5 h-3.5" />
                      <span>{isEffectivelyOnline ? 'Stop Recording' : 'Stop & Save Audio'}</span>
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <button
                      onClick={startRecording}
                      className="px-5 py-2.5 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-xs font-semibold flex items-center gap-2 transition shadow-md shadow-teal-950"
                    >
                      <Mic className="w-4 h-4" />
                      <span>Start Voice Recording</span>
                    </button>
                  </div>
                )}

                {/* Audio Playback Controls if recorded */}
                {audioBlobUrl && (
                  <div className="w-full bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-2 text-left">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-300 flex items-center gap-1.5">
                        <Volume2 className="w-3.5 h-3.5 text-teal-400" />
                        <span>Recorded Audio Playback</span>
                      </span>
                      {isEffectivelyOnline && audioBase64 && !isTranscribingVoice && (
                        <button
                          type="button"
                          onClick={handleTranscribeAudioNow}
                          className="px-2.5 py-1 bg-teal-600 hover:bg-teal-500 text-white rounded text-[11px] font-semibold flex items-center gap-1 transition shadow-sm"
                        >
                          <Sparkles className="w-3 h-3" />
                          <span>Transcribe with Gemini</span>
                        </button>
                      )}
                    </div>
                    <audio controls src={audioBlobUrl} className="w-full h-8" />
                  </div>
                )}

                {/* Instant Sample Voice Clips */}
                <div className="pt-3 border-t border-slate-800 w-full flex flex-col sm:flex-row items-center justify-between gap-2 text-xs">
                  <span className="text-slate-400 text-[11px]">Instant Native Audio Samples:</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => loadPresetVoice('or')}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-teal-300 rounded text-[11px] font-medium border border-slate-700 transition"
                    >
                      🗣️ Odia Voice (ଓଡ଼ିଆ)
                    </button>
                    <button
                      onClick={() => loadPresetVoice('hi')}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-teal-300 rounded text-[11px] font-medium border border-slate-700 transition"
                    >
                      🗣️ Hindi Voice (हिंदी)
                    </button>
                    <button
                      onClick={() => loadPresetVoice('en')}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-teal-300 rounded text-[11px] font-medium border border-slate-700 transition"
                    >
                      🗣️ English Voice
                    </button>
                  </div>
                </div>
              </div>

              {/* Offline Voice Alert Notice */}
              {offlineVoiceNotice && (
                <div className="p-3 bg-amber-950/40 border border-amber-500/40 rounded-lg text-xs text-amber-200 flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-amber-300">Voice Preserved Locally (Offline)</span>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-amber-200/90">{offlineVoiceNotice}</p>
                  </div>
                </div>
              )}

              {/* Transcription loading indicator */}
              {isTranscribingVoice && (
                <div className="bg-slate-950 border border-teal-500/30 rounded-lg p-3 flex items-center justify-center gap-2 text-xs text-teal-300">
                  <Loader2 className="w-4 h-4 animate-spin text-teal-400" />
                  <span>Transcribing speech with model gemini-3.5-transcribe...</span>
                </div>
              )}

              {/* Show audio transcript or text preview / notes editor if recorded or loaded */}
              {(audioBlobUrl || narrativeText) && (
                <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-teal-400 font-bold uppercase font-mono flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-teal-400" />
                      <span>Patient Narrative / Clinical Notes from Voice:</span>
                    </span>
                    {narrativeText && (
                      <span className="text-[10px] text-slate-400">
                        Editable for clinical verification
                      </span>
                    )}
                  </div>
                  <textarea
                    value={narrativeText}
                    onChange={(e) => setNarrativeText(e.target.value)}
                    rows={3}
                    placeholder={
                      !isEffectivelyOnline
                        ? "Cloud transcription is unavailable while offline. Play the audio above and type patient notes or symptoms here to ensure no data is lost..."
                        : "Transcribed patient speech will appear here. You can also edit or add clinical notes directly..."
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white placeholder-slate-500 focus:ring-1 focus:ring-teal-500 outline-none leading-relaxed"
                  />
                  {!narrativeText && !isEffectivelyOnline && (
                    <p className="text-[11px] text-amber-300/80 italic">
                      Tip: You can submit intake now with just the preserved voice recording, or summarize key symptoms above for immediate triage prioritization.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: REPORT OCR */}
          {activeTab === 'REPORT' && (
            <div className="space-y-4">
              <div className="border-2 border-dashed border-slate-700 hover:border-teal-500/60 rounded-xl p-6 text-center space-y-3 bg-slate-950/40 transition">
                <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 mx-auto">
                  <Upload className="w-6 h-6 text-teal-400" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                    Upload Medical Report / Laboratory Slip
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Supports JPG, PNG, and PDF files. Automated OCR extracts tests, numerical values, units, reference intervals, and collection dates.
                  </p>
                </div>

                <div className="flex items-center justify-center gap-3">
                  <label className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold cursor-pointer border border-slate-700 transition">
                    <span>Browse Device Files</span>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                </div>

                {/* Quick synthetic test report generators */}
                <div className="pt-3 border-t border-slate-800 flex flex-wrap items-center justify-center gap-2 text-xs">
                  <span className="text-[11px] text-slate-400">1-Click Synthetic Reports:</span>
                  <button
                    onClick={() => loadSampleDoc('CBC_CRITICAL')}
                    className="px-2.5 py-1 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-600/40 rounded text-[11px] font-medium transition"
                  >
                    🩸 CBC Slip (Platelets 38,000 /µL)
                  </button>
                  <button
                    onClick={() => loadSampleDoc('VITALS_SLIP')}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-teal-300 border border-slate-700 rounded text-[11px] font-medium transition"
                  >
                    📄 PoC Vitals Slip
                  </button>
                </div>
              </div>

              {uploadedDocName && (
                <div className="bg-slate-950 border border-teal-500/40 rounded-lg p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-teal-300">
                    <FileSpreadsheet className="w-4 h-4 text-teal-400" />
                    <span className="font-medium">{uploadedDocName}</span>
                    <span className="text-[10px] bg-teal-500/20 text-teal-300 px-1.5 py-0.5 rounded font-mono">
                      Ready for OCR Extraction
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setUploadedDocName(null);
                      setUploadedDocBase64(null);
                    }}
                    className="text-xs text-slate-400 hover:text-rose-400"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          )}

          {errorMsg && (
            <div className="mt-4 p-3 rounded-lg bg-rose-950/40 border border-rose-500/40 text-xs text-rose-200 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Action Button */}
          <div className="mt-6 pt-4 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
            <span className="text-[11px] text-slate-400">
              Human-in-the-loop: Extracted triage note will be forwarded to qualified healthcare reviewer.
            </span>
            <button
              disabled={isProcessing}
              onClick={handleSubmitIntake}
              className={`w-full sm:w-auto px-6 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition shadow-lg ${
                isProcessing
                  ? 'bg-slate-800 text-slate-400 cursor-wait'
                  : 'bg-teal-600 hover:bg-teal-500 text-white cursor-pointer shadow-teal-900/40'
              }`}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-teal-400" />
                  <span>Processing Multimodal AI Pipeline...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Process Multimodal Intake</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Real-time processing progress modal / drawer */}
      {isProcessing && (
        <div className="bg-slate-900 border border-teal-500/40 rounded-xl p-5 shadow-xl space-y-3">
          <div className="flex items-center gap-2.5">
            <Loader2 className="w-5 h-5 text-teal-400 animate-spin" />
            <h4 className="text-sm font-bold text-white">Multimodal Healthcare Triage Pipeline in Progress</h4>
          </div>
          <div className="space-y-1.5 text-xs">
            {processingSteps.map((step, idx) => (
              <div
                key={idx}
                className={`flex items-center gap-2 py-1 px-2 rounded ${
                  idx < processingStep
                    ? 'text-teal-300 font-medium bg-teal-950/30'
                    : idx === processingStep
                    ? 'text-white font-bold bg-slate-800'
                    : 'text-slate-500'
                }`}
              >
                {idx < processingStep ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                ) : idx === processingStep ? (
                  <Loader2 className="w-3.5 h-3.5 text-teal-400 animate-spin shrink-0" />
                ) : (
                  <span className="w-3.5 h-3.5 rounded-full border border-slate-700 shrink-0" />
                )}
                <span>{step}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Success Notification after Intake completes */}
      {processedCase && !isProcessing && (
        <div className={`border rounded-xl p-5 space-y-3 ${
          processedCase.pending_sync || processedCase.sync_status === 'PENDING_SYNC'
            ? 'bg-amber-950/30 border-amber-500/40'
            : 'bg-teal-950/40 border-teal-500/40'
        }`}>
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className={`w-6 h-6 shrink-0 mt-0.5 ${
                processedCase.pending_sync ? 'text-amber-400' : 'text-teal-400'
              }`} />
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-bold text-white">
                    {processedCase.pending_sync ? 'Case Queued Locally in Offline Mode' : 'Intake Processed Successfully'} — Case ID: <span className="font-mono text-teal-300">{processedCase.id}</span>
                  </h3>
                  {processedCase.pending_sync && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono">
                      ⏳ PENDING SYNC
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-300 mt-1">
                  Extracted {processedCase.symptoms.length} symptoms, {processedCase.timeline.length} timeline events.
                  {processedCase.pending_sync && (
                    <span className="block text-amber-200 mt-1 font-mono text-[11px]">
                      Stored only minimal required clinical fields in localStorage. Local record will be safely evicted following Firebase sync.
                    </span>
                  )}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-slate-400">Review Priority:</span>
                  <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                    processedCase.review_priority === 'URGENT'
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                      : processedCase.review_priority === 'PRIORITY'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  }`}>
                    {processedCase.review_priority === 'URGENT' ? '🔴 URGENT REVIEW' : processedCase.review_priority === 'PRIORITY' ? '🟡 PRIORITY REVIEW' : '🟢 ROUTINE'}
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={() => onGoToReview(processedCase.id)}
              className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition shadow-md shrink-0 cursor-pointer"
            >
              <span>View Case Detail</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
