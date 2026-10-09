import React, { useState } from 'react';
import {
  Wifi,
  WifiOff,
  CheckCircle2,
} from 'lucide-react';
import { useConnectivity } from '../context/ConnectivityContext';

interface ConnectionStatusProps {
  className?: string;
  showDetailsPopover?: boolean;
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  className = '',
  showDetailsPopover = true,
}) => {
  // Consume shared connectivity state from unified ConnectivityContext
  const { isOnline, isSimulatedOffline, effectiveOnlineStatus, toggleSimulatedOffline } =
    useConnectivity();
  const [showPopover, setShowPopover] = useState<boolean>(false);

  return (
    <div className={`relative inline-block ${className}`}>
      {/* Persistent Visible Status Pill */}
      <button
        onClick={() => showDetailsPopover && setShowPopover(!showPopover)}
        type="button"
        className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition select-none cursor-pointer ${
          effectiveOnlineStatus
            ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300 hover:bg-emerald-950/70'
            : 'bg-rose-950/50 border-rose-500/50 text-rose-300 hover:bg-rose-950/80 animate-pulse'
        }`}
        title={`Connection State: ${effectiveOnlineStatus ? 'Online' : 'Offline'}${isSimulatedOffline ? ' (Simulated)' : ''} (Click for healthcare facility network capability)`}
        aria-label={`Connection Status: ${effectiveOnlineStatus ? 'Online' : 'Offline'}`}
      >
        {effectiveOnlineStatus ? (
          <>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <Wifi className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="font-mono text-[11px] font-bold">Online</span>
          </>
        ) : (
          <>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
            <WifiOff className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            <span className="font-mono text-[11px] font-bold">Offline</span>
          </>
        )}
      </button>

      {/* System Capability Breakdown Popover */}
      {showDetailsPopover && showPopover && (
        <div className="absolute right-0 mt-2 w-72 bg-slate-900 border border-slate-700 rounded-xl p-3.5 shadow-2xl z-50 text-xs text-slate-200 animate-in fade-in space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center gap-1.5">
              {effectiveOnlineStatus ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : (
                <WifiOff className="w-4 h-4 text-rose-400" />
              )}
              <span className="font-bold text-white">
                {effectiveOnlineStatus
                  ? 'Network Connected'
                  : isSimulatedOffline
                  ? 'Operating Offline (Simulated)'
                  : 'Operating Offline'}
              </span>
            </div>
            <button
              onClick={() => toggleSimulatedOffline()}
              className="text-[10px] text-teal-400 hover:text-teal-300 underline font-mono cursor-pointer"
              title="Toggle simulated network state for demonstration in health camps"
            >
              {isSimulatedOffline ? 'Resume Online' : 'Simulate Offline'}
            </button>
          </div>

          <div className="space-y-1.5 text-[11px]">
            <div className="flex items-center justify-between text-slate-400">
              <span>Cloud AI & Speech Sync:</span>
              <span className={effectiveOnlineStatus ? 'text-emerald-300 font-semibold' : 'text-slate-500'}>
                {effectiveOnlineStatus ? 'Active (Gemini 2.5)' : 'Queued (Local Buffer)'}
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-400">
              <span>Physical Network:</span>
              <span className={isOnline ? 'text-emerald-300 font-semibold' : 'text-rose-400 font-semibold'}>
                {isOnline ? 'Hardware Connected' : 'Disconnected'}
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-400">
              <span>Deterministic Safety Rules:</span>
              <span className="text-emerald-300 font-semibold">Active (Device-Local)</span>
            </div>
            <div className="flex items-center justify-between text-slate-400">
              <span>Triage Queue & Storage:</span>
              <span className="text-emerald-300 font-semibold">Local Storage Ready</span>
            </div>
          </div>

          <div
            className={`p-2 rounded-lg text-[11px] leading-tight ${
              effectiveOnlineStatus
                ? 'bg-slate-950 text-slate-300'
                : 'bg-rose-950/40 text-rose-200 border border-rose-500/30'
            }`}
          >
            {effectiveOnlineStatus
              ? 'Real-time multimodal speech transcription (nemotron-omni-transcribe), report OCR, and cloud sync are operational.'
              : 'Low-connectivity area mode: Health workers can continue patient intake. Deterministic urgency rules remain functional locally, and cases sync once connection is restored.'}
          </div>

          <button
            onClick={() => setShowPopover(false)}
            className="w-full py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] font-medium"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
};
