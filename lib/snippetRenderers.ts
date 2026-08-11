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

// Rounded-rect path, built from arcTo since that's what Canvas2DLike
// actually exposes — used by Pulse Grid's bars.
function roundRectPath(ctx: SnippetRenderContext["ctx"], x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function elColor(rc: SnippetRenderContext, key: string, fallback: string) {
  return rc.elementColors?.[key] || fallback;
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return `rgba(255,138,61,${alpha})`;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
function drawTitle(rc: SnippetRenderContext, x: number, y: number, align: "left" | "center" | "right" = "center") {
  const { ctx, trackTitle, textColor } = rc;
  ctx.textAlign = align;
  ctx.fillStyle = TEXT_COLOR_HEX[textColor];
  ctx.font = "600 34px 'General Sans', sans-serif";
  ctx.fillText(trackTitle, x, y);
}

// Duration is now the sole identifying text on every template except
// Depth Vinyl with its title toggle on — bumped from 22px to 28px
// (roughly the midpoint between the old 22px duration and 34px title) so
// it carries the visual weight the title used to.
function drawDuration(rc: SnippetRenderContext, x: number, y: number, align: "left" | "center" | "right" = "center") {
  const { ctx, t, trimStartAbs, trackDurationAbs, durationColor } = rc;
  ctx.textAlign = align;
  ctx.font = "500 28px 'General Sans', sans-serif";
  ctx.fillStyle = TEXT_COLOR_HEX[durationColor];
  ctx.filter = "opacity(0.7)";
  ctx.fillText(`${fmtDuration(trimStartAbs + t)} / ${fmtDuration(trackDurationAbs)}`, x, y);
  ctx.filter = "none";
}

// Title (only when a template opts in and it's toggled on) + duration,
// stacked. When title is off, duration alone sits vertically centered in
// the same footprint this block would have occupied, so switching the
// toggle doesn't jump the whole composition around.
function drawTrackInfo(rc: SnippetRenderContext, x: number, y: number, align: "left" | "center" | "right" = "center") {
  if (rc.showTrackTitle) {
    drawTitle(rc, x, y, align);
    drawDuration(rc, x, y + 52, align);
  } else {
    drawDuration(rc, x, y + 18, align);
  }
}

// ── Free templates ──────────────────────────────────────────────────────

// Vinyl rises from the bottom edge, mostly off-frame, rotating.
export function renderVinylRise(rc: SnippetRenderContext) {
  const { width, height, t } = rc;
  drawBackground(rc);
  const radius = width * 0.62;
  drawVinyl(rc, width / 2, height - radius * 0.35, radius, t);
  drawTrackInfo(rc, width / 2, height * 0.16);
}

// Vinyl Edge — disc's center sits exactly on the left border (not just
// near it), which opens up real room on the right instead of the disc
// eating half the frame. Duration lives in that opened-up space, centered
// between the disc's right edge and the frame's right border, at the same
// vertical height as the disc's own center — reads as a deliberate two-zone
// layout (disc left, info right) rather than a disc with a caption
// underneath.
export function renderVinylEdge(rc: SnippetRenderContext) {
  const { width, height, t } = rc;
  drawBackground(rc);
  const radius = height * 0.34;
  const cx = 0;
  const cy = height / 2;
  drawVinyl(rc, cx, cy, radius, t);
  const textX = (radius + width) / 2;
  drawDuration(rc, textX, cy, "center");
}

// ── Premium templates ───────────────────────────────────────────────────

// Flagship: centered vinyl with real depth — drop shadow, subtle scale
// breathing. The only template where the title is available at all,
// off by default (duration-only, matching everything else) but toggleable.
export function renderDepthVinyl(rc: SnippetRenderContext) {
  const { ctx, width, height, t } = rc;
  drawBackground(rc);
  const radius = width * 0.42;
  const cx = width / 2;
  const cy = height * 0.42;

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy + radius * 0.92, radius * 0.8, radius * 0.18, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.filter = "blur(20px)";
  ctx.fill();
  ctx.restore();

  const breathe = 1 + Math.sin(t * 1.3) * 0.015;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(breathe, breathe);
  ctx.translate(-cx, -cy);
  drawVinyl(rc, cx, cy, radius, t);
  ctx.restore();

  drawTrackInfo(rc, width / 2, height * 0.86);
}

// Pulse Grid v2 — "Mirrored Skyline". Bars rise from a center baseline with
// a faded reflection below (instead of a flat bottom-anchored EQ, which
// read as basic and static-looking even with live data), rounded caps,
// loud bins pick out the accent color against a translucent white base.
export function renderPulseGrid(rc: SnippetRenderContext) {
  const { width, height, frequencyData } = rc;
  const ctx = rc.ctx;
  drawBackground(rc);

  const barCount = 32;
  const gap = 8;
  const barWidth = (width - gap * (barCount + 1)) / barCount;
  const baseY = height * 0.5;
  const maxBarHeight = height * 0.26;

  for (let i = 0; i < barCount; i++) {
    const dataIndex = frequencyData ? Math.floor((i / barCount) * frequencyData.length) : 0;
    const amp = frequencyData ? frequencyData[dataIndex] / 255 : 0.2 + 0.15 * Math.sin(i * 0.4);
    const h = Math.max(8, amp * maxBarHeight);
    const x = gap + i * (barWidth + gap);
    const isLoud = amp > 0.65;
    const r = barWidth / 2;
    const color = isLoud ? elColor(rc, "barAccent", "#ff8a3d") : elColor(rc, "barBase", "rgba(255,255,255,0.55)");

    roundRectPath(ctx, x, baseY - h, barWidth, h, r);
    ctx.fillStyle = color;
    ctx.fill();

    ctx.save();
    ctx.filter = "opacity(0.22)";
    roundRectPath(ctx, x, baseY, barWidth, h * 0.55, r);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, baseY);
  ctx.lineTo(width, baseY);
  ctx.stroke();
  ctx.restore();

  drawDuration(rc, width / 2, height * 0.86);
}

// Frequency Bloom (was "Type Wave") — the old concept was built entirely
// around rendering the track title as giant hero text, which stops making
// sense with title removed by default. Rebuilt as a radial spectrum: bars
// fan out from a center medallion in a full circle, audio-reactive,
// rotating slowly, with the loudest bins picked out in accent. This is the
// one template built to feel alive with sound rather than around text.
export function renderTypeWave(rc: SnippetRenderContext) {
  const { width, height, t, frequencyData } = rc;
  const ctx = rc.ctx;
  drawBackground(rc);

  const cx = width / 2;
  const cy = height * 0.42;
  const innerRadius = width * 0.16;
  const maxBarLen = width * 0.24;
  const barCount = 64;
  const rotation = t * 0.15;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotation);
  for (let i = 0; i < barCount; i++) {
    const angle = (i / barCount) * Math.PI * 2;
    const dataIndex = frequencyData ? Math.floor((i / barCount) * frequencyData.length) : 0;
    const amp = frequencyData ? frequencyData[dataIndex] / 255 : 0.25 + 0.15 * Math.sin(i * 0.3 + t * 2);
    const len = Math.max(6, amp * maxBarLen);
    const isLoud = amp > 0.65;
    const x0 = Math.cos(angle) * innerRadius;
    const y0 = Math.sin(angle) * innerRadius;
    const x1 = Math.cos(angle) * (innerRadius + len);
    const y1 = Math.sin(angle) * (innerRadius + len);
    ctx.strokeStyle = isLoud ? elColor(rc, "spokeAccent", "#ff8a3d") : elColor(rc, "spokeBase", "rgba(255,255,255,0.5)");
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }
  ctx.restore();

  // Center medallion — customizable flat fill instead of a fixed gradient,
  // deliberately not the vinyl asset (this template's whole point is being
  // the non-vinyl option).
  const medallionColor = elColor(rc, "medallion", "#111111");
  ctx.beginPath();
  ctx.arc(cx, cy, innerRadius, 0, Math.PI * 2);
  ctx.fillStyle = medallionColor;
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth = 2;
  ctx.stroke();

  drawDuration(rc, width / 2, height * 0.82);
}

// Orbit v2 — the static album-art centerpiece stays (that part worked),
// rebuilt with three concentric rings instead of one, each with its own
// speed/direction/dot size, plus a soft ambient glow and an audio-reactive
// wobble driven by the average frequency amplitude, so it's not just dots
// moving at a fixed rate regardless of what's playing.
export function renderOrbit(rc: SnippetRenderContext) {
  const { width, height, t, albumArt, frequencyData } = rc;
  const ctx = rc.ctx;
  drawBackground(rc);

  const cx = width / 2;
  const cy = height * 0.42;
  const artSize = width * 0.46;

  ctx.save();
  const glowHex = elColor(rc, "glow", "#ff8a3d");
  const glow = ctx.createLinearGradient(cx - artSize, cy - artSize, cx + artSize, cy + artSize);
  glow.addColorStop(0, hexToRgba(glowHex, 0.28));
  glow.addColorStop(1, hexToRgba(glowHex, 0));
  ctx.beginPath();
  ctx.arc(cx, cy, artSize * 0.95, 0, Math.PI * 2);
  ctx.fillStyle = glow;
  ctx.filter = "blur(30px)";
  ctx.fill();
  ctx.restore();

  ctx.save();
  const r = 24;
  roundRectPath(ctx, cx - artSize / 2, cy - artSize / 2, artSize, artSize, r);
  ctx.clip();
  if (albumArt) {
    ctx.drawImage(albumArt, cx - artSize / 2, cy - artSize / 2, artSize, artSize);
  } else {
    ctx.fillStyle = "#2a2a2a";
    ctx.fillRect(cx - artSize / 2, cy - artSize / 2, artSize, artSize);
  }
  ctx.restore();

  let avgAmp = 0.3;
  if (frequencyData && frequencyData.length) {
    let sum = 0;
    for (let i = 0; i < frequencyData.length; i++) sum += frequencyData[i];
    avgAmp = sum / frequencyData.length / 255;
  }

  const rings = [
    { radius: artSize * 0.68, count: 8, speed: 0.6, size: 5 },
    { radius: artSize * 0.94, count: 12, speed: -0.35, size: 3.5 },
    { radius: artSize * 1.2, count: 16, speed: 0.22, size: 2.5 },
  ];

  rings.forEach((ring, ringIdx) => {
    for (let i = 0; i < ring.count; i++) {
      const angle = (i / ring.count) * Math.PI * 2 + t * ring.speed;
      const wobble = 1 + avgAmp * 0.15;
      const x = cx + Math.cos(angle) * ring.radius * wobble;
      const y = cy + Math.sin(angle) * ring.radius * 0.94 * wobble;
      const isAccent = (i + ringIdx) % 4 === 0;
      const dotSize = (isAccent ? ring.size * 1.4 : ring.size) * (1 + avgAmp * 0.3);
      ctx.beginPath();
      ctx.arc(x, y, dotSize, 0, Math.PI * 2);
      ctx.fillStyle = isAccent ? elColor(rc, "ringAccent", "#ff8a3d") : `rgba(255,255,255,${Math.max(0.25, 0.75 - ringIdx * 0.15)})`;
      ctx.fill();
    }
  });

  drawDuration(rc, width / 2, height * 0.86);
}

export const TEMPLATE_RENDERERS: Record<string, (rc: SnippetRenderContext) => void> = {
  "vinyl-rise": renderVinylRise,
  "vinyl-edge": renderVinylEdge,
  "depth-vinyl": renderDepthVinyl,
  "pulse-grid": renderPulseGrid,
  "type-wave": renderTypeWave,
  "orbit": renderOrbit,
};
