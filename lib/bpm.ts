// Estimates BPM by decoding the track, isolating low-end transients (kick/bass
// range), finding energy peaks, and computing the most common interval between
// them. This is an ESTIMATE — reliable on material with a clear beat, unreliable
// on ambient/rubato/freeform material. Always surfaced as editable, never as fact.
export async function detectBPM(fileUrl: string): Promise<{ bpm: number; confidence: number }> {
  const res = await fetch(fileUrl);
  const arrayBuffer = await res.arrayBuffer();
  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

  const offlineCtx = new OfflineAudioContext(1, audioBuffer.length, audioBuffer.sampleRate);
  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;

  const lowpass = offlineCtx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 150; // isolate kick/bass range where beat energy lives

  source.connect(lowpass);
  lowpass.connect(offlineCtx.destination);
  source.start(0);

  const rendered = await offlineCtx.startRendering();
  const data = rendered.getChannelData(0);
  const sampleRate = rendered.sampleRate;

  // Find peaks above a threshold, at least 200ms apart (caps theoretical max at 300bpm)
  const peaks: number[] = [];
  const minGap = sampleRate * 0.2;
  let lastPeak = -minGap;
  // Previously: Math.max(...Array.from(...).map(Math.abs)) — spreading a
  // large array into Math.max() throws RangeError once it exceeds the JS
  // engine's max argument count, which a real track's sample data always
  // does (30s at 44.1kHz is ~1.3M samples, the limit is well under that).
  // This threw on every real upload, silently failing detection every
  // time — a plain loop has no such limit.
  const windowEnd = Math.min(data.length, sampleRate * 30);
  let peakAbs = 0;
  for (let i = 0; i < windowEnd; i++) {
    const abs = Math.abs(data[i]);
    if (abs > peakAbs) peakAbs = abs;
  }
  const threshold = 0.6 * peakAbs;

  for (let i = 0; i < data.length; i++) {
    if (Math.abs(data[i]) > threshold && i - lastPeak > minGap) {
      peaks.push(i);
      lastPeak = i;
    }
  }

  if (peaks.length < 4) return { bpm: 0, confidence: 0 };

  const intervals = peaks.slice(1).map((p, i) => p - peaks[i]);
  const bpms = intervals.map((s) => Math.round(60 / (s / sampleRate)));

  // most common BPM value (mode), folded into a sane 60-180 range
  const counts: Record<number, number> = {};
  for (let bpm of bpms) {
    while (bpm > 180) bpm = Math.round(bpm / 2);
    while (bpm < 60 && bpm > 0) bpm = Math.round(bpm * 2);
    counts[bpm] = (counts[bpm] || 0) + 1;
  }

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const [bestBpm, votes] = sorted[0];
  const confidence = Math.min(1, votes / bpms.length);

  return { bpm: Number(bestBpm), confidence: Math.round(confidence * 100) / 100 };
}
