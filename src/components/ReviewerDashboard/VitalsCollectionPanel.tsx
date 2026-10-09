import React, { useState } from 'react';
import { PatientCase, Vitals } from '../../types';
import { AlertCircle, Check, Save } from 'lucide-react';

interface VitalsCollectionPanelProps {
  patientCase: PatientCase;
  onUpdateVitals: (newVitals: Partial<Vitals>) => Promise<void>;
}

export const VitalsCollectionPanel: React.FC<VitalsCollectionPanelProps> = ({ patientCase, onUpdateVitals }) => {
  const currentVitals = patientCase.vitals || {};
  
  const [temp, setTemp] = useState(currentVitals.temperature?.value?.toString() || '');
  const [sys, setSys] = useState(currentVitals.blood_pressure?.systolic?.toString() || '');
  const [dia, setDia] = useState(currentVitals.blood_pressure?.diastolic?.toString() || '');
  const [hr, setHr] = useState(currentVitals.heart_rate?.value?.toString() || '');
  const [spo2, setSpo2] = useState(currentVitals.spo2?.value?.toString() || '');
  const [resp, setResp] = useState(currentVitals.respiratory_rate?.value?.toString() || '');
  
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const missingFlags = {
    temp: !currentVitals.temperature?.value,
    bp: !currentVitals.blood_pressure?.systolic,
    hr: !currentVitals.heart_rate?.value,
    spo2: !currentVitals.spo2?.value,
    resp: !currentVitals.respiratory_rate?.value,
  };

  const hasMissing = Object.values(missingFlags).some(Boolean);

  const handleSave = async () => {
    setError(null);
    try {
      const updates: Partial<Vitals> = {};

      if (temp) {
        const t = parseFloat(temp);
        if (isNaN(t) || t < 70 || t > 115) throw new Error("Temperature out of plausible range (70-115).");
        updates.temperature = { value: t, unit: 'F', source: 'Reviewer Entry' };
      }
      
      if (sys || dia) {
        const s = parseInt(sys, 10);
        const d = parseInt(dia, 10);
        if (isNaN(s) || isNaN(d) || s < 30 || s > 300 || d < 10 || d > 200) throw new Error("Blood pressure out of plausible range.");
        updates.blood_pressure = { systolic: s, diastolic: d, source: 'Reviewer Entry' };
      }

      if (hr) {
        const h = parseInt(hr, 10);
        if (isNaN(h) || h < 10 || h > 300) throw new Error("Heart rate out of plausible range (10-300).");
        updates.heart_rate = { value: h, unit: 'bpm', source: 'Reviewer Entry' };
      }

      if (spo2) {
        const sp = parseInt(spo2, 10);
        if (isNaN(sp) || sp < 10 || sp > 100) throw new Error("SpO2 out of plausible range (10-100%).");
        updates.spo2 = { value: sp, unit: '%', source: 'Reviewer Entry' };
      }

      if (resp) {
        const r = parseInt(resp, 10);
        if (isNaN(r) || r < 0 || r > 100) throw new Error("Respiratory rate out of plausible range (0-100).");
        updates.respiratory_rate = { value: r, unit: 'breaths/min', source: 'Reviewer Entry' };
      }

      setIsSaving(true);
      await onUpdateVitals(updates);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  if (!hasMissing) return null;

  return (
    <div className="bg-rose-950/20 border border-rose-900/50 rounded-xl p-4 mb-6 shadow-sm">
      <div className="flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-rose-400 mt-0.5 flex-shrink-0" />
        <div className="w-full">
          <h3 className="text-sm font-bold text-rose-300">Reviewer Action Required: Missing Clinical Vitals</h3>
          <p className="text-xs text-rose-200/80 mt-1 mb-4">
            Please collect the following measurements from the patient using appropriate clinical equipment and approved procedures.
          </p>

          {error && <div className="text-xs text-rose-400 mb-3">{error}</div>}

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {missingFlags.temp && (
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-400">Temp (°F)</label>
                <input type="number" step="0.1" value={temp} onChange={e => setTemp(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-rose-500" placeholder="98.6" />
              </div>
            )}
            
            {missingFlags.bp && (
              <div className="space-y-1 col-span-2 md:col-span-1">
                <label className="text-[10px] uppercase font-bold text-slate-400">BP (mmHg)</label>
                <div className="flex items-center gap-1">
                  <input type="number" value={sys} onChange={e => setSys(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm text-white text-center focus:outline-none focus:border-rose-500" placeholder="120" />
                  <span className="text-slate-500">/</span>
                  <input type="number" value={dia} onChange={e => setDia(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm text-white text-center focus:outline-none focus:border-rose-500" placeholder="80" />
                </div>
              </div>
            )}

            {missingFlags.hr && (
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-400">Heart Rate</label>
                <input type="number" value={hr} onChange={e => setHr(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-rose-500" placeholder="bpm" />
              </div>
            )}

            {missingFlags.spo2 && (
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-400">SpO2 (%)</label>
                <input type="number" value={spo2} onChange={e => setSpo2(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-rose-500" placeholder="%" />
              </div>
            )}

            {missingFlags.resp && (
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-400">Resp. Rate</label>
                <input type="number" value={resp} onChange={e => setResp(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-rose-500" placeholder="breaths/min" />
              </div>
            )}
          </div>

          <div className="mt-4 flex justify-end">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded flex items-center gap-2 disabled:opacity-50 transition"
            >
              <Save className="w-3.5 h-3.5" />
              {isSaving ? 'Saving...' : 'Save Measurements'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
