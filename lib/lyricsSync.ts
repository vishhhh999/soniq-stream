export type SyncedLine = { time: number; text: string };

// Finds the index of the currently-active line for a given playback
// position — the last line whose timestamp has already passed. Assumes
// `lines` is sorted by time ascending, which tap-to-sync guarantees since
// timestamps are captured in playback order.
export function getCurrentLineIndex(lines: SyncedLine[], currentTime: number): number {
  let idx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time <= currentTime) idx = i;
    else break;
  }
  return idx;
}
