import React from 'react';
import { Sparkles, AlertCircle, HelpCircle, CheckCircle, X, ArrowRight, RefreshCw } from 'lucide-react';
import { PatientCase } from '../types';

interface DemoCasesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectCase: (caseId: string) => void;
  onResetDemoData: () => Promise<void>;
  cases: PatientCase[];
}

export const DemoCasesModal: React.FC<DemoCasesModalProps> = ({
  isOpen,
  onClose,
  onSelectCase,
  onResetDemoData,
  cases,
}) => {
  if (!isOpen) return null;

  const caseC = cases.find(c => c.id === 'PT-101');
  const caseB = cases.find(c => c.id === 'PT-102');
  const caseA = cases.find(c => c.id === 'PT-103');

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-2xl w-full shadow-2xl overflow-hidden text-slate-100 flex flex-col max-h-[90vh]">
        <div className="bg-slate-800/80 border-b border-slate-700 p-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Pre-Configured Demo Scenarios</h2>
              <p className="text-xs text-slate-400">Select a synthetic patient to inspect core triage workflows</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/60 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-3.5 text-xs">
          {/* Case C: Urgent Safety Signal */}
          <div className="bg-rose-950/30 border border-rose-500/40 rounded-xl p-4 hover:border-rose-400 transition group">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-rose-500/20 border border-rose-400/40 flex items-center justify-center text-rose-400 shrink-0 mt-0.5">
                  <AlertCircle className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm text-rose-200">Case C: Urgent Safety Signal (Dengue Warning Sign)</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/30 text-rose-300 border border-rose-500/40">
                      🔴 URGENT HUMAN REVIEW
                    </span>
                    <span className="text-slate-400 font-mono text-[11px]">PT-101 • Odia Voice & CBC</span>
                  </div>
                  <p className="text-slate-300 mt-1 leading-normal">
                    Synthetic 34M patient with 3-day high fever, persistent vomiting, petechial arm rash, and uploaded CBC revealing <strong>Platelets 38,000 /µL</strong>. Demonstrates:
                  </p>
                  <ul className="mt-1.5 list-disc list-inside text-slate-300 space-y-0.5">
                    <li>Multilingual Odia voice transcription + translation</li>
                    <li>OCR extraction of critical lab values & reference ranges</li>
                    <li>Deterministic safety rule trigger (<span className="text-rose-300 font-mono">RULE_THROMBOCYTOPENIA_CRITICAL</span>)</li>
                    <li>Transparent <em>"Why was this flagged?"</em> explainability</li>
                    <li>Inter-facility District Hospital referral draft generation</li>
                  </ul>
                </div>
              </div>
              <button
                onClick={() => {
                  onSelectCase('PT-101');
                  onClose();
                }}
                className="shrink-0 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-semibold flex items-center gap-1 transition"
              >
                <span>Open Case</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Case B: Missing Information & Adaptive Follow-up */}
          <div className="bg-amber-950/30 border border-amber-500/40 rounded-xl p-4 hover:border-amber-400 transition group">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-400 shrink-0 mt-0.5">
                  <HelpCircle className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm text-amber-200">Case B: Missing Information & Adaptive Questions</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/30 text-amber-300 border border-amber-500/40">
                      🟡 PRIORITY REVIEW
                    </span>
                    <span className="text-slate-400 font-mono text-[11px]">PT-102 • Hindi Intake</span>
                  </div>
                  <p className="text-slate-300 mt-1 leading-normal">
                    Synthetic 28F presenting with vague abdominal pain. Crucial variables (duration, vitals, LMP, allergy status) are absent. Demonstrates:
                  </p>
                  <ul className="mt-1.5 list-disc list-inside text-slate-300 space-y-0.5">
                    <li>Missing Information Engine flags 8 unrecorded clinical fields</li>
                    <li>Adaptive question engine prompts targeted follow-up queries</li>
                    <li>Interactive answering dynamically updates patient state</li>
                  </ul>
                </div>
              </div>
              <button
                onClick={() => {
                  onSelectCase('PT-102');
                  onClose();
                }}
                className="shrink-0 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-semibold flex items-center gap-1 transition"
              >
                <span>Open Case</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Case A: Routine */}
          <div className="bg-emerald-950/30 border border-emerald-500/40 rounded-xl p-4 hover:border-emerald-400 transition group">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
                  <CheckCircle className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm text-emerald-200">Case A: Routine (Mild Viral Coryza)</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/30 text-emerald-300 border border-emerald-500/40">
                      🟢 ROUTINE
                    </span>
                    <span className="text-slate-400 font-mono text-[11px]">PT-103 • Complete Info</span>
                  </div>
                  <p className="text-slate-300 mt-1 leading-normal">
                    Synthetic 42M patient with mild runny nose for 2 days. Complete history, normal vitals (BP 122/80, SpO2 99%, Temp 98.6°F), no red flags.
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  onSelectCase('PT-103');
                  onClose();
                }}
                className="shrink-0 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-semibold flex items-center gap-1 transition"
              >
                <span>Open Case</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        <div className="bg-slate-950/80 border-t border-slate-800 p-4 flex items-center justify-between">
          <button
            onClick={onResetDemoData}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Re-seed Demo Cases to Fresh State</span>
          </button>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
