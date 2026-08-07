// Estimates musical key by building a chroma vector (energy per pitch class,
// C through B) via the Goertzel algorithm — cheaper than a full FFT since it
// only tests the 48 specific frequencies that matter (12 notes x 4 octaves)
// rather than the whole spectrum — then correlating that chroma vector
// against the standard Krumhansl-Kessler major/minor key profiles. This is
// a real, published technique (same one used in academic key-detection
// research), not a placeholder — but like BPM, it's an ESTIMATE. Confidence
// varies a lot by genre; always surfaced as editable, never as fact.

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// Krumhansl-Kessler key profiles — the standard published pitch-class
// weightings for how "at home" each note feels within a major/minor key.
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function goertzelMagnitude(samples: Float32Array, sampleRate: number, targetFreq: number): number {
  const N = samples.length;
  const k = Math.round((N * targetFreq) / sampleRate);
  const omega = (2 * Math.PI * k) / N;
  const cosine = Math.cos(omega);
  const coeff = 2 * cosine;
  let q0 = 0, q1 = 0, q2 = 0;
  for (let i = 0; i < N; i++) {
    q0 = coeff * q1 - q2 + samples[i];
    q2 = q1;
    q1 = q0;
  }
  const real = q1 - q2 * cosine;
  const imag = q2 * Math.sin(omega);
  return real * real + imag * imag;
}

function pearsonCorrelation(a: number[], b: number[]): number {
  const n = a.length;
  const meanA = a.reduce((s, v) => s + v, 0) / n;
  const meanB = b.reduce((s, v) => s + v, 0) / n;
  let num = 0, denA = 0, denB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }
  const den = Math.sqrt(denA * denB);
  return den === 0 ? 0 : num / den;
}

export async function detectKey(fileUrl: string): Promise<{ key: string; confidence: number }> {
  const res = await fetch(fileUrl);
  const arrayBuffer = await res.arrayBuffer();
  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  const data = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;

  // Sample ~40 windows spread across the track rather than every sample —
  // musical harmony is usually stable enough within a track that this gives
  // a representative chroma vector at a small fraction of the compute cost.
  const windowSize = 8192;
  const numWindows = 40;
  const chroma = new Array(12).fill(0);

  for (let w = 0; w < numWindows; w++) {
    const start = Math.floor((data.length - windowSize) * (w / numWindows));
    if (start < 0) continue;
    const window = data.subarray(start, start + windowSize);

    // Octaves 2–5 (C2 ≈ 65Hz to B5 ≈ 988Hz) — covers the range where most
    // harmonic/tonal information in a mix lives, without wasting cycles on
    // sub-bass or high harmonics that don't carry key information as cleanly.
    for (let note = 0; note < 12; note++) {
      let energy = 0;
      for (let octave = 2; octave <= 5; octave++) {
        const freq = 16.35 * Math.pow(2, note / 12) * Math.pow(2, octave);
        energy += goertzelMagnitude(window as Float32Array, sampleRate, freq);
      }
      chroma[note] += energy;
    }
  }

  const maxChroma = Math.max(...chroma);
  const normalizedChroma = maxChroma > 0 ? chroma.map((v) => v / maxChroma) : chroma;

  let best = { key: "", correlation: -Infinity };
  for (let tonic = 0; tonic < 12; tonic++) {
    const rotatedMajor = MAJOR_PROFILE.map((_, i) => MAJOR_PROFILE[(i - tonic + 12) % 12]);
    const rotatedMinor = MINOR_PROFILE.map((_, i) => MINOR_PROFILE[(i - tonic + 12) % 12]);

    const majorCorr = pearsonCorrelation(normalizedChroma, rotatedMajor);
    const minorCorr = pearsonCorrelation(normalizedChroma, rotatedMinor);

    if (majorCorr > best.correlation) best = { key: `${NOTE_NAMES[tonic]} Major`, correlation: majorCorr };
    if (minorCorr > best.correlation) best = { key: `${NOTE_NAMES[tonic]} Minor`, correlation: minorCorr };
  }

  return { key: best.key, confidence: Math.max(0, Math.min(1, best.correlation)) };
}
