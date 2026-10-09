import React, { useState, useEffect, useRef } from 'react';
import {
  Activity,
  ClipboardList,
  Sparkles,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  RefreshCw,
  Building2,
  FileText,
  UserCheck,
  CheckCircle2,
  AlertTriangle,
  HeartPulse,
  BrainCircuit,
  Eye,
  Languages,
} from 'lucide-react';
import {
  PatientCase,
  UserRole,
  SupportedLanguage,
} from './types';
import { api } from './services/api';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ConnectivityProvider, useConnectivity } from './context/ConnectivityContext';
import { firestoreCasesService } from './services/firestoreCases';
import { offlineSyncService } from './services/offlineSyncService';
import { Navbar } from './components/Navbar';
import { ConsentModal } from './components/ConsentModal';
import { DemoCasesModal } from './components/DemoCasesModal';
import { AudioTranscriberModal } from './components/AudioTranscriberModal';
import { IntakeForm } from './components/PatientIntake/IntakeForm';
import { CaseQueue } from './components/ReviewerDashboard/CaseQueue';
import { CaseDetailView } from './components/ReviewerDashboard/CaseDetailView';
import { AdminDashboard } from './components/AdminDashboard/AdminDashboard';

function MainApp() {
  // Navigation & Role State
  const [activeView, setActiveView] = useState<'LANDING' | 'INTAKE' | 'QUEUE' | 'CASE_DETAIL' | 'ADMIN'>('LANDING');
  const [currentRole, setCurrentRole] = useState<UserRole>('REVIEWER');
  const [language, setLanguage] = useState<SupportedLanguage>('en');
  const [lowBandwidth, setLowBandwidth] = useState<boolean>(false);

  // Consent State (Must be accepted once per session before intake)
  const [consentGiven, setConsentGiven] = useState<boolean>(true); // default true for convenience, but modal can be re-triggered
  const [consentModalOpen, setConsentModalOpen] = useState<boolean>(false);
  const [pendingIntakeAfterConsent, setPendingIntakeAfterConsent] = useState<boolean>(false);

  // Cases State
  const [cases, setCases] = useState<PatientCase[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [demoModalOpen, setDemoModalOpen] = useState<boolean>(false);
  const [transcriberModalOpen, setTranscriberModalOpen] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const { currentUser, loading: authLoading } = useAuth();
  const { isOnline, isSimulatedOffline, effectiveOnlineStatus } = useConnectivity();

  // Offline Sync State
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(() => offlineSyncService.getPendingCount());
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncToast, setSyncToast] = useState<{ message: string; type: 'success' | 'warning' | 'error' } | null>(null);

  // Subscribe to offline sync queue count
  useEffect(() => {
    const unsub = offlineSyncService.subscribe((count) => {
      setPendingSyncCount(count);
    });
    return () => unsub();
  }, []);

  // Synchronize pending cases to Cloud Firestore
  const handleSyncPending = async () => {
    // If effectively offline (physical offline OR simulated offline) or already syncing, inhibit sync
    if (!effectiveOnlineStatus || isSyncing) return;
    setIsSyncing(true);
    try {
      const fullCasesMap = new Map<string, PatientCase>();
      cases.forEach((c) => fullCasesMap.set(c.id, c));
      const res = await offlineSyncService.syncPendingToFirebase(fullCasesMap);
      if (res.synced > 0) {
        setSyncToast({
          message: `Successfully synchronized ${res.synced} case(s) to Cloud Firestore. Temporary local cache evicted.`,
          type: 'success',
        });
        setTimeout(() => setSyncToast(null), 4000);
        await fetchCases();
      } else if (res.conflicts > 0) {
        setSyncToast({
          message: `${res.conflicts} concurrency conflict(s) detected. Remote updates were preserved; overwrite prevented.`,
          type: 'warning',
        });
        setTimeout(() => setSyncToast(null), 6000);
      } else if (res.failed > 0) {
        setSyncToast({
          message: `Failed to sync ${res.failed} case(s). Retained in local queue.`,
          type: 'error',
        });
        setTimeout(() => setSyncToast(null), 5000);
      }
    } catch (err: any) {
      console.error('Sync failed:', err);
      setSyncToast({
        message: `Sync operation encountered an error: ${err.message}`,
        type: 'error',
      });
      setTimeout(() => setSyncToast(null), 5000);
    } finally {
      setIsSyncing(false);
    }
  };

  // Auto-sync pending cases & audit logs when effective connectivity becomes true
  // Triggers when physical network reconnects OR when simulated offline mode is exited
  const prevEffectiveOnlineRef = useRef<boolean>(effectiveOnlineStatus);
  useEffect(() => {
    if (!prevEffectiveOnlineRef.current && effectiveOnlineStatus) {
      if (offlineSyncService.getPendingCount() > 0) {
        handleSyncPending();
      } else {
        offlineSyncService.syncAuditQueue().catch(console.warn);
      }
    }
    prevEffectiveOnlineRef.current = effectiveOnlineStatus;
  }, [effectiveOnlineStatus, cases]);

  // Load cases on mount & subscribe to Firestore
  useEffect(() => {
    fetchCases();

    if (authLoading) return;

    // Subscribe to real-time Firestore persistence
    try {
      const unsubscribe = firestoreCasesService.subscribeToCases((firestoreCases) => {
        if (firestoreCases && firestoreCases.length > 0) {
          setCases((prev) => {
            const map = new Map<string, PatientCase>();
            for (const c of firestoreCases) map.set(c.id, c);
            for (const c of prev) {
              if (!map.has(c.id)) map.set(c.id, c);
            }
            return Array.from(map.values()).sort(
              (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
            );
          });
        }
      });
      return () => unsubscribe();
    } catch (err) {
      console.warn('Firestore subscription initialized in fallback mode:', err);
    }
  }, [authLoading]);

  const fetchCases = async () => {
    setLoading(true);
    setNetworkError(null);
    try {
      let data: PatientCase[] = [];
      try {
        data = await api.getCases();
      } catch (networkErr: any) {
        console.warn('Backend getCases unavailable (likely offline):', networkErr);
      }

      // Recover and merge any local pending cases from offlineSyncService
      const pendingList = offlineSyncService.getPendingCases();
      const pendingConverted: PatientCase[] = pendingList.map((p) => ({
        id: p.id,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        language: p.language,
        facility: p.facility,
        consentGiven: p.consentGiven,
        patient: p.patient,
        chief_complaint: p.chief_complaint,
        originalStatement: p.chief_complaint,
        translatedStatement: p.chief_complaint,
        audioRecordingId: p.audioRecordingId,
        audioRecordingUrl: p.audioRecordingId ? `idb://${p.audioRecordingId}` : undefined,
        symptoms: p.symptoms.map((s) => ({
          id: s.id,
          name: s.name,
          duration: s.duration,
          severity: s.severity,
          source: (s.source as any) || 'PATIENT_VOICE',
          confidence: 'HIGH' as const,
        })),
        timeline: [],
        vitals: p.vitals,
        medical_history: [],
        medications: [],
        allergies: [],
        documents: [],
        extracted_labs: [],
        missing_information: [],
        follow_up_questions: [],
        safety_flags: [],
        contradictions: [],
        review_priority: p.review_priority,
        case_status: p.case_status,
        sync_status: p.sync_status,
        pending_sync: true,
        ai_summary: {
          narrative: p.chief_complaint,
          keyPoints: ['Queued offline case with local IndexedDB assets'],
          suggestedFocus: 'Clinical review',
        },
        ai_disclaimer: 'Advisory / Triage Support Only — Verification required.',
      }));

      // Combine cases: pending local offline cases take precedence over stale backend copies
      const map = new Map<string, PatientCase>();
      for (const c of data) map.set(c.id, c);
      for (const p of pendingConverted) map.set(p.id, p);

      const merged = Array.from(map.values()).sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );

      setCases(merged);
    } catch (err: any) {
      console.error('Failed to fetch cases:', err);
      setNetworkError('Failed to communicate with healthcare triage backend.');
    } finally {
      setLoading(false);
    }
  };

  // Selected case
  const currentCase = cases.find((c) => c.id === selectedCaseId) || cases[0];

  const handleStartNewCase = () => {
    if (!consentGiven) {
      setPendingIntakeAfterConsent(true);
      setConsentModalOpen(true);
    } else {
      setActiveView('INTAKE');
    }
  };

  const handleConsentAccepted = () => {
    setConsentGiven(true);
    setConsentModalOpen(false);
    if (pendingIntakeAfterConsent) {
      setPendingIntakeAfterConsent(false);
      setActiveView('INTAKE');
    }
  };

  const handleSelectCase = (caseId: string) => {
    setSelectedCaseId(caseId);
    setActiveView('CASE_DETAIL');
  };

  const handleCaseUpdated = async (updated: PatientCase) => {
    // Optimistically update local React state
    setCases((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));

    // If effectively online (not in simulated offline mode and physical network connected)
    if (effectiveOnlineStatus) {
      try {
        await api.updateCase(updated.id, updated);
        await firestoreCasesService.saveCase(updated).catch(() => {});
        // Online update succeeded: ensure local pending queue does not retain it
        offlineSyncService.removeLocalCase(updated.id);
        return;
      } catch (e) {
        console.warn('Online case update failed, queueing offline:', e);
      }
    }

    // Offline or network update failure: queue as PENDING_SYNC
    const marked: PatientCase = {
      ...updated,
      sync_status: 'PENDING_SYNC',
      pending_sync: true,
    };
    offlineSyncService.queueCase(marked);
    setCases((prev) => prev.map((c) => (c.id === updated.id ? marked : c)));
  };

  return (
    <div className={`min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans ${lowBandwidth ? 'text-[13px]' : ''}`}>
      {/* Universal Navbar */}
      <Navbar
        currentRole={currentRole}
        onSelectRole={setCurrentRole}
        language={language}
        onSelectLanguage={setLanguage}
        activeView={activeView === 'LANDING' ? 'QUEUE' : activeView}
        onNavigate={(view) => setActiveView(view)}
        onOpenDemoCases={() => setDemoModalOpen(true)}
        onOpenTranscriber={() => setTranscriberModalOpen(true)}
        pendingSyncCount={pendingSyncCount}
        onSyncNow={handleSyncPending}
        isSyncing={isSyncing}
        lowBandwidth={lowBandwidth}
        onToggleLowBandwidth={() => setLowBandwidth(!lowBandwidth)}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6">
        {syncToast && (
          <div
            className={`mb-4 p-3 rounded-lg border text-xs flex items-center justify-between shadow-lg animate-in fade-in ${
              syncToast.type === 'success'
                ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-200'
                : syncToast.type === 'warning'
                ? 'bg-amber-950/60 border-amber-500/50 text-amber-200'
                : 'bg-rose-950/60 border-rose-500/50 text-rose-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {syncToast.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              )}
              <span className="font-medium">{syncToast.message}</span>
            </div>
            <button
              onClick={() => setSyncToast(null)}
              className="text-slate-400 hover:text-white text-xs px-2 py-0.5 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}
        {networkError && (
          <div className="mb-4 p-3 rounded-lg bg-rose-950/40 border border-rose-500/40 text-xs text-rose-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{networkError}</span>
            </div>
            <button
              onClick={fetchCases}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs"
            >
              Retry
            </button>
          </div>
        )}

        {/* SCREEN 1: LANDING PAGE */}
        {activeView === 'LANDING' && (
          <div className="space-y-10 py-6 max-w-5xl mx-auto">
            {/* Hero Section */}
            <div className="text-center space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/10 border border-teal-500/30 text-teal-300 text-xs font-semibold">
                <HeartPulse className="w-4 h-4 text-teal-400" />
                <span>Non-Diagnostic Multimodal Triage Support for Indian Health Facilities</span>
              </div>

              <h1 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight leading-tight">
                Multimodal Healthcare Triage Assistant
              </h1>

              <p className="text-base sm:text-lg text-slate-300 max-w-3xl mx-auto font-medium">
                AI-assisted information organization for faster human healthcare review in government hospitals, CHCs, primary health centres, and institutional clinics.
              </p>

              {/* Core Product Principle Banner */}
              <div className="bg-slate-900 border border-teal-500/40 rounded-xl p-4 max-w-2xl mx-auto shadow-md">
                <span className="text-xs uppercase font-mono tracking-widest text-teal-400 font-bold block mb-1">
                  Core Product Principle
                </span>
                <p className="text-lg font-bold text-white tracking-wide">
                  "AI organizes. Rules safeguard. Humans decide."
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Converts patient voice (Odia/Hindi/En), text, and medical reports into evidence-linked structured notes for qualified medical officer evaluation.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <button
                  onClick={handleStartNewCase}
                  className="px-6 py-3 bg-teal-600 hover:bg-teal-500 text-white font-bold text-sm rounded-xl flex items-center gap-2 transition shadow-lg shadow-teal-950 cursor-pointer"
                >
                  <ClipboardList className="w-4 h-4" />
                  <span>Start New Patient Intake</span>
                </button>

                <button
                  onClick={() => setActiveView('QUEUE')}
                  className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-sm rounded-xl flex items-center gap-2 transition cursor-pointer"
                >
                  <Activity className="w-4 h-4 text-teal-400" />
                  <span>Open Reviewer Dashboard</span>
                </button>

                <button
                  onClick={() => setDemoModalOpen(true)}
                  className="px-6 py-3 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 font-semibold text-sm rounded-xl flex items-center gap-2 transition cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-indigo-400" />
                  <span>Inspect Demo Cases</span>
                </button>
              </div>
            </div>

            {/* Feature Architecture Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-4">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
                <div className="w-10 h-10 rounded-lg bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400">
                  <Languages className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-white">Multilingual Voice & OCR</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Voice input supporting native Odia, Hindi, and English. Preserves native transcript while generating standardized clinical interpretations and OCR entity extraction from physical lab slips.
                </p>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
                <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                  <BrainCircuit className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-white">Deterministic Safety Safeguard</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Rule-based urgency signals for critical thresholds (SpO2, BP crisis, Platelets &lt; 50,000 /µL, Dengue warning signs). Explains evidence with transparent <em>"Why was this flagged?"</em> factors.
                </p>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
                <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                  <UserCheck className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-white">Human-in-the-Loop Authority</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Doctors and nurses can correct extracted OCR values, edit AI summaries, endorse official inter-facility referral notes, and review chronological patient timelines.
                </p>
              </div>
            </div>

            {/* Quick Demo Case Cards on Landing */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white">Hackathon Demonstration Scenarios</h3>
                  <p className="text-xs text-slate-400">Pre-loaded synthetic patients ready for immediate walkthrough</p>
                </div>
                <button
                  onClick={() => setDemoModalOpen(true)}
                  className="text-xs text-teal-400 hover:text-teal-300 font-semibold"
                >
                  View All &gt;
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Case C Card */}
                <div
                  onClick={() => handleSelectCase('PT-101')}
                  className="bg-slate-950 p-4 rounded-xl border border-rose-500/40 hover:border-rose-400 cursor-pointer transition space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-rose-300">Case C • PT-101</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300">
                      🔴 URGENT
                    </span>
                  </div>
                  <h4 className="text-xs font-bold text-white">Dengue Warning & Low Platelets (38,000 /µL)</h4>
                  <p className="text-[11px] text-slate-400 line-clamp-2">
                    Odia voice transcript + CBC lab slip. Triggers deterministic safety rule & inter-facility referral draft.
                  </p>
                </div>

                {/* Case B Card */}
                <div
                  onClick={() => handleSelectCase('PT-102')}
                  className="bg-slate-950 p-4 rounded-xl border border-amber-500/40 hover:border-amber-400 cursor-pointer transition space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-amber-300">Case B • PT-102</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300">
                      🟡 PRIORITY
                    </span>
                  </div>
                  <h4 className="text-xs font-bold text-white">Missing Information & Adaptive Questions</h4>
                  <p className="text-[11px] text-slate-400 line-clamp-2">
                    Acute abdominal pain in 28F with unrecorded vitals and duration. Triggers dynamic follow-up question engine.
                  </p>
                </div>

                {/* Case A Card */}
                <div
                  onClick={() => handleSelectCase('PT-103')}
                  className="bg-slate-950 p-4 rounded-xl border border-emerald-500/40 hover:border-emerald-400 cursor-pointer transition space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-emerald-300">Case A • PT-103</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300">
                      🟢 ROUTINE
                    </span>
                  </div>
                  <h4 className="text-xs font-bold text-white">Routine Upper Respiratory Coryza</h4>
                  <p className="text-[11px] text-slate-400 line-clamp-2">
                    Runny nose & sore throat with complete history, normal physiological vitals, and routine priority queueing.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SCREEN 3: PATIENT INTAKE */}
        {activeView === 'INTAKE' && (
          <IntakeForm
            language={language}
            onCaseCreatedOrUpdated={(newCase) => {
              // IntakeForm is the authoritative queue-ingestion point for offline cases.
              // Update state with newCase without duplicate queueing.
              setCases((prev) => [newCase, ...prev.filter((c) => c.id !== newCase.id)]);
              // If case was successfully submitted online, ensure local pending queue does not hold it
              if (newCase.sync_status !== 'PENDING_SYNC') {
                offlineSyncService.removeLocalCase(newCase.id);
              }
            }}
            onGoToReview={(caseId) => {
              setSelectedCaseId(caseId);
              setActiveView('CASE_DETAIL');
            }}
          />
        )}

        {/* SCREEN 6: REVIEWER QUEUE */}
        {activeView === 'QUEUE' && (
          <CaseQueue
            cases={cases}
            onSelectCase={handleSelectCase}
            onRefresh={fetchCases}
            pendingSyncCount={pendingSyncCount}
            onSyncNow={handleSyncPending}
            isSyncing={isSyncing}
          />
        )}

        {/* SCREEN 7: CASE REVIEW DETAIL */}
        {activeView === 'CASE_DETAIL' && currentCase && (
          <CaseDetailView
            patientCase={currentCase}
            onBack={() => setActiveView('QUEUE')}
            onCaseUpdated={handleCaseUpdated}
          />
        )}

        {/* SCREEN 8: ADMIN & AUDIT */}
        {activeView === 'ADMIN' && (
          <AdminDashboard
            cases={cases}
            onRefreshData={fetchCases}
          />
        )}
      </main>

      {/* Universal Footer */}
      <footer className="bg-slate-900 border-t border-slate-800 text-slate-400 text-xs py-4 px-6 mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          <div className="space-y-0.5">
            <span className="font-semibold text-slate-300">
              AarogyaTriage — Multimodal Healthcare Triage Assistant
            </span>
            <p className="text-[11px]">
              Prototype for Government Hospitals, CHCs, PHCs & Institutional Health Units in India
            </p>
          </div>
          <div className="flex items-center gap-4 text-[11px] text-slate-400">
            <button
              onClick={() => setConsentModalOpen(true)}
              className="hover:text-teal-300 transition underline"
            >
              Consent & Privacy Policy
            </button>
            <span>•</span>
            <span className="font-mono text-teal-400">AI: Gemini Multimodal Flash</span>
            <span>•</span>
            <span className="text-amber-400">Non-Diagnostic Prototype</span>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <ConsentModal
        isOpen={consentModalOpen}
        onConsentAccepted={handleConsentAccepted}
        onClose={() => setConsentModalOpen(false)}
      />

      <DemoCasesModal
        isOpen={demoModalOpen}
        onClose={() => setDemoModalOpen(false)}
        onSelectCase={handleSelectCase}
        onResetDemoData={async () => {
          await api.resetDemo();
          await fetchCases();
        }}
        cases={cases}
      />

      <AudioTranscriberModal
        isOpen={transcriberModalOpen}
        onClose={() => setTranscriberModalOpen(false)}
        onInsertIntoIntake={() => {
          setActiveView('INTAKE');
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ConnectivityProvider>
        <MainApp />
      </ConnectivityProvider>
    </AuthProvider>
  );
}
