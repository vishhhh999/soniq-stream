// Slices a decoded AudioBuffer to [startSec, endSec] and encodes it as a
// 16-bit PCM WAV Blob -- no server round-trip, no ffmpeg dependency, just
// what's needed to give the Adjust tab's trim handles a real output. This
// is intentionally download-only, not "save to library" -- persisting a
// trimmed clip as a new track requires a real upload flow (R2 write + a
// new tracks row), which is a bigger, separate piece of work.
function sliceBuffer(buffer: AudioBuffer, startSec: number, endSec: number): AudioBuffer {
  const sampleRate = buffer.sampleRate;
  const startSample = Math.max(0, Math.floor(startSec * sampleRate));
  const endSample = Math.min(buffer.length, Math.ceil(endSec * sampleRate));
  const frameCount = Math.max(1, endSample - startSample);

  const OfflineCtor = (window.OfflineAudioContext || (window as any).webkitOfflineAudioContext);
  const offlineCtx = new OfflineCtor(buffer.numberOfChannels, frameCount, sampleRate);
  const sliced = offlineCtx.createBuffer(buffer.numberOfChannels, frameCount, sampleRate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const channelData = buffer.getChannelData(ch).subarray(startSample, startSample + frameCount);
    sliced.copyToChannel(channelData, ch);
  }
  return sliced;
}

function encodeWAV(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bytesPerSample = 2; // 16-bit
  const blockAlign = numChannels * bytesPerSample;
  const dataLength = buffer.length * blockAlign;
  const bufferLength = 44 + dataLength;

  const arrayBuffer = new ArrayBuffer(bufferLength);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeString(36, "data");
  view.setUint32(40, dataLength, true);

  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) channels.push(buffer.getChannelData(ch));

  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}

export async function exportTrimmedAudio(fileUrl: string, startSec: number, endSec: number): Promise<Blob> {
  const res = await fetch(fileUrl);
  if (!res.ok) throw new Error("Couldn't load audio for trim export.");
  const arrayBuffer = await res.arrayBuffer();
  const Ctx = window.AudioContext || (window as any).webkitAudioContext;
  const ctx = new Ctx();
  const decoded = await ctx.decodeAudioData(arrayBuffer);
  const sliced = sliceBuffer(decoded, startSec, endSec);
  ctx.close().catch(() => {});
  return encodeWAV(sliced);
}
