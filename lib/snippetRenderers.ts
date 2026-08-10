import { SnippetRenderContext, GRADIENT_STOPS, TEXT_COLOR_HEX } from "./snippetTemplates";

function fmtDuration(s: number) {
  if (!Number.isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}

function drawBackground({ ctx, width, height, gradient }: SnippetRenderContext) {
  const [from, to] = GRADIENT_STOPS[gradient];
  const g = ctx.createLinearGradient(0, 0, 0, height);
  g.addColorStop(0, from);
  g.addColorStop(1, to);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
}

// Shared vinyl draw — rotates continuously (one full turn per ~1.8s, matches
// a realistic 33rpm-ish feel without being distractingly fast on a short
// clip), optionally composites album art into the label's circular area.
// The label sits at roughly 30% of the disc's radius from center, matching
// the real asset's proportions.
function drawVinyl(
  { ctx, vinylImages, discColor, albumArt, useAlbumArt, spinSpeed }: SnippetRenderContext,
  cx: number, cy: number, radius: number, t: number,
) {
  const img = vinylImages[discColor];
  if (!img) return;
  const rotation = (t / 1.8) * Math.PI * 2 * (spinSpeed || 1);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotation);

  if (useAlbumArt && albumArt) {
    // Album art drawn first, clipped to the label circle, so the disc PNG's
    // own translucent label area composites on top of it naturally (the
    // asset's label is a light card color, not fully opaque white, which
    // is why this order — art under label — reads correctly).
    const labelRadius = radius * 0.3;
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, labelRadius, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(albumArt, -labelRadius, -labelRadius, labelRadius * 2, labelRadius * 2);
    ctx.restore();
  }

  ctx.drawImage(img, -radius, -radius, radius * 2, radius * 2);
  ctx.restore();
}

// Title + duration, in the user-selected text color. No artist name, per
// Vish's earlier call.
function drawTrackInfo(rc: SnippetRenderContext, x: number, y: number, align: "left" | "center" | "right" = "center") {
  const { ctx, trackTitle, duration, textColor } = rc;
  const color = TEXT_COLOR_HEX[textColor];
  ctx.textAlign = align;
  ctx.fillStyle = color;
  ctx.font = "600 34px 'General Sans', sans-serif";
  ctx.fillText(trackTitle, x, y);
  ctx.font = "400 22px 'General Sans', sans-serif";
  ctx.fillStyle = color;
  ctx.filter = "opacity(0.65)";
  ctx.fillText(fmtDuration(duration), x, y + 32);
  ctx.filter = "none";
}

// ── Free templates ──────────────────────────────────────────────────────

// Vinyl rises from the bottom edge, mostly off-frame, rotating — reference
// image 2's layout, rebuilt with our own asset instead of theirs.
export function renderVinylRise(rc: SnippetRenderContext) {
  const { ctx, width, height, t } = rc;
  drawBackground(rc);
  const radius = width * 0.62;
  drawVinyl(rc, width / 2, height - radius * 0.35, radius, t);
  drawTrackInfo(rc, width / 2, height * 0.16);
}

// Vinyl anchored at the left edge, mostly off-frame — reference image 10's
// layout.
export function renderVinylEdge(rc: SnippetRenderContext) {
  const { ctx, width, height, t } = rc;
  drawBackground(rc);
  const radius = height * 0.34;
  drawVinyl(rc, radius * 0.25, height / 2, radius, t);
  drawTrackInfo(rc, width / 2, height * 0.86);
}

// ── Premium templates ───────────────────────────────────────────────────

// Flagship: centered vinyl with real depth — drop shadow, subtle scale
// breathing, this is the one built around the photoreal asset quality
// rather than vector tricks.
export function renderDepthVinyl(rc: SnippetRenderContext) {
  const { ctx, width, height, t } = rc;
  drawBackground(rc);
  const radius = width * 0.42;
  const cx = width / 2;
  const cy = height * 0.42;

  // Soft ambient shadow beneath the disc for depth.
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy + radius * 0.92, radius * 0.8, radius * 0.18, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.filter = "blur(20px)";
  ctx.fill();
  ctx.restore();

  // Gentle breathing scale — not a spin-only effect, gives the "expensive"
  // feel the concept was scoped around rather than a flat rotation.
  const breathe = 1 + Math.sin(t * 1.3) * 0.015;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(breathe, breathe);
  ctx.translate(-cx, -cy);
  drawVinyl(rc, cx, cy, radius, t);
  ctx.restore();

  drawTrackInfo(rc, width / 2, height * 0.86);
}

// Audio-reactive bar grid — live frequency data drives each bar's height,
// orange accent picks out the loudest bins against a monochrome base.
export function renderPulseGrid(rc: SnippetRenderContext) {
  const { ctx, width, height, frequencyData } = rc;
  drawBackground(rc);

  const barCount = 40;
  const gap = 6;
  const barWidth = (width - gap * (barCount + 1)) / barCount;
  const baseY = height * 0.6;
  const maxBarHeight = height * 0.32;

  for (let i = 0; i < barCount; i++) {
    const dataIndex = frequencyData ? Math.floor((i / barCount) * frequencyData.length) : 0;
    const amp = frequencyData ? frequencyData[dataIndex] / 255 : 0.15 + Math.random() * 0.05;
    const h = Math.max(6, amp * maxBarHeight);
    const x = gap + i * (barWidth + gap);
    const isLoud = amp > 0.7;
    ctx.fillStyle = isLoud ? "#ff8a3d" : "rgba(255,255,255,0.5)";
    ctx.fillRect(x, baseY - h, barWidth, h);
  }

  drawTrackInfo(rc, width * 0.08, height * 0.78, "left");
}

