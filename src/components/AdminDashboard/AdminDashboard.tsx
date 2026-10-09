import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  History,
  Users,
  Activity,
  Lock,
  CheckCircle2,
  RefreshCw,
  Search,
  Filter,
  Download,
  Database,
  Sliders,
} from 'lucide-react';
import { AuditLogEntry, PatientCase } from '../../types';
import { api } from '../../services/api';
import { offlineAuditStorage } from '../../services/offlineAuditStorage';

interface AdminDashboardProps {
  cases: PatientCase[];
  onRefreshData: () => Promise<void>;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  cases,
  onRefreshData,
}) => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState('ALL');
  const [filterOrigin, setFilterOrigin] = useState<'ALL' | 'ONLINE' | 'OFFLINE'>('ALL');
  const [activeTab, setActiveTab] = useState<'AUDIT' | 'PRIVACY' | 'ROLES' | 'SYSTEM'>('AUDIT');
  const [resetSuccess, setResetSuccess] = useState(false);
  const [pendingLocalCount, setPendingLocalCount] = useState(0);
  const [isSyncingAudit, setIsSyncingAudit] = useState(false);

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      let serverLogs: AuditLogEntry[] = [];
      try {
        serverLogs = await api.getAllAudit();
      } catch (err) {
        console.warn('Could not fetch server audit logs:', err);
      }

      let localLogs: AuditLogEntry[] = [];
      try {
        localLogs = await offlineAuditStorage.getAllAuditEvents();
        const pending = localLogs.filter((l) => l.syncStatus === 'PENDING' || l.syncStatus === 'SYNC_FAILED');
        setPendingLocalCount(pending.length);
      } catch (err) {
        console.warn('Could not fetch local audit logs:', err);
      }

      // Merge and deduplicate by unique id or clientEventId
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
      setLogs(merged);
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncAuditQueue = async () => {
    setIsSyncingAudit(true);
    try {
      await offlineAuditStorage.syncPendingAuditEvents();
      await fetchLogs();
    } catch (err) {
      console.error('Failed to sync audit queue:', err);
    } finally {
      setIsSyncingAudit(false);
    }
  };

  const handleResetDemoData = async () => {
    if (!window.confirm('Reset all synthetic demo cases back to fresh state?')) return;
    try {
      await api.resetDemo();
      await offlineAuditStorage.clearAllAuditEvents();
      await onRefreshData();
      await fetchLogs();
      setResetSuccess(true);
      setTimeout(() => setResetSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to reset demo:', err);
    }
  };

  const filteredLogs = logs.filter((l) => {
    if (filterRole !== 'ALL' && l.userRole !== filterRole) return false;
    if (filterOrigin !== 'ALL') {
      const orig = l.origin || 'ONLINE';
      if (orig !== filterOrigin) return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchAction = l.action.toLowerCase().includes(q);
      const matchCase = l.caseId.toLowerCase().includes(q);
      const matchDetails = l.details.toLowerCase().includes(q);
      const matchActor = (l.actorId || l.userId || '').toLowerCase().includes(q);
      if (!matchAction && !matchCase && !matchDetails && !matchActor) return false;
    }
    return true;
  });

  const exportAuditLogs = () => {
    const jsonStr = JSON.stringify(logs, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aarogya_triage_audit_log_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-white tracking-tight">Institutional Governance & System Administration</h2>
              <span className="text-xs px-2 py-0.5 rounded bg-teal-500/20 text-teal-300 border border-teal-500/30 font-medium font-mono">
                Admin Console
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Audit trails, clinical privacy safeguards, multi-role security controls, and health facility metrics.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleResetDemoData}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <RefreshCw className="w-3.5 h-3.5 text-teal-400" />
              <span>Reset Synthetic Datasets</span>
            </button>
            <button
              onClick={exportAuditLogs}
              className="px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Audit Trail</span>
            </button>
          </div>
        </div>
      </div>

      {resetSuccess && (
        <div className="p-3 bg-teal-950/60 border border-teal-500/50 rounded-xl text-xs text-teal-200 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-teal-400" />
          <span>Synthetic demo data re-initialized to initial baseline.</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-800 bg-slate-900/70 rounded-xl p-1 gap-1 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('AUDIT')}
          className={`flex-1 py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition ${
            activeTab === 'AUDIT' ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          <span>Immutable Audit Logs ({logs.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('PRIVACY')}
          className={`flex-1 py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition ${
            activeTab === 'PRIVACY' ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Privacy & Healthcare Safety Policy</span>
        </button>
        <button
          onClick={() => setActiveTab('ROLES')}
          className={`flex-1 py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition ${
            activeTab === 'ROLES' ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Role-Based Access Control (RBAC)</span>
        </button>
        <button
          onClick={() => setActiveTab('SYSTEM')}
          className={`flex-1 py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition ${
            activeTab === 'SYSTEM' ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>Facility & Architecture Config</span>
        </button>
      </div>

      {/* TAB 1: AUDIT LOGS */}
      {activeTab === 'AUDIT' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search action, case ID, or event details..."
                className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:ring-1 focus:ring-teal-500 outline-none"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-slate-400">Origin:</span>
              <select
                value={filterOrigin}
                onChange={(e) => setFilterOrigin(e.target.value as any)}
                className="bg-slate-950 text-slate-300 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-teal-500 cursor-pointer"
              >
                <option value="ALL">All Origins</option>
                <option value="ONLINE">Online Only</option>
                <option value="OFFLINE">Offline Queue</option>
              </select>

              <span className="text-slate-400">Actor Role:</span>
              <select
                value={filterRole}
                onChange={(e) => setFilterRole(e.target.value)}
                className="bg-slate-950 text-slate-300 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-teal-500 cursor-pointer"
              >
                <option value="ALL">All Roles</option>
                <option value="PATIENT_WORKER">Patient / Health Worker</option>
                <option value="REVIEWER">Doctor / Reviewer</option>
                <option value="ADMIN">System Administrator</option>
              </select>

              {pendingLocalCount > 0 && (
                <button
                  onClick={handleSyncAuditQueue}
                  disabled={isSyncingAudit}
                  className="px-2.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shadow-sm animate-pulse"
                  title="Synchronize pending offline audit events to server"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncingAudit ? 'animate-spin' : ''}`} />
                  <span>Sync {pendingLocalCount} Offline Events</span>
                </button>
              )}

              <button
                onClick={fetchLogs}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition"
                title="Refresh logs"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="border border-slate-800 rounded-lg overflow-hidden">
            <table className="w-full text-left text-xs text-slate-300 border-collapse">
              <thead className="bg-slate-950 text-[10px] text-slate-400 font-mono uppercase border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3">Case ID</th>
                  <th className="py-2.5 px-3">Actor / Role</th>
                  <th className="py-2.5 px-3">Origin / Sync</th>
                  <th className="py-2.5 px-3">Action Type</th>
                  <th className="py-2.5 px-3">Event Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 font-mono text-[11px]">
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500 italic">
                      No audit events recorded for current filter.
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-2.5 px-3 text-slate-400 whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="py-2.5 px-3 text-teal-400 font-bold whitespace-nowrap">
                        {log.caseId}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="flex flex-col gap-0.5">
                          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 text-[10px] w-fit">
                            {log.userRole}
                          </span>
                          {(log.actorId || log.userId) && (
                            <span className="text-[10px] text-slate-400 font-sans">
                              {log.actorId || log.userId}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {log.origin === 'OFFLINE' ? (
                          <span className="px-1.5 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-500/40 text-[10px] font-semibold flex items-center gap-1 w-fit">
                            <span>OFFLINE</span>
                            <span className="text-[9px] opacity-80">
                              {log.syncStatus === 'SYNCED' ? '(SYNCED)' : '(PENDING)'}
                            </span>
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-950/40 text-emerald-300 border border-emerald-500/30 text-[10px] font-semibold w-fit">
                            ONLINE
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-white font-semibold whitespace-nowrap">
                        {log.action}
                      </td>
                      <td className="py-2.5 px-3 text-slate-300 font-sans text-xs max-w-md truncate">
                        {log.details}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: PRIVACY & HEALTHCARE SAFETY POLICY */}
      {activeTab === 'PRIVACY' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm space-y-5 text-xs text-slate-300">
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white">System Privacy, Consent & Safety Compliance</h3>
            <p className="text-slate-400">
              Verified controls under the Ministry of Health Digital Triage Guidelines & Institutional Hackathon Safety Rules.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex items-center gap-2 text-teal-300 font-bold text-sm">
                <CheckCircle2 className="w-4 h-4 text-teal-400" />
                <span>✓ Synthetic Demo Data Only</span>
              </div>
              <p className="text-slate-400 leading-normal">
                Strict isolation from real Personally Identifiable Information (PII). No Aadhaar numbers, real phone numbers, or private addresses are collected or persisted.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex items-center gap-2 text-teal-300 font-bold text-sm">
                <CheckCircle2 className="w-4 h-4 text-teal-400" />
                <span>✓ Informed Consent Captured</span>
              </div>
              <p className="text-slate-400 leading-normal">
                Explicit consent screen required before patient data entry, informing the user of the non-diagnostic and educational scope of the assistant.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex items-center gap-2 text-teal-300 font-bold text-sm">
                <CheckCircle2 className="w-4 h-4 text-teal-400" />
                <span>✓ Ephemeral Local Queue & Data Minimization</span>
              </div>
              <p className="text-slate-400 leading-normal">
                Patient records are never stored indefinitely in browser storage. Local offline queue holds only the minimum required triage fields with a <code className="text-amber-300 font-mono text-[10px]">pending_sync</code> status. Upon successful Cloud Firestore synchronization, local cache is immediately evicted. Overwrites are blocked if remote data is newer, and every sync success or failure is recorded in the immutable audit log.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex items-center gap-2 text-teal-300 font-bold text-sm">
                <CheckCircle2 className="w-4 h-4 text-teal-400" />
                <span>✓ Non-Diagnostic AI Advisory Labeling</span>
              </div>
              <p className="text-slate-400 leading-normal">
                Prominently displayed banner on all screens: <em>"Advisory / Triage Support Only — Final assessment must be performed by a qualified healthcare professional."</em>
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex items-center gap-2 text-teal-300 font-bold text-sm">
                <CheckCircle2 className="w-4 h-4 text-teal-400" />
                <span>✓ Deterministic Rules Safeguard</span>
              </div>
              <p className="text-slate-400 leading-normal">
                Safety and urgency flags are determined through deterministic clinical rules and calibrated thresholds, never delegated to unconstrained model hallucination.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex items-center gap-2 text-teal-300 font-bold text-sm">
                <CheckCircle2 className="w-4 h-4 text-teal-400" />
                <span>✓ Human-in-the-Loop Authority</span>
              </div>
              <p className="text-slate-400 leading-normal">
                Doctors and nurses retain full editing power to override AI priorities, correct OCR errors, endorse final notes, or cancel escalations.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: ROLES */}
      {activeTab === 'ROLES' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm space-y-4 text-xs text-slate-300">
          <h3 className="text-base font-bold text-white">Role-Based Access Control (RBAC) Matrix</h3>
          <p className="text-slate-400">
            System permissions configured for clinical operations across rural health centers and district hospitals.
          </p>

          <div className="overflow-x-auto border border-slate-800 rounded-lg">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-950 text-[10px] text-slate-400 font-mono uppercase border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-3">Role Designation</th>
                  <th className="py-2.5 px-3">Description</th>
                  <th className="py-2.5 px-3">Intake / Voice / OCR</th>
                  <th className="py-2.5 px-3">Queue & Priority View</th>
                  <th className="py-2.5 px-3">Edit & Approve Notes</th>
                  <th className="py-2.5 px-3">Referral Endorsement</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 font-sans">
                <tr>
                  <td className="py-2.5 px-3 font-bold text-teal-300">Patient / Health Worker (ASHA)</td>
                  <td className="py-2.5 px-3 text-slate-400">ASHA, ANM, or patient entering voice/text/reports</td>
                  <td className="py-2.5 px-3 text-emerald-400 font-bold">✓ Full</td>
                  <td className="py-2.5 px-3 text-slate-500">Read Own</td>
                  <td className="py-2.5 px-3 text-slate-500">✗ Prohibited</td>
                  <td className="py-2.5 px-3 text-slate-500">✗ Prohibited</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-bold text-teal-300">Healthcare Reviewer (MO / Nurse)</td>
                  <td className="py-2.5 px-3 text-slate-400">Qualified Medical Officer, Staff Nurse, Clinical Triage Lead</td>
                  <td className="py-2.5 px-3 text-emerald-400 font-bold">✓ Full</td>
                  <td className="py-2.5 px-3 text-emerald-400 font-bold">✓ Full Queue</td>
                  <td className="py-2.5 px-3 text-emerald-400 font-bold">✓ Full (Authority)</td>
                  <td className="py-2.5 px-3 text-emerald-400 font-bold">✓ Endorse & Sign</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-bold text-teal-300">System Administrator</td>
                  <td className="py-2.5 px-3 text-slate-400">Facility IT Lead, Clinical Audit Officer</td>
                  <td className="py-2.5 px-3 text-slate-400">Test Mode</td>
                  <td className="py-2.5 px-3 text-emerald-400 font-bold">✓ Full</td>
                  <td className="py-2.5 px-3 text-slate-400">Audit Only</td>
                  <td className="py-2.5 px-3 text-slate-400">Audit Only</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: SYSTEM CONFIG */}
      {activeTab === 'SYSTEM' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm space-y-4 text-xs text-slate-300">
          <h3 className="text-base font-bold text-white">Institutional Architecture & Facility Configuration</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
              <span className="font-bold text-white uppercase text-[11px] block">Facility Information</span>
              <p className="text-slate-400">
                Primary Facility: <strong>Balipatna Community Health Centre (CHC)</strong><br />
                Sub-centre: <strong>Pipili PHC & Health Wellness Centre</strong><br />
                Referral Node: <strong>Puri District Headquarters Hospital (DHH)</strong>
              </p>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
              <span className="font-bold text-white uppercase text-[11px] block">Multimodal Engine Stack</span>
              <p className="text-slate-400">
                AI Engine: <strong>Gemini 2.5 Flash / Gemini Multimodal API</strong><br />
                Deterministic Guardrails: <strong>TypeScript Clinical Safety Engine</strong><br />
                Supported Languages: <strong>English, Hindi, Odia (Native OCR & Voice)</strong><br />
                Storage Architecture: <strong>Full-Stack Express + Thread-Safe In-Memory / SQLite</strong>
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
