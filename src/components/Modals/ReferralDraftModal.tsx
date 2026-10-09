import React, { useState } from 'react';
import {
  FileText,
  X,
  Printer,
  CheckCircle,
  AlertTriangle,
  Building2,
  Calendar,
  User,
  Copy,
  Check,
} from 'lucide-react';
import { ReferralDraft, PatientCase } from '../../types';

interface ReferralDraftModalProps {
  referral: ReferralDraft | null;
  patientCase: PatientCase;
  onClose: () => void;
  onApproveReferral?: (referralId: string) => void;
}

export const ReferralDraftModal: React.FC<ReferralDraftModalProps> = ({
  referral,
  patientCase,
  onClose,
  onApproveReferral,
}) => {
  const [copied, setCopied] = useState(false);
  const [isApproved, setIsApproved] = useState(referral?.status === 'APPROVED');
  const [physicianNotes, setPhysicianNotes] = useState('');

  if (!referral) return null;

  const handleCopy = () => {
    const text = `
PATIENT SAFETY & HANDOFF INTELLIGENCE SUMMARY
=========================================
Referral Ref: ${referral.referralId}
Date: ${new Date(referral.generatedAt).toLocaleString()}
Originating Facility: ${referral.facilityFrom}
Referred To: ${referral.facilityTo}
Patient ID: ${referral.patientId} (Age: ${patientCase.patient.age || 'N/A'}, Sex: ${patientCase.patient.sex || 'N/A'})

PRESENTING COMPLAINT:
${referral.presentingComplaint}

SYMPTOMS:
${referral.relevantSymptoms.join(', ')}

TIMELINE:
${referral.timelineSummary}

VITALS RECORDED:
${referral.vitalsSummary}

LABORATORY INVESTIGATIONS:
${referral.investigationsSummary}

SAFETY SIGNALS IDENTIFIED:
${referral.safetySignals.join('; ') || 'None flagged'}

REASON FOR REFERRAL:
${referral.reasonForReferral}

ATTACHED DOCUMENTS:
${referral.supportingDocuments.join(', ') || 'None'}

STATUS: ${isApproved ? 'APPROVED BY QUALIFIED MEDICAL OFFICER' : 'DRAFT - AWAITING HUMAN REVIEW'}
${physicianNotes ? `PHYSICIAN NOTES: ${physicianNotes}` : ''}
DISCLAIMER: Advisory / Triage Support Only — Final assessment must be performed by a qualified healthcare professional.
    `.trim();

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleApprove = () => {
    setIsApproved(true);
    if (onApproveReferral) {
      onApproveReferral(referral.referralId);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-3xl w-full shadow-2xl overflow-hidden text-slate-100 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-slate-800/90 border-b border-slate-700 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-teal-500/20 border border-teal-400/30 flex items-center justify-center text-teal-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">Patient Safety & Handoff Intelligence Summary</h3>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                  isApproved
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                }`}>
                  {isApproved ? 'Approved by Medical Officer' : 'AI-Assisted Draft Requiring Verification'}
                </span>
              </div>
              <p className="text-xs text-slate-400">Chronological evidence-linked summary for clinical handover</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-600 rounded-lg text-xs font-medium flex items-center gap-1.5 transition"
              title="Copy Referral Text"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-teal-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
            <button
              onClick={handlePrint}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-600 rounded-lg text-xs font-medium flex items-center gap-1.5 transition"
              title="Print Referral Slip"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print</span>
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Advisory Warning Banner */}
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 flex items-center gap-2 text-xs text-amber-300">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>
            <strong>Human Approval Required:</strong> The AI organizes factual clinical inputs into a standard referral format. The referring physician must independently confirm the clinical necessity of referral.
          </span>
        </div>

        {/* Content (Printable Slip) */}
        <div className="p-6 overflow-y-auto space-y-4 text-xs leading-relaxed text-slate-200 print:text-black print:bg-white">
          {/* Facility & Metadata block */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-950/60 p-3.5 rounded-lg border border-slate-800">
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-mono block">Referral Ref</span>
              <span className="font-bold font-mono text-teal-300">{referral.referralId}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-mono block">Patient Case</span>
              <span className="font-bold text-white">{referral.patientId}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-mono block">Originating Facility</span>
              <div className="flex items-center gap-1 text-slate-200">
                <Building2 className="w-3 h-3 text-teal-400 shrink-0" />
                <span className="truncate">{referral.facilityFrom}</span>
              </div>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-mono block">Referring To</span>
              <span className="font-semibold text-amber-300">{referral.facilityTo}</span>
            </div>
          </div>

          {/* Patient Details */}
          <div className="bg-slate-800/40 p-3 rounded-lg border border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-slate-400" />
              <span className="font-semibold text-white">{patientCase.patient.syntheticName}</span>
              <span className="text-slate-400">
                ({patientCase.patient.age ? `${patientCase.patient.age} yrs` : 'Age unrecorded'}, {patientCase.patient.sex || 'Sex unrecorded'})
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
              <Calendar className="w-3.5 h-3.5" />
              <span>{new Date(referral.generatedAt).toLocaleDateString()}</span>
            </div>
          </div>

          {/* Presenting Complaint & Symptoms */}
          <div className="space-y-1">
            <span className="font-bold text-slate-300 uppercase tracking-wider text-[11px]">1. Presenting Complaint & Relevant Symptoms</span>
            <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800">
              <p className="font-semibold text-white">{referral.presentingComplaint}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {referral.relevantSymptoms.map((s, idx) => (
                  <span key={idx} className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 text-[11px]">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Timeline & Vitals */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <span className="font-bold text-slate-300 uppercase tracking-wider text-[11px]">2. Timeline Sequence</span>
              <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800 h-24 overflow-y-auto font-mono text-[11px] text-slate-300">
                {referral.timelineSummary}
              </div>
            </div>

            <div className="space-y-1">
              <span className="font-bold text-slate-300 uppercase tracking-wider text-[11px]">3. Available Vitals</span>
              <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800 h-24 overflow-y-auto font-mono text-[11px] text-slate-300">
                {referral.vitalsSummary}
              </div>
            </div>
          </div>

          {/* Investigations & Safety signals */}
          <div className="space-y-1">
            <span className="font-bold text-slate-300 uppercase tracking-wider text-[11px]">4. Laboratory & Document Evidence</span>
            <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800 font-mono text-[11px] text-slate-200">
              {referral.investigationsSummary}
            </div>
          </div>

          {referral.safetySignals.length > 0 && (
            <div className="space-y-1">
              <span className="font-bold text-rose-300 uppercase tracking-wider text-[11px]">5. Safety & Urgency Signals</span>
              <div className="bg-rose-950/30 p-3 rounded-lg border border-rose-500/30 space-y-1 text-rose-200">
                {referral.safetySignals.map((sig, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                    <span>{sig}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Reason for referral */}
          <div className="space-y-1">
            <span className="font-bold text-slate-300 uppercase tracking-wider text-[11px]">6. Reason for Referral</span>
            <div className="bg-teal-950/30 p-3 rounded-lg border border-teal-500/30 text-teal-200 font-medium">
              {referral.reasonForReferral}
            </div>
          </div>

          {/* Physician notes input for doctor */}
          <div className="space-y-1 pt-2">
            <span className="font-bold text-slate-300 uppercase tracking-wider text-[11px]">7. Referring Medical Officer Notes & Endorsement</span>
            <textarea
              value={physicianNotes}
              onChange={(e) => setPhysicianNotes(e.target.value)}
              placeholder="Enter clinical notes, emergency medications administered en route, IV fluid status, ambulance transfer instructions..."
              rows={2}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white placeholder-slate-500 focus:ring-1 focus:ring-teal-500 outline-none"
            />
          </div>
        </div>

        {/* Footer actions */}
        <div className="bg-slate-950/80 border-t border-slate-800 p-4 flex items-center justify-between">
          <div className="text-[11px] text-slate-400">
            {isApproved ? 'Status: Endorsed & Approved' : 'Status: Draft awaiting signature'}
          </div>
          <div className="flex items-center gap-2">
            {!isApproved ? (
              <button
                onClick={handleApprove}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg text-xs flex items-center gap-1.5 transition shadow-md shadow-emerald-900/30"
              >
                <CheckCircle className="w-4 h-4" />
                <span>Approve & Endorse Referral</span>
              </button>
            ) : (
              <div className="flex items-center gap-1.5 text-emerald-400 font-semibold text-xs bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/20">
                <CheckCircle className="w-4 h-4" />
                <span>Endorsed by Qualified Medical Officer</span>
              </div>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium rounded-lg text-xs transition"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
