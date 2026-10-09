import React, { useState } from 'react';
import {
  Search,
  Filter,
  Clock,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Sparkles,
  Building2,
  RefreshCw,
  User,
  Cloud,
  CloudAlert,
  HardDrive,
} from 'lucide-react';
import { PatientCase, ReviewPriority, CaseStatus } from '../../types';

interface CaseQueueProps {
  cases: PatientCase[];
  onSelectCase: (caseId: string) => void;
  onRefresh: () => void;
  pendingSyncCount?: number;
  onSyncNow?: () => void;
  isSyncing?: boolean;
}

export const CaseQueue: React.FC<CaseQueueProps> = ({
  cases,
  onSelectCase,
  onRefresh,
  pendingSyncCount = 0,
  onSyncNow,
  isSyncing = false,
}) => {
  const [filterPriority, setFilterPriority] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const filteredCases = cases.filter((c) => {
    if (filterPriority !== 'ALL' && c.review_priority !== filterPriority) return false;
    if (filterStatus !== 'ALL' && c.case_status !== filterStatus) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchId = c.id.toLowerCase().includes(q);
      const matchComplaint = c.chief_complaint.toLowerCase().includes(q);
      const matchName = c.patient.syntheticName.toLowerCase().includes(q);
      if (!matchId && !matchComplaint && !matchName) return false;
    }
    return true;
  });

  const getWaitingTime = (createdAt: string) => {
    const diffMs = Date.now() - new Date(createdAt).getTime();
    const mins = Math.floor(diffMs / (1000 * 60));
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    return `${hours}h ${mins % 60}m ago`;
  };

  return (
    <div className="space-y-4">
      {/* Metrics Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
            Total Intake Queue
          </span>
          <span className="text-xl font-bold text-white mt-1 block">{cases.length}</span>
        </div>

        <div className="bg-rose-950/30 border border-rose-500/30 rounded-xl p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-rose-300 uppercase tracking-wider block">
              Urgent Review
            </span>
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
          </div>
          <span className="text-xl font-bold text-rose-200 mt-1 block">
            {cases.filter((c) => c.review_priority === 'URGENT').length}
          </span>
        </div>

        <div className="bg-amber-950/30 border border-amber-500/30 rounded-xl p-3.5">
          <span className="text-[11px] font-semibold text-amber-300 uppercase tracking-wider block">
            Priority Review
          </span>
          <span className="text-xl font-bold text-amber-200 mt-1 block">
            {cases.filter((c) => c.review_priority === 'PRIORITY').length}
          </span>
        </div>

        <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-xl p-3.5">
          <span className="text-[11px] font-semibold text-emerald-300 uppercase tracking-wider block">
            Routine Cases
          </span>
          <span className="text-xl font-bold text-emerald-200 mt-1 block">
            {cases.filter((c) => c.review_priority === 'ROUTINE').length}
          </span>
        </div>
      </div>

      {/* Cloud Sync Status Alert Banner if cases are waiting to sync */}
      {pendingSyncCount > 0 && (
        <div className="bg-amber-950/40 border border-amber-500/40 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs text-amber-200">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0">
              <HardDrive className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <div className="font-bold text-white flex items-center gap-2">
                <span>{pendingSyncCount} Case(s) Waiting for Cloud Sync</span>
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Ephemeral Queue
                </span>
              </div>
              <p className="text-[11px] text-amber-300/80 mt-0.5">
                Stored with only minimum required fields to safeguard patient privacy. Local cache automatically evicts upon successful Cloud Firestore synchronization.
              </p>
            </div>
          </div>
          {onSyncNow && (
            <button
              onClick={onSyncNow}
              disabled={isSyncing}
              className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold rounded-lg text-xs flex items-center gap-1.5 transition cursor-pointer shadow-sm disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Syncing Now...' : 'Sync All Pending Now'}</span>
            </button>
          )}
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          <div className="relative w-full">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search case ID, complaint, or synthetic name..."
              className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:ring-1 focus:ring-teal-500 outline-none"
            />
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          {/* Priority Filter */}
          <div className="flex items-center gap-1 bg-slate-950 border border-slate-700 rounded-lg p-1">
            <span className="text-slate-400 px-1 text-[11px]">Priority:</span>
            <button
              onClick={() => setFilterPriority('ALL')}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${
                filterPriority === 'ALL' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilterPriority('URGENT')}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${
                filterPriority === 'URGENT' ? 'bg-rose-600 text-white' : 'text-rose-300 hover:text-white'
              }`}
            >
              Urgent
            </button>
            <button
              onClick={() => setFilterPriority('PRIORITY')}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${
                filterPriority === 'PRIORITY' ? 'bg-amber-600 text-white' : 'text-amber-300 hover:text-white'
              }`}
            >
              Priority
            </button>
            <button
              onClick={() => setFilterPriority('ROUTINE')}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${
                filterPriority === 'ROUTINE' ? 'bg-emerald-600 text-white' : 'text-emerald-300 hover:text-white'
              }`}
            >
              Routine
            </button>
          </div>

          {/* Status Filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-slate-950 text-slate-300 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-teal-500 cursor-pointer"
          >
            <option value="ALL">All Statuses</option>
            <option value="WAITING">Waiting Review</option>
            <option value="REVIEWED">Reviewed & Approved</option>
            <option value="ESCALATED">Escalated</option>
          </select>

          <button
            onClick={onRefresh}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg transition"
            title="Refresh Queue"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Case Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300 border-collapse">
            <thead className="bg-slate-950/80 border-b border-slate-800 text-[11px] text-slate-400 uppercase font-mono tracking-wider">
              <tr>
                <th className="py-3 px-4">Case ID</th>
                <th className="py-3 px-4">AI Review Priority</th>
                <th className="py-3 px-4">Patient / Demog</th>
                <th className="py-3 px-4">Chief Complaint & Key Symptoms</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Waiting Time</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredCases.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    No cases match the selected filter criteria.
                  </td>
                </tr>
              ) : (
                filteredCases.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => onSelectCase(c.id)}
                    className="hover:bg-slate-800/60 cursor-pointer transition group"
                  >
                    {/* Case ID */}
                    <td className="py-3 px-4 font-mono font-bold text-white whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span className="text-teal-400 group-hover:underline">{c.id}</span>
                        {c.safety_flags.length > 0 && (
                          <span
                            className="w-2 h-2 rounded-full bg-rose-500"
                            title={`${c.safety_flags.length} safety rule trigger(s)`}
                          />
                        )}
                      </div>
                    </td>

                    {/* AI Review Priority */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold border uppercase tracking-wider ${
                          c.review_priority === 'URGENT'
                            ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                            : c.review_priority === 'PRIORITY'
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                            : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            c.review_priority === 'URGENT'
                              ? 'bg-rose-400 animate-pulse'
                              : c.review_priority === 'PRIORITY'
                              ? 'bg-amber-400'
                              : 'bg-emerald-400'
                          }`}
                        />
                        <span>
                          {c.review_priority === 'URGENT'
                            ? '🔴 URGENT REVIEW'
                            : c.review_priority === 'PRIORITY'
                            ? '🟡 PRIORITY REVIEW'
                            : '🟢 ROUTINE'}
                        </span>
                      </span>
                    </td>

                    {/* Patient Name & Demog */}
                    <td className="py-3 px-4">
                      <div className="text-white font-medium">{c.patient.syntheticName}</div>
                      <div className="text-[11px] text-slate-400">
                        {c.patient.age ? `${c.patient.age} yrs` : 'Age N/A'}, {c.patient.sex || 'Sex N/A'}
                      </div>
                    </td>

                    {/* Chief Complaint */}
                    <td className="py-3 px-4 max-w-xs truncate">
                      <div className="text-slate-200 font-medium truncate">{c.chief_complaint}</div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                        <span>{c.symptoms.length} symptoms</span>
                        <span>•</span>
                        <span>{c.extracted_labs.length} lab records</span>
                      </div>
                    </td>

                    {/* Case Status & Sync State */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="flex flex-col gap-1 items-start">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                            c.case_status === 'REVIEWED'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : c.case_status === 'ESCALATED'
                              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                              : 'bg-slate-800 text-slate-300 border border-slate-700'
                          }`}
                        >
                          {c.case_status}
                        </span>

                        {c.sync_status === 'PENDING_SYNC' || c.pending_sync ? (
                          <span
                            className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1"
                            title="Stored with minimal required fields. Waiting for Cloud Firestore sync."
                          >
                            <HardDrive className="w-2.5 h-2.5 text-amber-400" />
                            <span>Pending Sync</span>
                          </span>
                        ) : c.sync_status === 'SYNC_FAILED' ? (
                          <span
                            className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1"
                            title={c.sync_error || 'Concurrency conflict or sync failure detected'}
                          >
                            <CloudAlert className="w-2.5 h-2.5 text-rose-400" />
                            <span>Sync Alert</span>
                          </span>
                        ) : (
                          <span
                            className="px-1.5 py-0.5 rounded text-[9px] font-mono text-slate-400 flex items-center gap-1"
                            title="Successfully synchronized to Cloud Firestore"
                          >
                            <Cloud className="w-2.5 h-2.5 text-teal-400/80" />
                            <span>Synced</span>
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Waiting Time */}
                    <td className="py-3 px-4 whitespace-nowrap text-slate-400 font-mono text-[11px]">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-500" />
                        <span>{getWaitingTime(c.createdAt)}</span>
                      </div>
                    </td>

                    {/* Open Action */}
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectCase(c.id);
                        }}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-teal-600 hover:text-white text-slate-300 rounded text-xs font-medium transition inline-flex items-center gap-1"
                      >
                        <span>Review</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
