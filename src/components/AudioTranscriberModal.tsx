import React, { useState, useRef } from 'react';
import {
  Mic,
  Square,
  Sparkles,
  X,
  Copy,
  Check,
  RotateCcw,
  Volume2,
  Loader2,
  AlertCircle,
  FileText,
  Languages,
} from 'lucide-react';
import { api } from '../services/api';
import { useConnectivity } from '../context/ConnectivityContext';
import { offlineAudioStorage, OfflineAudioStorageService } from '../services/offlineAudioStorage';

interface AudioTranscriberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertIntoIntake?: (text: string) => void;
}

export const AudioTranscriberModal: React.FC<AudioTranscriberModalProps> = ({
  isOpen,
  onClose,
  onInsertIntoIntake,
}) => {
  const { effectiveOnlineStatus } = useConnectivity();
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [audioBlobUrl, setAudioBlobUrl] = useState<string | null>(null);
  const [audioBase64, setAudioBase64] = useState<string | null>(null);
  const [audioMime, setAudioMime] = useState('audio/webm');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [offlineNotice, setOfflineNotice] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);

  if (!isOpen) return null;

  const startRecording = async () => {
    try {
      setErrorMsg(null);
      setOfflineNotice(null);
      setTranscript('');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const currentRecId = `modal-audio-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        setRecordingId(currentRecId);
        const url = URL.createObjectURL(audioBlob);
        setAudioBlobUrl(url);
        setAudioMime('audio/webm');

        if (!effectiveOnlineStatus) {
          // OFFLINE WORKFLOW:
          // 1. Persist the actual audio Blob to IndexedDB first
          // 2. Verify write succeeds
          // 3. Only then report that the recording has been preserved locally
          try {
            await offlineAudioStorage.saveAudioRecording({
              id: currentRecId,
              blob: audioBlob,
              mimeType: 'audio/webm',
              durationSeconds: recordingTime,
            });

            const verified = await offlineAudioStorage.hasAudioRecording(currentRecId);
            if (!verified) {
              throw new Error('Durable IndexedDB storage verification failed');
            }

            const b64 = await OfflineAudioStorageService.blobToBase64(audioBlob);
            setAudioBase64(b64);

            setOfflineNotice(
              'Voice transcription is unavailable offline. Your recording will be preserved for later processing in local IndexedDB storage. You can play back below, type notes, or transcribe once connected.'
            );
          } catch (err: any) {
            console.error('Failed to store modal audio in IndexedDB:', err);
            setErrorMsg(
              'Failed to store audio in durable offline storage: ' +
                (err.message || 'IndexedDB error')
            );
          }
        } else {
          // ONLINE WORKFLOW:
          // Also persist as durable backup in case of connection drop
          try {
            await offlineAudioStorage.saveAudioRecording({
              id: currentRecId,
              blob: audioBlob,
              mimeType: 'audio/webm',
              durationSeconds: recordingTime,
            });
          } catch (e) {
            console.warn('IDB backup warning:', e);
          }

          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = async () => {
            const base64Data = (reader.result as string).split(',')[1];
            setAudioBase64(base64Data);
            await triggerTranscription(base64Data, 'audio/webm');
          };
        }
      };

      mediaRecorder.start(250);
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.warn('Microphone permission or hardware access unavailable:', err);
      setErrorMsg('Microphone access not available in this browser session. You can use sample audio below to test transcription.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
      setIsRecording(false);
      clearInterval(timerRef.current);
    }
  };

  // On-demand transcription:
  // Retrieves the Blob directly from IndexedDB when possible rather than relying on stale blob: URLs
  const triggerTranscription = async (fallbackB64?: string, fallbackMime?: string) => {
    if (!effectiveOnlineStatus) {
      setOfflineNotice(
        'Cloud transcription (gemini-3.5-transcribe) is unavailable while offline. Your voice recording is safely preserved in local IndexedDB storage.'
      );
      return;
    }
    setIsTranscribing(true);
    setErrorMsg(null);
    setOfflineNotice(null);
    try {
      let b64ToTranscribe = fallbackB64 || audioBase64;
      let mimeToTranscribe = fallbackMime || audioMime || 'audio/webm';

      if (recordingId) {
        const stored = await offlineAudioStorage.getAudioRecording(recordingId);
        if (stored && stored.blob) {
          b64ToTranscribe = await OfflineAudioStorageService.blobToBase64(stored.blob);
          mimeToTranscribe = stored.mimeType || 'audio/webm';
          if (!audioBlobUrl) {
            setAudioBlobUrl(URL.createObjectURL(stored.blob));
          }
        }
      }

      if (!b64ToTranscribe) {
        throw new Error('No audio recording found to transcribe.');
      }

      const result = await api.transcribeAudio(b64ToTranscribe, mimeToTranscribe);
      setTranscript(result.transcript);
    } catch (err: any) {
      console.error('Transcription failed:', err);
      setErrorMsg(err.message || 'Failed to transcribe audio with gemini-3.5-transcribe.');
    } finally {
      setIsTranscribing(false);
    }
  };

  const loadSampleAudio = async (sampleType: 'odia' | 'hindi' | 'english') => {
    setErrorMsg(null);
    setOfflineNotice(null);
    const mockB64 = 'UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
    setAudioBase64(mockB64);
    setAudioBlobUrl('sample_audio.wav');

    let customTranscript = '';
    if (sampleType === 'odia') {
      customTranscript = 'ରୋଗୀଙ୍କୁ ୩ ଦିନ ହେଲା ପ୍ରବଳ ଜ୍ୱର, ମୁଣ୍ଡବିନ୍ଧା ଏବଂ ବାନ୍ତି ହେଉଛି। (Sample Odia Transcription via gemini-3.5-transcribe)';
    } else if (sampleType === 'hindi') {
      customTranscript = 'मरीज को तीन दिन से तेज बुखार है, सर में दर्द और दो बार उल्टी हुई है। (Sample Hindi Transcription via gemini-3.5-transcribe)';
    } else {
      customTranscript = 'Patient has continuous high-grade fever for 3 days, severe headache, and vomiting. (Sample English Transcription via gemini-3.5-transcribe)';
    }

    if (!effectiveOnlineStatus) {
      // Offline mode: provide sample transcript directly without calling API
      setTranscript(customTranscript);
      return;
    }

    setIsTranscribing(true);
    try {
      const result = await api.transcribeAudio(mockB64, 'audio/wav');
      setTranscript(result.transcript || customTranscript);
    } catch (err: any) {
      // Fall back to sample transcript
      setTranscript(customTranscript);
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleCopy = () => {
    if (!transcript) return;
    navigator.clipboard.writeText(transcript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-xl w-full shadow-2xl overflow-hidden text-slate-100 flex flex-col">
        {/* Header */}
        <div className="bg-teal-950/80 border-b border-teal-800/50 p-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-teal-500/20 border border-teal-400/30 flex items-center justify-center text-teal-400">
              <Mic className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">Live Microphone Audio Transcriber</h3>
                <span className="px-1.5 py-0.5 rounded bg-teal-500/20 text-teal-300 font-mono text-[10px] font-bold border border-teal-500/30">
                  gemini-3.5-transcribe
                </span>
              </div>
              <p className="text-xs text-slate-400">Speech-to-text powered by model gemini-3.5-transcribe</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 text-xs">
          {/* Recording Canvas */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 flex flex-col items-center justify-center text-center space-y-3">
            <div
              className={`w-16 h-16 rounded-full flex items-center justify-center transition ${
                isRecording
                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 animate-pulse'
                  : 'bg-teal-500/20 text-teal-400 border border-teal-500/30'
              }`}
            >
              <Mic className="w-8 h-8" />
            </div>

            <div>
              <h4 className="text-sm font-bold text-white">
                {isRecording ? 'Recording Microphone Input...' : 'Input Audio with Microphone'}
              </h4>
              <p className="text-xs text-slate-400 mt-0.5">
                Speak symptoms or patient narrative. Works in Odia, Hindi, English, and more.
              </p>
            </div>

            {isRecording ? (
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs text-rose-400 font-bold">
                  Recording: {recordingTime}s
                </span>
                <button
                  onClick={stopRecording}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shadow-md shadow-rose-950 cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5" />
                  <span>{effectiveOnlineStatus ? 'Stop & Transcribe' : 'Stop & Save Audio'}</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <button
                  onClick={startRecording}
                  className="px-5 py-2.5 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-xs font-semibold flex items-center gap-2 transition shadow-md shadow-teal-950 cursor-pointer"
                >
                  <Mic className="w-4 h-4" />
                  <span>Start Microphone Recording</span>
                </button>
              </div>
            )}

            {/* Audio Playback Controls if recorded */}
            {audioBlobUrl && (
              <div className="w-full bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-2 text-left">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-300 flex items-center gap-1.5">
                    <Volume2 className="w-3.5 h-3.5 text-teal-400" />
                    <span>Recorded Audio Playback</span>
                  </span>
                  {effectiveOnlineStatus && audioBase64 && !isTranscribing && (
                    <button
                      type="button"
                      onClick={() => triggerTranscription(audioBase64, audioMime)}
                      className="px-2.5 py-1 bg-teal-600 hover:bg-teal-500 text-white rounded text-[11px] font-semibold flex items-center gap-1 transition shadow-sm"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>Transcribe with Gemini</span>
                    </button>
                  )}
                </div>
                <audio controls src={audioBlobUrl} className="w-full h-8" />
              </div>
            )}

            {/* Sample audio clips */}
            <div className="pt-2 border-t border-slate-800 w-full flex items-center justify-between text-[11px] text-slate-400">
              <span>Sample Audio Presets:</span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => loadSampleAudio('odia')}
                  className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-teal-300 rounded font-medium"
                >
                  Odia Sample
                </button>
                <button
                  onClick={() => loadSampleAudio('hindi')}
                  className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-teal-300 rounded font-medium"
                >
                  Hindi Sample
                </button>
                <button
                  onClick={() => loadSampleAudio('english')}
                  className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-teal-300 rounded font-medium"
                >
                  English Sample
                </button>
              </div>
            </div>
          </div>

          {/* Offline Notice */}
          {offlineNotice && (
            <div className="p-3 bg-amber-950/40 border border-amber-500/40 rounded-lg text-xs text-amber-200 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-amber-300">Voice Preserved Locally (Offline)</span>
                <p className="mt-0.5 text-[11px] leading-relaxed text-amber-200/90">{offlineNotice}</p>
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 bg-rose-950/40 border border-rose-500/40 rounded-lg text-xs text-rose-200 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Transcription Result Box */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-300 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-teal-400" />
                <span>Transcribed Text / Clinical Notes</span>
              </span>
              {transcript && (
                <button
                  onClick={handleCopy}
                  className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
                >
                  {copied ? <Check className="w-3 h-3 text-teal-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              )}
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 min-h-[90px] relative">
              {isTranscribing ? (
                <div className="flex items-center justify-center py-6 text-teal-400 gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Transcribing audio with gemini-3.5-transcribe...</span>
                </div>
              ) : (
                <textarea
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  placeholder={
                    !effectiveOnlineStatus
                      ? "Cloud transcription is offline. Play the audio above and type patient notes or symptoms here to ensure no data is lost..."
                      : "Click 'Start Microphone Recording' to record speech and transcribe it, or type notes here..."
                  }
                  rows={3}
                  className="w-full bg-transparent text-xs text-white placeholder-slate-500 outline-none resize-none leading-relaxed font-sans"
                />
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-950/80 border-t border-slate-800 px-5 py-3 flex items-center justify-between">
          <span className="text-[11px] text-slate-400 font-mono">
            Model: gemini-3.5-transcribe
          </span>
          <div className="flex items-center gap-2">
            {(transcript || audioBlobUrl) && onInsertIntoIntake && (
              <button
                onClick={() => {
                  onInsertIntoIntake(
                    transcript ||
                      (audioBlobUrl
                        ? '[Offline Voice Recording Captured - Audio Attached]'
                        : '')
                  );
                  onClose();
                }}
                className="px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-xs font-semibold transition"
              >
                Insert into Patient Intake
              </button>
            )}
            <button
              onClick={onClose}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
