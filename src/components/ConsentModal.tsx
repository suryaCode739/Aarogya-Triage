import React, { useState } from 'react';
import { ShieldCheck, AlertTriangle, FileText, CheckCircle2, Lock } from 'lucide-react';

interface ConsentModalProps {
  isOpen: boolean;
  onConsentAccepted: () => void;
  onClose?: () => void;
}

export const ConsentModal: React.FC<ConsentModalProps> = ({
  isOpen,
  onConsentAccepted,
}) => {
  const [agreed, setAgreed] = useState(false);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-xl w-full shadow-2xl overflow-hidden text-slate-100">
        <div className="bg-teal-950/80 border-b border-teal-800/50 p-5 flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-teal-500/20 border border-teal-400/30 flex items-center justify-center text-teal-400 shrink-0">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">
              Patient Data Intake & System Consent
            </h2>
            <p className="text-xs text-teal-300/90 mt-0.5">
              Institutional Healthcare Safety & Non-Diagnostic Advisory Notice
            </p>
          </div>
        </div>

        <div className="p-6 space-y-4 text-sm leading-relaxed text-slate-300">
          <div className="bg-amber-950/40 border border-amber-600/30 rounded-lg p-3.5 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-200/90 space-y-1">
              <p className="font-semibold text-amber-200">Core Principle: AI organizes. Rules safeguard. Humans decide.</p>
              <p>
                This system is a human-in-the-loop healthcare triage support tool. It
                <strong> does NOT diagnose diseases, prescribe medications, recommend treatments, or replace qualified doctors</strong>.
              </p>
            </div>
          </div>

          <div className="space-y-2.5 text-xs">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
              <span>
                <strong>Synthetic Demo Data Only:</strong> For hackathon evaluation and demonstrations, only synthetic or non-identifiable test patient information is utilized. Real personal identifiers (such as Aadhaar, real phone numbers, or full home addresses) are strictly prohibited.
              </span>
            </div>

            <div className="flex items-start gap-2.5">
              <FileText className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
              <span>
                <strong>Information Organization:</strong> Input voice, text, and medical report images are processed solely to extract structured timelines, detect missing variables, generate follow-up questions, and highlight rule-based safety alerts for medical reviewer assessment.
              </span>
            </div>

            <div className="flex items-start gap-2.5">
              <Lock className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
              <span>
                <strong>Auditability & Human Review:</strong> Every processing step, OCR extraction, doctor override, and referral draft is immutably logged into an institutional audit record.
              </span>
            </div>
          </div>

          <label className="flex items-start gap-3 p-3 bg-slate-800/80 rounded-lg border border-slate-700 cursor-pointer select-none hover:bg-slate-800 transition">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-slate-600 bg-slate-900 text-teal-500 focus:ring-teal-400 focus:ring-offset-slate-900"
            />
            <span className="text-xs text-slate-200 font-medium">
              I understand this is an educational triage prototype designed to organize clinical information for qualified healthcare-worker review, and I consent to processing this synthetic/demo patient information.
            </span>
          </label>
        </div>

        <div className="bg-slate-950/70 border-t border-slate-800 px-6 py-4 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">
            AarogyaTriage Safety Protocol v1.4
          </span>
          <button
            disabled={!agreed}
            onClick={onConsentAccepted}
            className={`px-5 py-2 rounded-lg font-semibold text-xs tracking-wide transition shadow-md ${
              agreed
                ? 'bg-teal-600 hover:bg-teal-500 text-white cursor-pointer shadow-teal-900/40'
                : 'bg-slate-800 text-slate-500 border border-slate-700/60 cursor-not-allowed'
            }`}
          >
            Give Consent & Continue
          </button>
        </div>
      </div>
    </div>
  );
};
