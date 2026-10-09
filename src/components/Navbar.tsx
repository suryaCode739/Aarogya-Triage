import React, { useState } from 'react';
import {
  ShieldAlert,
  Activity,
  UserCheck,
  Building2,
  Globe,
  Wifi,
  Sparkles,
  ClipboardList,
  Mic,
  LogIn,
  LogOut,
  User as UserIcon,
  Cloud,
  CloudOff,
  RefreshCw,
} from 'lucide-react';
import { UserRole, SupportedLanguage } from '../types';
import { useAuth } from '../context/AuthContext';
import { useConnectivity } from '../context/ConnectivityContext';
import { ConnectionStatus } from './ConnectionStatus';

interface NavbarProps {
  currentRole: UserRole;
  onSelectRole: (role: UserRole) => void;
  language: SupportedLanguage;
  onSelectLanguage: (lang: SupportedLanguage) => void;
  activeView: 'QUEUE' | 'INTAKE' | 'CASE_DETAIL' | 'ADMIN';
  onNavigate: (view: 'QUEUE' | 'INTAKE' | 'ADMIN') => void;
  onOpenDemoCases: () => void;
  onOpenTranscriber?: () => void;
  pendingSyncCount?: number;
  onSyncNow?: () => void;
  isSyncing?: boolean;
  lowBandwidth: boolean;
  onToggleLowBandwidth: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentRole,
  onSelectRole,
  language,
  onSelectLanguage,
  activeView,
  onNavigate,
  onOpenDemoCases,
  onOpenTranscriber,
  pendingSyncCount = 0,
  onSyncNow,
  isSyncing = false,
  lowBandwidth,
  onToggleLowBandwidth,
}) => {
  const { currentUser, userProfile, signInWithGoogle, logout } = useAuth();
  const { isOnline, isSimulatedOffline, effectiveOnlineStatus } = useConnectivity();

  return (
    <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-40">
      {/* Top Advisory Banner */}
      <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-1 text-xs text-amber-300 flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-medium">
          <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>ADVISORY / TRIAGE SUPPORT ONLY — Non-diagnostic system. Final assessment must be performed by a qualified healthcare professional.</span>
        </div>
        <span className="hidden md:inline font-mono text-[11px] text-amber-400/80">Govt & Institutional Health Facilities</span>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
        {/* Brand & Facility */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => onNavigate('QUEUE')}
            className="flex items-center gap-2.5 text-left group cursor-pointer"
          >
            <div className="w-9 h-9 rounded-lg bg-teal-600 flex items-center justify-center text-white shadow-md shadow-teal-900/50 group-hover:bg-teal-500 transition">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-base tracking-tight text-white">AarogyaTriage</span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-teal-500/20 text-teal-300 border border-teal-500/30">
                  Multimodal Copilot
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">AI Organizes • Rules Safeguard • Humans Decide</p>
            </div>
          </button>

          <div className="hidden lg:flex items-center gap-1.5 ml-3 pl-3 border-l border-slate-800 text-xs text-slate-300 bg-slate-800/60 px-2.5 py-1.5 rounded-md">
            <Building2 className="w-3.5 h-3.5 text-teal-400" />
            <span className="font-medium">CHC Balipatna / Dist. Hospital Puri</span>
          </div>
        </div>

        {/* Navigation & Controls */}
        <div className="flex items-center flex-wrap gap-2">
          {/* Main Views */}
          <div className="flex items-center bg-slate-800/90 p-1 rounded-lg border border-slate-700/80 text-xs">
            <button
              onClick={() => onNavigate('INTAKE')}
              className={`px-3 py-1.5 rounded-md font-medium transition flex items-center gap-1.5 cursor-pointer ${
                activeView === 'INTAKE'
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <ClipboardList className="w-3.5 h-3.5" />
              <span>Patient Intake</span>
            </button>
            <button
              onClick={() => onNavigate('QUEUE')}
              className={`px-3 py-1.5 rounded-md font-medium transition flex items-center gap-1.5 cursor-pointer ${
                activeView === 'QUEUE' || activeView === 'CASE_DETAIL'
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Reviewer Queue</span>
            </button>
            <button
              onClick={() => onNavigate('ADMIN')}
              className={`px-3 py-1.5 rounded-md font-medium transition flex items-center gap-1.5 cursor-pointer ${
                activeView === 'ADMIN'
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Admin & Audit</span>
            </button>
          </div>

          {/* Persistent Connection Status Indicator Component */}
          <ConnectionStatus />

          {/* Cloud Sync Status Indicator & Queue Counter */}
          {pendingSyncCount > 0 ? (
            <button
              onClick={onSyncNow}
              disabled={isSyncing || !effectiveOnlineStatus}
              className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition select-none ${
                !effectiveOnlineStatus
                  ? 'bg-amber-950/40 border-amber-600/30 text-amber-400/80 cursor-not-allowed opacity-90'
                  : 'cursor-pointer bg-amber-950/60 border-amber-500/50 text-amber-300 hover:bg-amber-900/60 animate-pulse'
              }`}
              title={
                !effectiveOnlineStatus
                  ? `${pendingSyncCount} case(s) waiting in offline queue (${
                      isSimulatedOffline ? 'simulated offline' : 'physical network offline'
                    }). Reconnect to sync.`
                  : `${pendingSyncCount} case(s) waiting to sync to Cloud Firestore. Click to sync now.`
              }
            >
              <RefreshCw className={`w-3.5 h-3.5 text-amber-400 ${isSyncing ? 'animate-spin' : ''}`} />
              <span className="font-mono text-[11px] font-bold">
                {pendingSyncCount} waiting to sync
              </span>
            </button>
          ) : (
            <div
              className="px-2.5 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 border-slate-800 bg-slate-900/80 text-slate-400 select-none hidden sm:flex"
              title="All local data successfully synced to Cloud Firestore. Local temporary cache is empty."
            >
              <Cloud className="w-3.5 h-3.5 text-teal-400" />
              <span className="font-mono text-[11px] text-slate-300">Synced</span>
            </div>
          )}

          {/* Transcribe Audio with gemini-3.5-transcribe */}
          {onOpenTranscriber && (
            <button
              onClick={onOpenTranscriber}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-teal-600/20 hover:bg-teal-600/30 text-teal-300 border border-teal-500/40 rounded-lg text-xs font-bold transition cursor-pointer"
              title="Transcribe speech with model gemini-3.5-transcribe"
            >
              <Mic className="w-3.5 h-3.5 text-teal-400" />
              <span className="hidden md:inline">Transcribe Voice</span>
            </button>
          )}

          {/* Quick Demo Cases Button */}
          <button
            onClick={onOpenDemoCases}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded-lg text-xs font-semibold transition cursor-pointer"
            title="Load Pre-configured Demonstration Cases"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden sm:inline">Demo Cases</span>
          </button>

          {/* Firebase Google Auth */}
          <div className="flex items-center">
            {currentUser ? (
              <div className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded-lg p-1 text-xs">
                {currentUser.photoURL ? (
                  <img
                    src={currentUser.photoURL}
                    alt={currentUser.displayName || 'User'}
                    className="w-5 h-5 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-teal-600 flex items-center justify-center text-[10px] font-bold text-white">
                    {currentUser.displayName ? currentUser.displayName[0].toUpperCase() : 'U'}
                  </div>
                )}
                <span className="hidden xl:inline text-slate-200 font-medium truncate max-w-[100px]">
                  {currentUser.displayName || currentUser.email}
                </span>
                <button
                  onClick={logout}
                  className="p-1 hover:text-rose-400 text-slate-400 transition"
                  title="Sign Out"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={signInWithGoogle}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white text-slate-900 hover:bg-slate-100 rounded-lg text-xs font-bold transition shadow-sm cursor-pointer"
                title="Sign in with Google (Firebase Auth)"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span className="hidden lg:inline">Sign In</span>
              </button>
            )}
          </div>

          {/* Role Switcher */}
          <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-lg p-1 text-xs">
            <span className="text-[11px] text-slate-400 px-1.5 hidden md:inline">Role:</span>
            <select
              value={currentRole}
              onChange={(e) => onSelectRole(e.target.value as UserRole)}
              className="bg-slate-900 text-slate-200 border-none rounded px-2 py-1 text-xs font-medium focus:ring-1 focus:ring-teal-500 outline-none cursor-pointer"
            >
              <option value="PATIENT_WORKER">Patient / Health Worker (ASHA)</option>
              <option value="REVIEWER">Doctor / Medical Officer</option>
              <option value="ADMIN">System Administrator</option>
            </select>
          </div>

          {/* Language Switcher */}
          <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-lg p-1 text-xs">
            <Globe className="w-3.5 h-3.5 text-slate-400 ml-1" />
            <select
              value={language}
              onChange={(e) => onSelectLanguage(e.target.value as SupportedLanguage)}
              className="bg-slate-900 text-slate-200 border-none rounded px-2 py-1 text-xs font-medium focus:ring-1 focus:ring-teal-500 outline-none cursor-pointer"
            >
              <option value="en">English</option>
              <option value="hi">हिंदी (Hindi)</option>
              <option value="or">ଓଡ଼ିଆ (Odia)</option>
              <option value="bn">বাংলা (Bengali - Ext)</option>
              <option value="te">తెలుగు (Telugu - Ext)</option>
            </select>
          </div>

          {/* Low Bandwidth Mode Toggle */}
          <button
            onClick={onToggleLowBandwidth}
            className={`p-1.5 rounded-lg border text-xs font-medium transition flex items-center gap-1 cursor-pointer ${
              lowBandwidth
                ? 'bg-amber-900/40 border-amber-500/50 text-amber-300'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
            title="Toggle Low Bandwidth / Rural PHC Mode"
          >
            <Wifi className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">{lowBandwidth ? 'Low-BW Mode ON' : 'Low-BW'}</span>
          </button>
        </div>
      </div>
    </header>
  );
};

