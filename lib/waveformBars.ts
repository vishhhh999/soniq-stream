// Deterministic pseudo-random bar heights for the player's seek bar visual.
// NOT real audio amplitude data — that would require decoding and analyzing
// every track's waveform at upload time (or on the fly), which is real cost
// for a cosmetic seek-bar flourish. Same seed always produces the same bars
// for a given track (matches the "consistent per track" pattern already
// used for ambient gradients), which is what gives it a settled, designed
// look rather than random flicker on every render.
export function waveformBars(seed: string, count = 48): number[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h << 5) - h + seed.charCodeAt(i);
    h |= 0;
  }
  const bars: number[] = [];
  let state = Math.abs(h) || 1;
  for (let i = 0; i < count; i++) {
    // simple xorshift-style PRNG, deterministic from the seed
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state = state >>> 0;
    const rand = (state % 1000) / 1000;
    // bias toward mid-range heights with occasional peaks, reads more like
    // a real waveform than pure uniform noise
    bars.push(0.25 + rand * 0.55 + Math.sin(i * 0.5) * 0.1);
  }
  return bars;
}
