import React from 'react';
import { AlertCircle, X, ArrowRight, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { Contradiction } from '../../types';

interface ContradictionModalProps {
  contradiction: Contradiction | null;
  onClose: () => void;
  onMarkResolved?: () => void;
}

export const ContradictionModal: React.FC<ContradictionModalProps> = ({
  contradiction,
  onClose,
  onMarkResolved,
}) => {
  if (!contradiction) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-lg w-full shadow-2xl overflow-hidden text-slate-100 flex flex-col">
        {/* Header */}
        <div className="bg-amber-950/60 border-b border-amber-800/60 p-4 flex items-start justify-between gap-3 text-amber-200">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-mono tracking-wider px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/30 font-bold">
                ⚠ Information Conflict Detected
              </span>
              <h3 className="text-base font-bold text-white mt-1">{contradiction.title}</h3>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 text-xs leading-relaxed">
          <p className="text-slate-300">{contradiction.description}</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Source A */}
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-1.5">
              <span className="text-[10px] text-teal-400 font-bold uppercase font-mono block">
                Source A: {contradiction.itemA.source}
              </span>
              <p className="text-slate-200 font-mono text-xs italic">
                "{contradiction.itemA.statement}"
              </p>
            </div>

            {/* Source B */}
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-1.5">
              <span className="text-[10px] text-amber-400 font-bold uppercase font-mono block">
                Source B: {contradiction.itemB.source}
              </span>
              <p className="text-slate-200 font-mono text-xs italic">
                "{contradiction.itemB.statement}"
              </p>
            </div>
          </div>

          <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-3 space-y-1">
            <span className="text-teal-300 font-semibold text-[11px] uppercase tracking-wider block">
              Required Reviewer Action:
            </span>
            <p className="text-slate-200 font-medium">{contradiction.actionRequired}</p>
          </div>

          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5 flex items-start gap-2 text-[11px] text-amber-300">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span>
              The AI does not arbitrarily choose which source is correct. The clinical reviewer must reconcile discordant data during physical patient evaluation.
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-950/80 border-t border-slate-800 px-5 py-3 flex items-center justify-between">
          <button
            onClick={() => {
              if (onMarkResolved) onMarkResolved();
              onClose();
            }}
            className="px-3.5 py-1.5 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Mark Reconciled by Reviewer</span>
          </button>
          <button onClick={onClose} className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
