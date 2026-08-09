"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { X, Trash2, Save, RotateCcw, Volume2, VolumeX } from "lucide-react";

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const KEY_OPTIONS = ["", ...NOTE_NAMES.flatMap((n) => [`${n} Major`, `${n} Minor`])];

function fmtElapsed(ms: number) {
  const totalCs = Math.floor(ms / 10);
  const cs = totalCs % 100;
  const totalSec = Math.floor(totalCs / 100);
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

// Records straight from the mic, no upload step separate from the rest of
// the app — on Save this goes through the exact same presign -> PUT ->
// finalize pipeline as any dropped-in file (see lib/useTrackUpload.ts),
// it just skips the duplicate-title check since a fresh recording has no
// name to collide with yet.
//
// The metronome is a MONITORING aid only — it plays out loud via the
// browser's own audio output and is never mixed into the recorded buffer.
// A mic picking up a metronome played over speakers would bleed into the
// take; on headphones there's no bleed at all. Either way, "the click you
// hear while recording" and "what actually gets saved" are intentionally
// two separate audio paths here.
export default function RecordModal({
  albumId,
  folderId,
  onRecorded,
  onClose,
}: {
  albumId?: string;
  folderId?: string;
  onRecorded: () => void;
  onClose: () => void;
}) {
  const [permission, setPermission] = useState<"requesting" | "granted" | "denied">("requesting");
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [bpm, setBpm] = useState(120);
  const [musicalKey, setMusicalKey] = useState("");
  const [metronomeOn, setMetronomeOn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string>("audio/webm");
  const startTimeRef = useRef<number>(0);
  const rafRef = useRef<number>(0);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const metronomeIntervalRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const getAudioCtx = () => {
    if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    return audioCtxRef.current;
  };

  // Mic permission + immediate auto-start — matches the reference: hitting
  // Record doesn't ask you to press another button, it just starts.
  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        setPermission("granted");
        beginRecording(stream);
      })
      .catch(() => {
        if (!cancelled) setPermission("denied");
      });
    return () => {
      cancelled = true;
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cleanup = () => {
    cancelAnimationFrame(rafRef.current);
    if (metronomeIntervalRef.current) window.clearInterval(metronomeIntervalRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    audioCtxRef.current?.close().catch(() => {});
  };

  const beginRecording = (stream: MediaStream) => {
    const mimeCandidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
    const mimeType = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) || "";
    mimeTypeRef.current = mimeType || "audio/webm";

    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
      setAudioBlob(blob);
    };
    recorder.start();
    recorderRef.current = recorder;
    startTimeRef.current = performance.now();
    setElapsedMs(0);
    setRecording(true);
    setAudioBlob(null);

    // Live waveform — analyser on the raw mic stream, drawn every frame.
    // A single oscilloscope-style frame refresh, not a scrolling multi-
    // second render (that would mean buffering and redrawing the whole
    // take every frame, real complexity for a "is my mic working" check).
    const ctx = getAudioCtx();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    analyserRef.current = analyser;
    drawWaveform();

    const tick = () => {
      setElapsedMs(performance.now() - startTimeRef.current);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  const drawWaveform = () => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const ctx2d = canvas.getContext("2d");

    const render = () => {
      if (!analyserRef.current || !ctx2d) return;
      analyserRef.current.getByteTimeDomainData(dataArray);
      const w = canvas.width;
      const h = canvas.height;
      ctx2d.clearRect(0, 0, w, h);
      ctx2d.beginPath();
      ctx2d.strokeStyle = "#ef4444";
      ctx2d.lineWidth = 2;
      const slice = w / dataArray.length;
      for (let i = 0; i < dataArray.length; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * h) / 2;
        const x = i * slice;
        if (i === 0) ctx2d.moveTo(x, y);
        else ctx2d.lineTo(x, y);
      }
      ctx2d.stroke();
      if (recorderRef.current && recorderRef.current.state === "recording") {
        rafRef.current = requestAnimationFrame(render);
      }
    };
    render();
  };

  const stopRecording = () => {
    cancelAnimationFrame(rafRef.current);
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    setRecording(false);
  };

  const retry = () => {
    setAudioBlob(null);
    setError(null);
    if (streamRef.current) beginRecording(streamRef.current);
  };

  const discard = () => {
    cleanup();
    onClose();
  };

  // Preview click only — see the file-level comment on why this never
  // touches the recorded buffer. Scheduled with setInterval, which drifts
  // slightly over long periods; acceptable for "get a feel for the
  // tempo before/while playing," not claiming sample-accurate timing.
  useEffect(() => {
    if (!metronomeOn) {
      if (metronomeIntervalRef.current) window.clearInterval(metronomeIntervalRef.current);
      return;
    }
    const ctx = getAudioCtx();
    const playClick = () => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 1000;
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.05);
    };
    playClick();
    const intervalMs = 60000 / bpm;
    metronomeIntervalRef.current = window.setInterval(playClick, intervalMs);
    return () => {
      if (metronomeIntervalRef.current) window.clearInterval(metronomeIntervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metronomeOn, bpm]);

  const save = async () => {
    if (!audioBlob) return;
    setSaving(true);
    setError(null);
    try {
      const ext = mimeTypeRef.current.includes("ogg") ? ".ogg" : mimeTypeRef.current.includes("mp4") ? ".m4a" : ".webm";
      const filename = `Recording ${new Date().toLocaleString().replace(/[/,:]/g, "-")}${ext}`;

      const presignRes = await fetch("/api/upload/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename, contentType: audioBlob.type, kind: "track" }),
      });
      if (!presignRes.ok) throw new Error((await presignRes.json().catch(() => ({}))).error || "Could not prepare upload.");
      const { uploadUrl, publicUrl } = await presignRes.json();

      const putRes = await fetch(uploadUrl, { method: "PUT", body: audioBlob, headers: { "Content-Type": audioBlob.type } });
      if (!putRes.ok) throw new Error(`Storage rejected the upload (${putRes.status}).`);

      const finalizeRes = await fetch("/api/upload/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicUrl,
          filename,
          contentType: audioBlob.type,
          fileSize: audioBlob.size,
          albumId,
          folderId,
          independent: true, // a fresh recording never collides with an existing title
        }),
      });
      if (!finalizeRes.ok) throw new Error((await finalizeRes.json().catch(() => ({}))).error || "Upload processing failed.");
      const track = await finalizeRes.json();

      if (bpm || musicalKey) {
        const patch: Record<string, unknown> = {};
        if (bpm) patch.bpm = bpm;
        if (musicalKey) patch.key = musicalKey;
        await fetch(`/api/tracks/${track.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        }).catch(() => {});
      }

      cleanup();
      onRecorded();
      onClose();
    } catch (e: any) {
      setError(e.message || "Could not save the recording.");
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-ambient-60 backdrop-blur-sm px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        className="w-full max-w-xl rounded-2xl border border-border bg-elevated p-4 sm:p-6 relative overflow-hidden"
      >
        <button onClick={discard} className="absolute top-4 right-4 text-tertiary hover:text-primary transition-colors">
          <X size={18} strokeWidth={1.5} />
        </button>

        {permission === "requesting" && (
          <p className="text-sm text-secondary py-12 text-center">Requesting microphone access...</p>
        )}

        {permission === "denied" && (
          <div className="py-12 text-center space-y-3">
            <p className="text-sm text-primary">Microphone access was denied.</p>
            <p className="text-xs text-tertiary">Allow microphone access for this site in your browser settings, then try again.</p>
          </div>
        )}

        {permission === "granted" && (
          <div className="space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 bg-surface rounded-md px-2 py-1.5">
                  <button
                    onClick={() => setMetronomeOn((v) => !v)}
                    title={metronomeOn ? "Stop metronome preview" : "Preview at this BPM"}
                    className={`p-1 rounded transition-colors ${metronomeOn ? "text-accent" : "text-tertiary hover:text-secondary"}`}
                  >
                    {metronomeOn ? <Volume2 size={14} strokeWidth={2} /> : <VolumeX size={14} strokeWidth={2} />}
                  </button>
                  <input
                    type="number"
                    min={40}
                    max={300}
                    value={bpm}
                    onChange={(e) => setBpm(Math.max(40, Math.min(300, Number(e.target.value) || 120)))}
                    className="w-14 bg-transparent text-sm text-primary outline-none text-center"
                  />
                  <span className="text-xs text-tertiary">BPM</span>
                </div>
                <select
                  value={musicalKey}
                  onChange={(e) => setMusicalKey(e.target.value)}
                  className="bg-surface rounded-md px-2 py-2 text-sm text-primary outline-none"
                >
                  {KEY_OPTIONS.map((k) => (
                    <option key={k} value={k}>{k || "Key (optional)"}</option>
                  ))}
                </select>
              </div>
              <span className="text-sm font-medium text-primary">New recording</span>
            </div>

            <div className="relative h-24 bg-canvas/40 rounded-xl overflow-hidden">
              <canvas ref={canvasRef} width={600} height={96} className="w-full h-full" />
              <div className="absolute inset-x-0 top-2 flex justify-center">
                <span className="text-xs font-mono text-primary bg-elevated/80 rounded px-2 py-0.5">
                  {fmtElapsed(elapsedMs)}
                </span>
              </div>
              {recording && (
                <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-error animate-pulse" />
              )}
            </div>

            {error && <p className="text-xs text-error">{error}</p>}

            <div className="flex items-center justify-center gap-4 sm:gap-6 flex-wrap">
              {recording ? (
                <button
                  onClick={stopRecording}
                  className="flex items-center gap-2 text-sm text-primary border border-border-strong rounded-md px-5 py-2.5 hover:bg-surface transition-colors"
                >
                  <span className="w-2.5 h-2.5 bg-error rounded-sm" />
                  Stop
                </button>
              ) : audioBlob ? (
                <>
                  <button
                    onClick={discard}
                    className="flex items-center gap-2 text-sm text-error hover:text-error/80 transition-colors"
                  >
                    <Trash2 size={14} strokeWidth={1.5} />
                    Cancel
                  </button>
                  <button
                    onClick={save}
                    disabled={saving}
                    className="flex items-center gap-2 text-sm font-medium bg-accent text-canvas rounded-md px-5 py-2.5 hover:bg-accent-strong transition-colors disabled:opacity-50"
                  >
                    <Save size={14} strokeWidth={2} />
                    {saving ? "Saving..." : "Save"}
                  </button>
                  <button
                    onClick={retry}
                    className="flex items-center gap-2 text-sm text-secondary hover:text-primary transition-colors"
                  >
                    <RotateCcw size={14} strokeWidth={1.5} />
                    Retry
                  </button>
                </>
              ) : null}
            </div>

            <p className="text-xs text-tertiary text-center">
              The metronome plays out loud as a tempo guide only — it's never mixed into what gets saved.
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
