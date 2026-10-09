import React from 'react';
import { AlertTriangle, X, ShieldAlert, CheckCircle2, FileSearch, Scale } from 'lucide-react';
import { SafetyFlag } from '../../types';

interface WhyFlaggedModalProps {
  flag: SafetyFlag | null;
  onClose: () => void;
}

export const WhyFlaggedModal: React.FC<WhyFlaggedModalProps> = ({ flag, onClose }) => {
  if (!flag) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-xl w-full shadow-2xl overflow-hidden text-slate-100 flex flex-col">
        {/* Header */}
        <div className={`p-4 border-b flex items-start justify-between gap-3 ${
          flag.severity === 'URGENT'
            ? 'bg-rose-950/60 border-rose-800/60 text-rose-200'
            : flag.severity === 'PRIORITY'
            ? 'bg-amber-950/60 border-amber-800/60 text-amber-200'
            : 'bg-emerald-950/60 border-emerald-800/60 text-emerald-200'
        }`}>
          <div className="flex items-start gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
              flag.severity === 'URGENT'
                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
            }`}>
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase font-mono tracking-wider px-2 py-0.5 rounded bg-black/30 border border-white/10 font-bold">
                  {flag.severity === 'URGENT' ? '🔴 URGENT REVIEW' : flag.severity === 'PRIORITY' ? '🟡 PRIORITY REVIEW' : '🟢 ROUTINE'}
                </span>
                <span className="text-xs font-mono opacity-75">{flag.ruleId}</span>
              </div>
              <h3 className="text-base font-bold text-white mt-1 leading-snug">{flag.flag}</h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 text-xs leading-relaxed">
          {/* Reason */}
          <div className="bg-slate-800/60 border border-slate-700/80 rounded-lg p-3.5 space-y-1">
            <div className="flex items-center gap-1.5 text-slate-300 font-semibold uppercase tracking-wider text-[11px]">
              <Scale className="w-3.5 h-3.5 text-teal-400" />
              <span>Clinical Safety Justification</span>
            </div>
            <p className="text-slate-200 text-sm">{flag.reason}</p>
          </div>

          {/* Evidence */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
              <CheckCircle2 className="w-3.5 h-3.5 text-teal-400" />
              <span>Extracted Evidence & Citations</span>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-2">
              {flag.evidence && flag.evidence.length > 0 ? (
                flag.evidence.map((ev, i) => (
                  <div key={i} className="flex items-start gap-2 text-slate-200 font-mono text-xs">
                    <span className="text-teal-400 shrink-0 font-bold">•</span>
                    <span>"{ev}"</span>
                  </div>
                ))
              ) : (
                <p className="text-slate-400 italic">No specific text citation available.</p>
              )}
            </div>
          </div>

          {/* Provenance / Source */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-800/40 border border-slate-800 rounded-lg p-3">
              <span className="text-slate-400 text-[11px] block">Source Document / Input:</span>
              <div className="flex items-center gap-1.5 mt-1 text-slate-200 font-medium">
                <FileSearch className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                <span className="truncate">{flag.source || 'Patient Statement'}</span>
              </div>
            </div>
            <div className="bg-slate-800/40 border border-slate-800 rounded-lg p-3">
              <span className="text-slate-400 text-[11px] block">Evaluation Mechanism:</span>
              <span className="mt-1 block text-slate-200 font-medium font-mono text-[11px]">
                Deterministic Safety Rule
              </span>
            </div>
          </div>

          {/* Safety disclaimer */}
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 flex items-start gap-2 text-[11px] text-amber-300">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span>
              This safety flag is not a medical diagnosis. It is an algorithmic safety signal recommending expedited examination by a qualified physician or triage officer.
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-950/70 border-t border-slate-800 px-5 py-3 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">Human-in-the-Loop Safe Architecture</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