// Track title as the visual hero, waveform-shaped underline beneath it.
// No vinyl at all — deliberately the odd one out in the set.
export function renderTypeWave(rc: SnippetRenderContext) {
  const { ctx, width, height, trackTitle, duration, textColor, frequencyData } = rc;
  drawBackground(rc);
  const color = TEXT_COLOR_HEX[textColor];

  ctx.textAlign = "center";
  ctx.fillStyle = color;
  ctx.font = "700 64px 'General Sans', sans-serif";
  // Simple word-wrap for longer titles rather than letting them overflow.
  const words = trackTitle.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > width * 0.82 && line) { lines.push(line); line = w; }
    else line = test;
  }
  if (line) lines.push(line);
  const startY = height * 0.42 - (lines.length - 1) * 36;
  lines.forEach((l, i) => ctx.fillText(l, width / 2, startY + i * 72));

  // Duration, right under the title.
  ctx.font = "400 24px 'General Sans', sans-serif";
  ctx.fillStyle = color;
  ctx.filter = "opacity(0.65)";
  ctx.fillText(fmtDuration(duration), width / 2, startY + lines.length * 72 + 20);
  ctx.filter = "none";

  // Waveform-shaped underline, audio-reactive when data is available.
  const wfY = startY + lines.length * 72 + 65;
  const barCount = 44;
  const barGap = (width * 0.7) / barCount;
  const startX = width * 0.15;
  ctx.strokeStyle = "#ff8a3d";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  for (let i = 0; i < barCount; i++) {
    const dataIndex = frequencyData ? Math.floor((i / barCount) * frequencyData.length) : 0;
    const amp = frequencyData ? frequencyData[dataIndex] / 255 : 0.3 + 0.2 * Math.sin(i * 0.5);
    const h = Math.max(4, amp * 40);
    const x = startX + i * barGap;
    ctx.beginPath();
    ctx.moveTo(x, wfY - h / 2);
    ctx.lineTo(x, wfY + h / 2);
    ctx.stroke();
  }
}

// Small particles orbit the (static, sharp) album art — the one template
// where the art itself doesn't move, everything moves around it instead.
export function renderOrbit(rc: SnippetRenderContext) {
  const { ctx, width, height, t, albumArt } = rc;
  drawBackground(rc);

  const cx = width / 2;
  const cy = height * 0.42;
  const artSize = width * 0.5;

  // Static, sharp album art (or a neutral placeholder square if none).
  ctx.save();
  const r = 24;
  ctx.beginPath();
  ctx.moveTo(cx - artSize / 2 + r, cy - artSize / 2);
  ctx.arcTo(cx + artSize / 2, cy - artSize / 2, cx + artSize / 2, cy + artSize / 2, r);
  ctx.arcTo(cx + artSize / 2, cy + artSize / 2, cx - artSize / 2, cy + artSize / 2, r);
  ctx.arcTo(cx - artSize / 2, cy + artSize / 2, cx - artSize / 2, cy - artSize / 2, r);
  ctx.arcTo(cx - artSize / 2, cy - artSize / 2, cx + artSize / 2, cy - artSize / 2, r);
  ctx.closePath();
  ctx.clip();
  if (albumArt) {
    ctx.drawImage(albumArt, cx - artSize / 2, cy - artSize / 2, artSize, artSize);
  } else {
    ctx.fillStyle = "#2a2a2a";
    ctx.fillRect(cx - artSize / 2, cy - artSize / 2, artSize, artSize);
  }
  ctx.restore();

  // Orbiting dots — count/speed loosely tied to a pleasant default since
  // BPM may not be available at render time; kept deliberately simple.
  const dotCount = 10;
  const orbitRadius = artSize * 0.72;
  for (let i = 0; i < dotCount; i++) {
    const angle = (i / dotCount) * Math.PI * 2 + t * 0.6;
    const x = cx + Math.cos(angle) * orbitRadius;
    const y = cy + Math.sin(angle) * orbitRadius * 0.94;
    const isAccent = i % 3 === 0;
    ctx.beginPath();
    ctx.arc(x, y, isAccent ? 6 : 4, 0, Math.PI * 2);
    ctx.fillStyle = isAccent ? "#ff8a3d" : "rgba(255,255,255,0.7)";
    ctx.fill();
  }

  drawTrackInfo(rc, width / 2, height * 0.86);
}

export const TEMPLATE_RENDERERS: Record<string, (rc: SnippetRenderContext) => void> = {
  "vinyl-rise": renderVinylRise,
  "vinyl-edge": renderVinylEdge,
  "depth-vinyl": renderDepthVinyl,
  "pulse-grid": renderPulseGrid,
  "type-wave": renderTypeWave,
  "orbit": renderOrbit,
};
