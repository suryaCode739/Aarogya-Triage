import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  ShieldAlert,
  AlertTriangle,
  Clock,
  Calendar,
  Activity,
  FileText,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  FileSpreadsheet,
  Edit3,
  Check,
  X,
  Send,
  Building2,
  User,
  History,
  Sparkles,
  Printer,
  ChevronDown,
  ChevronUp,
  Volume2,
  Loader2,
  Mic,
} from 'lucide-react';
import {
  PatientCase,
  SafetyFlag,
  ExtractedLabValue,
  ReferralDraft,
  AuditLogEntry,
  Contradiction,
} from '../../types';
import { api } from '../../services/api';
import { WhyFlaggedModal } from '../Modals/WhyFlaggedModal';
import { ReferralDraftModal } from '../Modals/ReferralDraftModal';
import { ContradictionModal } from '../Modals/ContradictionModal';
import { useConnectivity } from '../../context/ConnectivityContext';
import {
  offlineAudioStorage,
  OfflineAudioStorageService,
  StoredAudioRecording,
} from '../../services/offlineAudioStorage';
import { offlineAuditStorage } from '../../services/offlineAuditStorage';

interface CaseDetailViewProps {
  patientCase: PatientCase;
  onBack: () => void;
  onCaseUpdated: (c: PatientCase) => void;
}

export const CaseDetailView: React.FC<CaseDetailViewProps> = ({
  patientCase,
  onBack,
  onCaseUpdated,
}) => {
  // Modals state
  const { effectiveOnlineStatus } = useConnectivity();
  const [selectedFlagForModal, setSelectedFlagForModal] = useState<SafetyFlag | null>(null);
  const [selectedContradiction, setSelectedContradiction] = useState<Contradiction | null>(null);
  const [referralModalOpen, setReferralModalOpen] = useState(false);
  const [currentReferral, setCurrentReferral] = useState<ReferralDraft | null>(patientCase.referral_draft || null);

  // Offline Audio State
  const [storedAudioBlobUrl, setStoredAudioBlobUrl] = useState<string | null>(null);
  const [storedAudioRecord, setStoredAudioRecord] = useState<StoredAudioRecording | null>(null);
  const [isTranscribingAudio, setIsTranscribingAudio] = useState(false);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);

  // Load associated audio recording from IndexedDB upon mount or case change
  useEffect(() => {
    let isMounted = true;
    let localBlobUrl: string | null = null;

    const loadAudio = async () => {
      try {
        let rec: StoredAudioRecording | null = null;
        if (patientCase.audioRecordingId) {
          rec = await offlineAudioStorage.getAudioRecording(patientCase.audioRecordingId);
        }
        if (!rec) {
          rec = await offlineAudioStorage.getAudioRecordingForCase(patientCase.id);
        }
        if (rec && isMounted) {
          setStoredAudioRecord(rec);
          localBlobUrl = URL.createObjectURL(rec.blob);
          setStoredAudioBlobUrl(localBlobUrl);
        }
      } catch (e) {
        console.warn('Failed to load associated audio from IndexedDB:', e);
      }
    };

    loadAudio();

    return () => {
      isMounted = false;
      if (localBlobUrl) {
        URL.revokeObjectURL(localBlobUrl);
      }
    };
  }, [patientCase.id, patientCase.audioRecordingId]);

  // Transcribe stored audio when connection becomes active
  const handleTranscribeStoredAudio = async () => {
    if (!storedAudioRecord) return;
    if (!effectiveOnlineStatus) {
      setTranscribeError('Cannot transcribe: Device is offline. Reconnect or disable offline simulation to use Gemini transcription.');
      return;
    }

    setIsTranscribingAudio(true);
    setTranscribeError(null);
    try {
      // Retrieve fresh Blob directly from IndexedDB
      const freshRecord = await offlineAudioStorage.getAudioRecording(storedAudioRecord.id);
      const targetBlob = freshRecord ? freshRecord.blob : storedAudioRecord.blob;
      const b64 = await OfflineAudioStorageService.blobToBase64(targetBlob);
      const res = await api.transcribeAudio(b64, storedAudioRecord.mimeType || 'audio/webm');

      if (res && res.transcript) {
        const updated: PatientCase = {
          ...patientCase,
          originalStatement: res.transcript,
          translatedStatement: res.transcript,
          chief_complaint: res.transcript.slice(0, 120),
          ai_summary: {
            ...patientCase.ai_summary,
            narrative: res.transcript,
          },
        };
        onCaseUpdated(updated);
        // Mark record as transcribed in IndexedDB
        await offlineAudioStorage.saveAudioRecording({
          ...storedAudioRecord,
          transcript: res.transcript,
        }).catch(() => {});
      }
    } catch (e: any) {
      console.error('Failed to transcribe stored audio:', e);
      setTranscribeError(e.message || 'Failed to transcribe audio with nemotron-omni-transcribe.');
    } finally {
      setIsTranscribingAudio(false);
    }
  };

  // Editing AI summary
  const [isEditingSummary, setIsEditingSummary] = useState(false);
  const [editableNarrative, setEditableNarrative] = useState(patientCase.ai_summary.narrative);
  const [reviewerNotes, setReviewerNotes] = useState(patientCase.human_reviewer_notes || '');

  // Editing Lab value
  const [editingLabId, setEditingLabId] = useState<string | null>(null);
  const [correctedLabVal, setCorrectedLabVal] = useState<string>('');

  // Answering Follow-up question
  const [answeringQId, setAnsweringQId] = useState<string | null>(null);
  const [questionAnswerInput, setQuestionAnswerInput] = useState<string>('');

  // Escalation / Approval state
  const [escalateReason, setEscalateReason] = useState('');
  const [showEscalatePrompt, setShowEscalatePrompt] = useState(false);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  // Audit log drawer
  const [showAuditLogs, setShowAuditLogs] = useState(false);
  const [caseAuditLogs, setCaseAuditLogs] = useState<AuditLogEntry[]>([]);

  // Load audit logs
  const handleToggleAudit = async () => {
    if (!showAuditLogs) {
      try {
        let serverLogs: AuditLogEntry[] = [];
        try {
          serverLogs = await api.getCaseAudit(patientCase.id);
        } catch {
          // offline or server unreachable
        }
        const localLogs = await offlineAuditStorage.getAuditEventsForCase(patientCase.id);

        const seen = new Set<string>();
        const merged: AuditLogEntry[] = [];
        for (const log of [...localLogs, ...serverLogs]) {
          const key = log.id || log.clientEventId || '';
          if (key && !seen.has(key)) {
            seen.add(key);
            merged.push(log);
          }
        }
        merged.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setCaseAuditLogs(merged);
      } catch (err) {
        console.error('Failed to load audit logs:', err);
      }
    }
    setShowAuditLogs(!showAuditLogs);
  };

  // Lab verification handler
  const handleToggleLabVerify = async (lab: ExtractedLabValue) => {
    try {
      if (!effectiveOnlineStatus) {
        const nextVerified = !lab.verifiedByHuman;
        const updatedLabs = (patientCase.extracted_labs || []).map((l) =>
          l.id === lab.id ? { ...l, verifiedByHuman: nextVerified } : l
        );
        const updated: PatientCase = {
          ...patientCase,
          extracted_labs: updatedLabs,
          updatedAt: new Date().toISOString(),
        };
        await offlineAuditStorage.recordAuditEvent({
          caseId: patientCase.id,
          action: nextVerified ? 'LAB_VERIFIED_OFFLINE' : 'LAB_UNVERIFIED_OFFLINE',
          details: `Lab value "${lab.test}" (${lab.value} ${lab.unit}) marked as ${nextVerified ? 'verified' : 'unverified'} offline.`,
          userRole: 'REVIEWER',
          actorId: 'DR_MED_OFFICER',
          origin: 'OFFLINE',
          syncStatus: 'PENDING',
        });
        onCaseUpdated(updated);
        showFeedback(`Lab ${lab.test} ${nextVerified ? 'verified' : 'unverified'} offline. Event queued.`);
        return;
      }

      const updated = await api.verifyLab(patientCase.id, {
        labId: lab.id,
        verified: !lab.verifiedByHuman,
      });
      onCaseUpdated(updated);
    } catch (err) {
      console.error('Failed to verify lab:', err);
    }
  };

  // Lab correction submit
  const handleSaveLabCorrection = async (labId: string) => {
    if (!correctedLabVal.trim()) return;
    try {
      if (!effectiveOnlineStatus) {
        const updatedLabs = (patientCase.extracted_labs || []).map((l) =>
          l.id === labId
            ? {
                ...l,
                verifiedByHuman: true,
                value: correctedLabVal,
                notes: 'Corrected offline by healthcare reviewer',
              }
            : l
        );
        const updated: PatientCase = {
          ...patientCase,
          extracted_labs: updatedLabs,
          updatedAt: new Date().toISOString(),
        };
        await offlineAuditStorage.recordAuditEvent({
          caseId: patientCase.id,
          action: 'LAB_CORRECTED_OFFLINE',
          details: `Lab ID ${labId} corrected offline to "${correctedLabVal}".`,
          userRole: 'REVIEWER',
          actorId: 'DR_MED_OFFICER',
          origin: 'OFFLINE',
          syncStatus: 'PENDING',
        });
        setEditingLabId(null);
        setCorrectedLabVal('');
        onCaseUpdated(updated);
        showFeedback('Lab correction recorded offline. Event queued.');
        return;
      }

      const updated = await api.verifyLab(patientCase.id, {
        labId,
        verified: true,
        correctedValue: correctedLabVal,
        notes: 'Corrected by healthcare reviewer',
      });
      setEditingLabId(null);
      setCorrectedLabVal('');
      onCaseUpdated(updated);
    } catch (err) {
      console.error('Failed to correct lab:', err);
    }
  };

  // Save edited summary
  const handleSaveSummary = async () => {
    try {
      if (!effectiveOnlineStatus) {
        const updated: PatientCase = {
          ...patientCase,
          ai_summary: {
            ...patientCase.ai_summary,
            narrative: editableNarrative,
          },
          human_reviewer_notes: reviewerNotes,
          updatedAt: new Date().toISOString(),
        };
        await offlineAuditStorage.recordAuditEvent({
          caseId: patientCase.id,
          action: 'CLINICAL_SUMMARY_EDITED_OFFLINE',
          details: 'Healthcare reviewer edited clinical summary and notes while offline.',
          userRole: 'REVIEWER',
          actorId: 'DR_MED_OFFICER',
          origin: 'OFFLINE',
          syncStatus: 'PENDING',
        });
        setIsEditingSummary(false);
        onCaseUpdated(updated);
        showFeedback('Clinical summary and reviewer notes saved offline. Event queued.');
        return;
      }

      const updated = await api.updateCase(patientCase.id, {
        ai_summary: {
          ...patientCase.ai_summary,
          narrative: editableNarrative,
        },
        human_reviewer_notes: reviewerNotes,
        actorRole: 'REVIEWER',
        actionDesc: 'Healthcare reviewer edited clinical summary and notes',
      });
      setIsEditingSummary(false);
      onCaseUpdated(updated);
      showFeedback('Clinical summary and reviewer notes saved successfully.');
    } catch (err) {
      console.error('Failed to save summary:', err);
    }
  };

  // Answer follow up question
  const handleSubmitAnswer = async (qId: string) => {
    if (!questionAnswerInput.trim()) return;
    try {
      if (!effectiveOnlineStatus) {
        const updatedQuestions = (patientCase.follow_up_questions || []).map((q) =>
          q.id === qId ? { ...q, answered: true, answer: questionAnswerInput } : q
        );
        const updated: PatientCase = {
          ...patientCase,
          follow_up_questions: updatedQuestions,
          updatedAt: new Date().toISOString(),
        };
        await offlineAuditStorage.recordAuditEvent({
          caseId: patientCase.id,
          action: 'QUESTION_ANSWERED_OFFLINE',
          details: `Follow-up question answered offline: "${questionAnswerInput.slice(0, 40)}..."`,
          userRole: 'REVIEWER',
          actorId: 'DR_MED_OFFICER',
          origin: 'OFFLINE',
          syncStatus: 'PENDING',
        });
        setAnsweringQId(null);
        setQuestionAnswerInput('');
        onCaseUpdated(updated);
        showFeedback('Follow-up answer recorded offline. Event queued.');
        return;
      }

      const updated = await api.answerQuestion(patientCase.id, qId, questionAnswerInput);
      setAnsweringQId(null);
      setQuestionAnswerInput('');
      onCaseUpdated(updated);
      showFeedback('Follow-up answer recorded. Case variables and safety rules recalculated.');
    } catch (err) {
      console.error('Failed to record answer:', err);
    }
  };

  // Approve Case
  const handleApproveCase = async () => {
    try {
      const reviewerName = 'Dr. Medical Officer (Verified)';
      if (!effectiveOnlineStatus) {
        const updated: PatientCase = {
          ...patientCase,
          case_status: 'REVIEWED',
          reviewedBy: reviewerName,
          reviewedAt: new Date().toISOString(),
          human_reviewer_notes: reviewerNotes || patientCase.human_reviewer_notes,
          updatedAt: new Date().toISOString(),
        };
        await offlineAuditStorage.recordAuditEvent({
          caseId: patientCase.id,
          action: 'CASE_REVIEWER_APPROVED_OFFLINE',
          details: `Case officially approved and signed off offline by ${reviewerName}. Queued for sync.`,
          userRole: 'REVIEWER',
          actorId: reviewerName,
          origin: 'OFFLINE',
          syncStatus: 'PENDING',
        });
        onCaseUpdated(updated);
        showFeedback('Case Approved offline. Audit trail and case update queued locally.');
        return;
      }

      const updated = await api.approveCase(patientCase.id, {
        reviewerName,
        reviewerNotes,
      });
      onCaseUpdated(updated);
      showFeedback('Case Approved and officially signed off by Medical Officer.');
    } catch (err) {
      console.error('Failed to approve case:', err);
    }
  };

  // Escalate Case
  const handleEscalateCase = async () => {
    if (!escalateReason.trim()) return;
    try {
      const triageOfficer = 'Dr. Triage Officer';
      if (!effectiveOnlineStatus) {
        const updated: PatientCase = {
          ...patientCase,
          case_status: 'ESCALATED',
          reviewedBy: triageOfficer,
          reviewedAt: new Date().toISOString(),
          human_reviewer_notes: `[ESCALATED]: ${escalateReason}`,
          updatedAt: new Date().toISOString(),
        };
        await offlineAuditStorage.recordAuditEvent({
          caseId: patientCase.id,
          action: 'CASE_REVIEWER_ESCALATED_OFFLINE',
          details: `Case escalated offline: ${escalateReason}`,
          userRole: 'REVIEWER',
          actorId: triageOfficer,
          origin: 'OFFLINE',
          syncStatus: 'PENDING',
        });
        setShowEscalatePrompt(false);
        setEscalateReason('');
        onCaseUpdated(updated);
        showFeedback('Case escalated offline for urgent medical officer review. Audit event queued.');
        return;
      }

      const updated = await api.escalateCase(patientCase.id, {
        reviewerName: triageOfficer,
        reason: escalateReason,
      });
      setShowEscalatePrompt(false);
      setEscalateReason('');
      onCaseUpdated(updated);
      showFeedback('Case escalated for urgent senior physician / emergency attention.');
    } catch (err) {
      console.error('Failed to escalate case:', err);
    }
  };

  // Generate Referral Draft
  const handleGenerateReferral = async () => {
    try {
      const referralDraft = await api.generateReferral(patientCase.id);
      setCurrentReferral(referralDraft);
      setReferralModalOpen(true);
    } catch (err) {
      console.error('Failed to generate referral draft:', err);
    }
  };

  const showFeedback = (msg: string) => {
    setActionSuccessMsg(msg);
    setTimeout(() => setActionSuccessMsg(null), 3500);
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Top Navigation & Feedback Alert */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition font-medium cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Reviewer Queue</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={handleToggleAudit}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-xs font-medium flex items-center gap-1.5 transition"
          >
            <History className="w-3.5 h-3.5 text-teal-400" />
            <span>Audit History</span>
            {showAuditLogs ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          <button
            onClick={handleGenerateReferral}
            className="px-3.5 py-1.5 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border border-indigo-500/40 rounded-lg text-xs font-bold flex items-center gap-1.5 transition shadow-sm"
          >
            <FileText className="w-3.5 h-3.5 text-indigo-400" />
            <span>Generate Referral Draft</span>
          </button>
        </div>
      </div>

      {actionSuccessMsg && (
        <div className="p-3 bg-emerald-950/60 border border-emerald-500/50 rounded-xl text-xs text-emerald-200 flex items-center gap-2 shadow-lg animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="font-medium">{actionSuccessMsg}</span>
        </div>
      )}

      {/* Case Header Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="font-mono text-xl font-bold text-teal-400">{patientCase.id}</span>
              <span className="text-slate-500">•</span>
              <h2 className="text-lg font-bold text-white">{patientCase.patient.syntheticName}</h2>
              <span className="text-xs text-slate-400">
                ({patientCase.patient.age ? `${patientCase.patient.age} yrs` : 'Age N/A'},{' '}
                {patientCase.patient.sex || 'Sex N/A'})
              </span>
              <span className="text-slate-500">•</span>
              <div className="flex items-center gap-1 text-xs text-slate-300">
                <Building2 className="w-3.5 h-3.5 text-teal-400" />
                <span>{patientCase.facility}</span>
              </div>
            </div>

            <p className="text-xs text-slate-400 mt-1">
              Case opened {new Date(patientCase.createdAt).toLocaleString()} • Language:{' '}
              <span className="uppercase font-mono text-teal-300">{patientCase.language}</span>
            </p>
          </div>

          {/* Review Priority & Status Badges */}
          <div className="flex items-center gap-3">
            <div className="text-right">
              <span className="text-[10px] text-slate-400 uppercase font-mono block">AI-Assisted Review Priority</span>
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold border uppercase tracking-wider mt-0.5 ${
                  patientCase.review_priority === 'URGENT'
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/50'
                    : patientCase.review_priority === 'PRIORITY'
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                    : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    patientCase.review_priority === 'URGENT'
                      ? 'bg-rose-400 animate-pulse'
                      : patientCase.review_priority === 'PRIORITY'
                      ? 'bg-amber-400'
                      : 'bg-emerald-400'
                  }`}
                />
                <span>
                  {patientCase.review_priority === 'URGENT'
                    ? '🔴 URGENT HUMAN REVIEW'
                    : patientCase.review_priority === 'PRIORITY'
                    ? '🟡 PRIORITY REVIEW'
                    : '🟢 ROUTINE'}
                </span>
              </span>
            </div>

            <div className="text-right pl-3 border-l border-slate-800">
              <span className="text-[10px] text-slate-400 uppercase font-mono block">Case Status</span>
              <span
                className={`inline-block px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wider mt-0.5 ${
                  patientCase.case_status === 'REVIEWED'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : patientCase.case_status === 'ESCALATED'
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                    : 'bg-slate-800 text-slate-300 border border-slate-700'
                }`}
              >
                {patientCase.case_status}
              </span>
            </div>

            <div className="text-right pl-3 border-l border-slate-800 hidden sm:block">
              <span className="text-[10px] text-slate-400 uppercase font-mono block">Sync State</span>
              {patientCase.sync_status === 'PENDING_SYNC' || patientCase.pending_sync ? (
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 mt-0.5"
                  title="Minimal required fields stored in local queue. Automatically evicts upon successful Cloud Firestore sync."
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  <span>Pending Sync</span>
                </span>
              ) : patientCase.sync_status === 'SYNC_FAILED' ? (
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 mt-0.5"
                  title={patientCase.sync_error || 'Concurrency conflict detected'}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                  <span>Sync Alert</span>
                </span>
              ) : (
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-medium text-teal-400 bg-teal-500/10 border border-teal-500/30 mt-0.5"
                  title="Case synchronized with Cloud Firestore"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />
                  <span>Synced</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Concurrency Conflict or Sync Error Alert if present */}
        {patientCase.sync_status === 'SYNC_FAILED' && (
          <div className="p-3 bg-rose-950/40 border border-rose-500/40 rounded-xl text-xs text-rose-200 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-white">Concurrency Guard: Silent Overwrite Prevented</div>
              <p className="text-[11px] text-rose-300/90 mt-0.5">
                {patientCase.sync_error || 'A remote reviewer or device updated this case with a newer timestamp. This case was not overwritten silently.'}
              </p>
            </div>
          </div>
        )}

        {/* Mandatory Advisory Banner */}
        <div className="bg-amber-500/10 border border-amber-500/25 rounded-lg px-3.5 py-2 flex items-center gap-2 text-xs text-amber-300">
          <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{patientCase.ai_disclaimer}</span>
        </div>
      </div>

      {/* Audit Drawer (Expandable) */}
      {showAuditLogs && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-teal-400" />
              <h3 className="text-sm font-bold text-white">Immutable Institutional Audit Trail for Case {patientCase.id}</h3>
            </div>
            <span className="text-[11px] text-slate-400 font-mono">{caseAuditLogs.length} events logged</span>
          </div>

          <div className="divide-y divide-slate-800 max-h-56 overflow-y-auto font-mono text-[11px]">
            {caseAuditLogs.map((log) => (
              <div key={log.id} className="py-2.5 flex items-start justify-between gap-3 text-slate-300">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-teal-400 font-bold">{log.action}</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700">
                      {log.userRole}
                    </span>
                    {log.actorId && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-900 text-slate-300 border border-slate-800">
                        Actor: {log.actorId}
                      </span>
                    )}
                    {log.origin === 'OFFLINE' ? (
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-950/60 text-amber-300 border border-amber-500/40 font-semibold">
                        OFFLINE {log.syncStatus === 'SYNCED' ? '✓ SYNCED' : '⏳ PENDING SYNC'}
                      </span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-950/40 text-emerald-300 border border-emerald-500/30">
                        ONLINE
                      </span>
                    )}
                  </div>
                  <p className="text-slate-400 text-xs font-sans">{log.details}</p>
                </div>
                <span className="text-slate-500 shrink-0 whitespace-nowrap text-[11px]">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Grid: 2 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 Cols wide): Clinical Findings & Evidence */}
        <div className="lg:col-span-2 space-y-6">
          {/* Section 1: Chief Complaint & Symptoms with Provenance */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                1. Chief Complaint & Reported Symptoms
              </h3>
              <span className="text-[11px] text-slate-400">{patientCase.symptoms.length} symptoms documented</span>
            </div>

            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
              <span className="text-[11px] text-slate-400 block mb-0.5">Primary Presenting Complaint:</span>
              <p className="text-sm font-bold text-white">{patientCase.chief_complaint}</p>
              {patientCase.originalStatement && (
                <div className="mt-2 pt-2 border-t border-slate-800/80 text-[11px] text-slate-400">
                  <span className="text-teal-400 font-medium">Verbatim Statement:</span> "{patientCase.originalStatement}"
                </div>
              )}

              {/* Durable Offline Audio Playback & Transcription */}
              {storedAudioBlobUrl && (
                <div className="mt-3 pt-3 border-t border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs text-teal-300 font-semibold">
                      <Volume2 className="w-4 h-4 text-teal-400" />
                      <span>Recorded Patient Audio (Durable Local Storage)</span>
                    </div>
                    {effectiveOnlineStatus && !isTranscribingAudio && (
                      <button
                        type="button"
                        onClick={handleTranscribeStoredAudio}
                        className="px-2.5 py-1 bg-teal-600 hover:bg-teal-500 text-white rounded text-[11px] font-semibold flex items-center gap-1 transition shadow-sm"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>Transcribe with NIM Omni</span>
                      </button>
                    )}
                  </div>
                  <audio controls src={storedAudioBlobUrl} className="w-full h-8" />
                  {isTranscribingAudio && (
                    <div className="flex items-center gap-2 text-[11px] text-teal-300">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-400" />
                      <span>Transcribing audio using nemotron-omni-transcribe...</span>
                    </div>
                  )}
                  {transcribeError && (
                    <p className="text-[11px] text-rose-400">{transcribeError}</p>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {patientCase.symptoms.map((s) => (
                <div key={s.id} className="bg-slate-950 border border-slate-800/80 rounded-lg p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200">{s.name}</span>
                    {s.severity && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        s.severity === 'SEVERE' ? 'bg-rose-500/20 text-rose-300' : 'bg-slate-800 text-slate-300'
                      }`}>
                        {s.severity}
                      </span>
                    )}
                  </div>

                  <div className="text-[11px] text-slate-400 flex items-center justify-between">
                    <span>Duration: <strong className="text-slate-300">{s.duration || 'Unrecorded'}</strong></span>
                    <span className="font-mono text-[10px] text-teal-400/90">[{s.source}]</span>
                  </div>

                  {s.evidenceQuote && (
                    <div className="text-[10px] text-slate-400 italic pt-1 border-t border-slate-900 truncate">
                      Quote: "{s.evidenceQuote}"
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Section 2: Chronological Patient Timeline */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-teal-400" />
                <span>2. Patient Timeline Visualization</span>
              </h3>
              <span className="text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded font-mono">
                Chronological Sequence
              </span>
            </div>

            <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
              {patientCase.timeline.length === 0 ? (
                <p className="text-xs text-slate-500 italic">No timeline events extracted yet.</p>
              ) : (
                patientCase.timeline.map((event, idx) => (
                  <div key={event.id || idx} className="relative group">
                    <div className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-teal-500 border-2 border-slate-900 ring-2 ring-teal-500/30" />
                    <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-teal-300 font-mono">{event.timeframe}</span>
                        {event.isApproximate && (
                          <span className="text-[10px] text-amber-400/90 bg-amber-500/10 px-1.5 py-0.2 rounded">
                            Approximate timeline
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-300 leading-normal">{event.description}</p>
                      <span className="text-[10px] text-slate-500 block pt-0.5 font-mono">
                        Source: {event.source}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Section 3: Vitals & Physiological Measurements */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-teal-400" />
              <span>3. Recorded Vitals & Point-of-Care Measurements</span>
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
              {/* Temperature */}
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-center">
                <span className="text-[10px] text-slate-400 uppercase font-mono block">Temperature</span>
                {patientCase.vitals.temperature ? (
                  <div className="mt-1">
                    <span className="text-base font-bold text-white">
                      {patientCase.vitals.temperature.value}°{patientCase.vitals.temperature.unit}
                    </span>
                    <span className={`block text-[10px] font-bold mt-0.5 ${
                      patientCase.vitals.temperature.status === 'HIGH' ? 'text-rose-400' : 'text-emerald-400'
                    }`}>
                      {patientCase.vitals.temperature.status || 'NORMAL'}
                    </span>
                  </div>
                ) : (
                  <span className="text-slate-500 italic block mt-1">Not Recorded</span>
                )}
              </div>

              {/* Blood Pressure */}
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-center">
                <span className="text-[10px] text-slate-400 uppercase font-mono block">Blood Pressure</span>
                {patientCase.vitals.blood_pressure ? (
                  <div className="mt-1">
                    <span className="text-base font-bold text-white">
                      {patientCase.vitals.blood_pressure.systolic}/{patientCase.vitals.blood_pressure.diastolic}
                    </span>
                    <span className="block text-[10px] text-slate-400 mt-0.5">mmHg</span>
                  </div>
                ) : (
                  <span className="text-slate-500 italic block mt-1">Not Recorded</span>
                )}
              </div>

              {/* Heart Rate */}
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-center">
                <span className="text-[10px] text-slate-400 uppercase font-mono block">Heart Rate</span>
                {patientCase.vitals.heart_rate ? (
                  <div className="mt-1">
                    <span className="text-base font-bold text-white">
                      {patientCase.vitals.heart_rate.value}
                    </span>
                    <span className="block text-[10px] text-slate-400 mt-0.5">bpm</span>
                  </div>
                ) : (
                  <span className="text-slate-500 italic block mt-1">Not Recorded</span>
                )}
              </div>

              {/* SpO2 */}
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-center">
                <span className="text-[10px] text-slate-400 uppercase font-mono block">Pulse SpO2</span>
                {patientCase.vitals.spo2 ? (
                  <div className="mt-1">
                    <span className="text-base font-bold text-white">
                      {patientCase.vitals.spo2.value}%
                    </span>
                    <span className={`block text-[10px] font-bold mt-0.5 ${
                      patientCase.vitals.spo2.value < 94 ? 'text-rose-400' : 'text-emerald-400'
                    }`}>
                      {patientCase.vitals.spo2.value < 94 ? 'LOW' : 'NORMAL'}
                    </span>
                  </div>
                ) : (
                  <span className="text-slate-500 italic block mt-1">Not Recorded</span>
                )}
              </div>

              {/* Respiratory Rate */}
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-center">
                <span className="text-[10px] text-slate-400 uppercase font-mono block">Resp. Rate</span>
                {patientCase.vitals.respiratory_rate ? (
                  <div className="mt-1">
                    <span className="text-base font-bold text-white">
                      {patientCase.vitals.respiratory_rate.value}
                    </span>
                    <span className="block text-[10px] text-slate-400 mt-0.5">breaths/min</span>
                  </div>
                ) : (
                  <span className="text-slate-500 italic block mt-1">Not Recorded</span>
                )}
              </div>
            </div>
          </div>

          {/* Section 4: Uploaded Reports & Extracted Laboratory Values Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <FileSpreadsheet className="w-3.5 h-3.5 text-teal-400" />
                <span>4. Extracted Laboratory Tests & OCR Values</span>
              </h3>
              <span className="text-[11px] text-slate-400">
                {patientCase.extracted_labs.length} parameters extracted
              </span>
            </div>

            {patientCase.extracted_labs.length === 0 ? (
              <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 text-center text-xs text-slate-500">
                No laboratory documents uploaded or extracted for this case.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-950 text-[10px] text-slate-400 font-mono uppercase border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">Test Name</th>
                      <th className="py-2.5 px-3">Value & Unit</th>
                      <th className="py-2.5 px-3">Reference Range</th>
                      <th className="py-2.5 px-3">Source Document</th>
                      <th className="py-2.5 px-3">OCR Confidence</th>
                      <th className="py-2.5 px-3 text-right">Reviewer Verification</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {patientCase.extracted_labs.map((lab) => (
                      <tr key={lab.id} className="hover:bg-slate-800/40 transition">
                        {/* Test name */}
                        <td className="py-2.5 px-3 font-semibold text-white">{lab.test}</td>

                        {/* Value and unit (editable) */}
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {editingLabId === lab.id ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={correctedLabVal}
                                onChange={(e) => setCorrectedLabVal(e.target.value)}
                                className="w-20 bg-slate-950 border border-teal-500 rounded px-1.5 py-0.5 text-xs text-white"
                              />
                              <button
                                onClick={() => handleSaveLabCorrection(lab.id)}
                                className="p-1 bg-teal-600 text-white rounded hover:bg-teal-500"
                              >
                                <Check className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => setEditingLabId(null)}
                                className="p-1 bg-slate-800 text-slate-400 rounded hover:text-white"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`font-mono font-bold ${
                                  lab.status === 'CRITICAL'
                                    ? 'text-rose-400'
                                    : lab.status === 'ABNORMAL'
                                    ? 'text-amber-400'
                                    : 'text-white'
                                }`}
                              >
                                {lab.value} {lab.unit}
                              </span>
                              <button
                                onClick={() => {
                                  setEditingLabId(lab.id);
                                  setCorrectedLabVal(lab.value);
                                }}
                                className="text-slate-500 hover:text-teal-400 p-0.5"
                                title="Edit/Correct OCR Value"
                              >
                                <Edit3 className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </td>

                        {/* Reference range */}
                        <td className="py-2.5 px-3 text-slate-400 font-mono text-[11px]">
                          {lab.referenceRange || (
                            <span className="text-amber-400/80 italic">Ref range unavailable — verify</span>
                          )}
                        </td>

                        {/* Source Doc */}
                        <td className="py-2.5 px-3 text-slate-400 truncate max-w-[120px] text-[11px]">
                          {lab.sourceDocument}
                        </td>

                        {/* OCR Confidence */}
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                              lab.confidence === 'HIGH'
                                ? 'bg-emerald-500/10 text-emerald-400'
                                : 'bg-amber-500/10 text-amber-400'
                            }`}
                          >
                            {lab.confidence}
                          </span>
                        </td>

                        {/* Reviewer Verified Checkbox */}
                        <td className="py-2.5 px-3 text-right">
                          <button
                            onClick={() => handleToggleLabVerify(lab)}
                            className={`px-2.5 py-1 rounded text-[11px] font-medium transition inline-flex items-center gap-1 cursor-pointer ${
                              lab.verifiedByHuman
                                ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/40'
                                : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
                            }`}
                          >
                            <CheckCircle2 className={`w-3.5 h-3.5 ${lab.verifiedByHuman ? 'text-emerald-400' : 'text-slate-500'}`} />
                            <span>{lab.verifiedByHuman ? 'Verified' : 'Verify'}</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right Column (1 Col wide): Safety Engine, Missing Info, Questions & Review Actions */}
        <div className="space-y-6">
          {/* Section 5: Safety Signals & "Why was this flagged?" */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                <span>Deterministic Safety Signals</span>
              </h3>
              <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-400 font-mono">
                {patientCase.safety_flags.length} active
              </span>
            </div>

            {patientCase.safety_flags.length === 0 ? (
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-xs text-slate-400 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>No rule-based emergency safety thresholds triggered.</span>
              </div>
            ) : (
              <div className="space-y-2.5">
                {patientCase.safety_flags.map((flag) => (
                  <div
                    key={flag.id}
                    className={`p-3 rounded-lg border space-y-2 ${
                      flag.severity === 'URGENT'
                        ? 'bg-rose-950/40 border-rose-500/40 text-rose-200'
                        : 'bg-amber-950/40 border-amber-500/40 text-amber-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-0.5">
                        <span className="text-[10px] font-mono uppercase font-bold tracking-wider px-1.5 py-0.2 rounded bg-black/40">
                          {flag.severity}
                        </span>
                        <h4 className="text-xs font-bold text-white mt-1">{flag.flag}</h4>
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-300 leading-normal">{flag.reason}</p>

                    <button
                      onClick={() => setSelectedFlagForModal(flag)}
                      className="w-full py-1 px-2 bg-slate-900/90 hover:bg-slate-900 text-teal-300 hover:text-teal-200 border border-teal-500/30 rounded text-[11px] font-semibold flex items-center justify-center gap-1 transition"
                    >
                      <Sparkles className="w-3 h-3 text-teal-400" />
                      <span>Why was this flagged? (Explainability)</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 5b: Contradiction Alerts (Section 15) */}
          {patientCase.contradictions && patientCase.contradictions.length > 0 && (
            <div className="bg-amber-950/30 border border-amber-500/40 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-1.5 text-amber-300 font-bold text-xs uppercase tracking-wider">
                <AlertCircle className="w-4 h-4 text-amber-400" />
                <span>Information Conflicts Detected</span>
              </div>
              {patientCase.contradictions.map((c) => (
                <div key={c.id} className="bg-slate-950 p-2.5 rounded border border-slate-800 space-y-1 text-xs">
                  <p className="font-semibold text-white">{c.title}</p>
                  <p className="text-[11px] text-slate-300">{c.description}</p>
                  <button
                    onClick={() => setSelectedContradiction(c)}
                    className="text-[11px] text-amber-400 underline hover:text-amber-300 pt-0.5 block"
                  >
                    Inspect Conflict Sources & Reconcile
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Section 6: Missing Information Engine */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
                <span>Missing Information Engine</span>
              </h3>
              <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-400 font-mono">
                {patientCase.missing_information.length} unrecorded
              </span>
            </div>

            {patientCase.missing_information.length === 0 ? (
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-xs text-slate-400 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>All essential clinical intake variables documented.</span>
              </div>
            ) : (
              <div className="space-y-1.5">
                {patientCase.missing_information.map((item, idx) => (
                  <div
                    key={idx}
                    className="bg-slate-950/80 border border-slate-800 rounded-lg p-2 flex items-start gap-2 text-[11px] text-amber-200"
                  >
                    <span className="text-amber-400 font-bold shrink-0">⚠</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 7: Adaptive Follow-Up Question Engine */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Suggested Follow-Up Questions
              </h3>
              <span className="text-[10px] text-slate-400 font-mono">
                {patientCase.follow_up_questions.filter((q) => q.answered).length}/
                {patientCase.follow_up_questions.length} answered
              </span>
            </div>

            <div className="space-y-2">
              {patientCase.follow_up_questions.map((q) => (
                <div key={q.id} className="bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-2 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-slate-200 font-medium">{q.question}</p>
                    <span className="text-[9px] uppercase px-1 py-0.5 rounded bg-slate-800 text-slate-400 font-mono shrink-0">
                      {q.category}
                    </span>
                  </div>

                  {q.answered ? (
                    <div className="bg-emerald-950/30 border border-emerald-500/30 p-2 rounded text-[11px] text-emerald-200 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>Answer: "{q.answer}"</span>
                    </div>
                  ) : answeringQId === q.id ? (
                    <div className="space-y-1.5 pt-1">
                      <input
                        type="text"
                        value={questionAnswerInput}
                        onChange={(e) => setQuestionAnswerInput(e.target.value)}
                        placeholder="Type patient response..."
                        className="w-full bg-slate-900 border border-teal-500 rounded p-1.5 text-xs text-white outline-none"
                      />
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleSubmitAnswer(q.id)}
                          className="px-2.5 py-1 bg-teal-600 text-white rounded text-[11px] font-semibold hover:bg-teal-500"
                        >
                          Save Answer
                        </button>
                        <button
                          onClick={() => setAnsweringQId(null)}
                          className="px-2 py-1 bg-slate-800 text-slate-400 rounded text-[11px] hover:text-white"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[10px] text-slate-500 italic">Clarifies missing info</span>
                      <button
                        onClick={() => {
                          setAnsweringQId(q.id);
                          setQuestionAnswerInput('');
                        }}
                        className="text-[11px] text-teal-400 hover:text-teal-300 font-semibold"
                      >
                        + Record Answer
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Section 8: Human-in-the-Loop Reviewer Actions & Note Approval */}
          <div className="bg-slate-900 border border-teal-500/40 rounded-xl p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-teal-300 uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-teal-400" />
                <span>Human Reviewer Final Decision</span>
              </h3>
              <button
                onClick={() => setIsEditingSummary(!isEditingSummary)}
                className="text-[11px] text-teal-400 hover:text-teal-300 underline font-medium"
              >
                {isEditingSummary ? 'Cancel Edit' : 'Edit Note'}
              </button>
            </div>

            {/* AI Summary View / Edit */}
            {isEditingSummary ? (
              <div className="space-y-2">
                <label className="text-[11px] font-semibold text-slate-300 uppercase block">
                  Edit Clinical Triage Narrative
                </label>
                <textarea
                  value={editableNarrative}
                  onChange={(e) => setEditableNarrative(e.target.value)}
                  rows={4}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:ring-1 focus:ring-teal-500 outline-none"
                />

                <label className="text-[11px] font-semibold text-slate-300 uppercase block mt-2">
                  Add Healthcare Reviewer Clinical Endorsement Notes
                </label>
                <textarea
                  value={reviewerNotes}
                  onChange={(e) => setReviewerNotes(e.target.value)}
                  placeholder="Enter medical officer remarks, physical exam notes, disposition..."
                  rows={2}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white focus:ring-1 focus:ring-teal-500 outline-none"
                />

                <button
                  onClick={handleSaveSummary}
                  className="w-full py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-xs font-bold transition shadow-sm"
                >
                  Save Human Edits
                </button>
              </div>
            ) : (
              <div className="space-y-2 text-xs">
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 leading-relaxed text-slate-300">
                  <span className="text-[10px] text-slate-400 font-mono uppercase block mb-1">
                    AI-Assisted Triage Narrative:
                  </span>
                  <p>{patientCase.ai_summary.narrative}</p>
                </div>

                {patientCase.human_reviewer_notes && (
                  <div className="bg-teal-950/30 border border-teal-500/30 p-2.5 rounded-lg text-teal-200">
                    <span className="text-[10px] font-bold text-teal-400 uppercase block">
                      Reviewer Endorsement Remarks:
                    </span>
                    <p className="mt-0.5">{patientCase.human_reviewer_notes}</p>
                  </div>
                )}
              </div>
            )}

            {/* Escalation input toggle */}
            {showEscalatePrompt ? (
              <div className="bg-purple-950/40 border border-purple-500/40 p-3 rounded-lg space-y-2">
                <span className="text-xs font-bold text-purple-200 block">
                  Escalate Case to Senior Medical Officer / Emergency
                </span>
                <input
                  type="text"
                  value={escalateReason}
                  onChange={(e) => setEscalateReason(e.target.value)}
                  placeholder="Enter clinical reason for escalation (e.g. Critical Thrombocytopenia & Dengue Warning Sign)..."
                  className="w-full bg-slate-950 border border-purple-500/50 rounded p-2 text-xs text-white outline-none"
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleEscalateCase}
                    className="flex-1 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded text-xs font-bold"
                  >
                    Confirm Escalation
                  </button>
                  <button
                    onClick={() => setShowEscalatePrompt(false)}
                    className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded text-xs"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              /* Action Buttons */
              <div className="space-y-2 pt-2">
                <button
                  onClick={handleApproveCase}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition shadow-md shadow-emerald-950 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Approve & Sign Off Triage Note</span>
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setShowEscalatePrompt(true)}
                    className="py-2 bg-purple-950 hover:bg-purple-900/60 text-purple-300 border border-purple-500/40 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Escalate Case</span>
                  </button>

                  <button
                    onClick={handleGenerateReferral}
                    className="py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                  >
                    <FileText className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Referral Slip</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      <WhyFlaggedModal
        flag={selectedFlagForModal}
        onClose={() => setSelectedFlagForModal(null)}
      />

      <ReferralDraftModal
        referral={currentReferral}
        patientCase={patientCase}
        onClose={() => setReferralModalOpen(false)}
        onApproveReferral={(refId) => {
          showFeedback(`Referral Ref ${refId} endorsed and approved by Medical Officer.`);
        }}
      />

      <ContradictionModal
        contradiction={selectedContradiction}
        onClose={() => setSelectedContradiction(null)}
        onMarkResolved={() => {
          showFeedback('Information conflict marked reconciled by healthcare reviewer.');
        }}
      />
    </div>
  );
};
