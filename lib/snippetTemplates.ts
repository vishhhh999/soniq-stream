export type DiscColor = "white" | "black" | "orange";
export type GradientChoice = "light" | "orange" | "dark";

export const VINYL_ASSET_PATHS: Record<DiscColor, string> = {
  white: "/brand/vinyl-white.png",
  black: "/brand/vinyl-black.png",
  orange: "/brand/vinyl-orange.png",
};

export const GRADIENT_STOPS: Record<GradientChoice, [string, string]> = {
  // Light: soft warm grey, not pure white — sits closer to the app's own
  // light-mode canvas than a stark white background would.
  light: ["#f2efe9", "#d9d3c8"],
  orange: ["#ff8a3d", "#c2530a"],
  dark: ["#1a1a1a", "#050505"],
};

// Text color options -- title and duration are independently colorable, so
// e.g. a bright disc/background combo can still pair a bold title with a
// quieter duration instead of both being forced to match.
export type TextColor = "dark" | "light" | "orange";
export const TEXT_COLOR_HEX: Record<TextColor, string> = {
  dark: "#111111",
  light: "#ffffff",
  orange: "#ff8a3d",
};

// A small fixed palette used for the per-template customizable elements
// below (bars, medallion, rings, glow, etc). Deliberately not a full hex
// picker -- keeps every template's options UI consistent and fast to use,
// same reasoning as the existing disc/background/text swatch rows.
export const ELEMENT_COLOR_PALETTE = ["#ff8a3d", "#ffffff", "#111111", "#ef4444", "#3b82f6", "#22c55e", "#a855f7"];

export interface SnippetElementConfig {
  key: string;
  label: string;
  default: string;
}

export type SnippetTemplateId =
  | "vinyl-rise" | "vinyl-edge" // free
  | "depth-vinyl" | "pulse-grid" | "type-wave" | "orbit"; // premium

export interface SnippetTemplateMeta {
  id: SnippetTemplateId;
  name: string;
  premium: boolean;
  // Whether this template has a meaningful "use album art on the label"
  // toggle. Vinyl-based templates do; the others don't feature a disc at
  // all, so the option doesn't apply.
  supportsAlbumArt: boolean;
  // Whether this template can show the track title at all. Title is
  // removed everywhere by default now (duration alone is the identifying
  // text on every template) -- Depth Vinyl is the one exception, where it's
  // an opt-in toggle, off by default.
  supportsTitleToggle: boolean;
  // Elements unique to this template that aren't already covered by the
  // universal disc/background/duration controls -- each template only
  // declares what it actually has (bars, medallion, rings, glow) instead
  // of every template sharing one fixed 4-row options set regardless of
  // whether those rows mean anything for it.
  elements: SnippetElementConfig[];
}

export const SNIPPET_TEMPLATES: SnippetTemplateMeta[] = [
  { id: "vinyl-rise", name: "Vinyl Rise", premium: false, supportsAlbumArt: true, supportsTitleToggle: false, elements: [] },
  { id: "vinyl-edge", name: "Vinyl Edge", premium: false, supportsAlbumArt: true, supportsTitleToggle: false, elements: [] },
  { id: "depth-vinyl", name: "Depth Vinyl", premium: true, supportsAlbumArt: true, supportsTitleToggle: true, elements: [] },
  {
    id: "pulse-grid", name: "Pulse Grid", premium: true, supportsAlbumArt: false, supportsTitleToggle: false,
    elements: [
      { key: "barAccent", label: "Loud bars", default: "#ff8a3d" },
      { key: "barBase", label: "Bars", default: "#ffffff" },
    ],
  },
  {
    id: "type-wave", name: "Frequency Bloom", premium: true, supportsAlbumArt: false, supportsTitleToggle: false,
    elements: [
      { key: "spokeAccent", label: "Loud spokes", default: "#ff8a3d" },
      { key: "spokeBase", label: "Spokes", default: "#ffffff" },
      { key: "medallion", label: "Medallion", default: "#111111" },
    ],
  },
  {
    id: "orbit", name: "Orbit", premium: true, supportsAlbumArt: true, supportsTitleToggle: false,
    elements: [
      { key: "glow", label: "Glow", default: "#ff8a3d" },
      { key: "ringAccent", label: "Ring accent", default: "#ff8a3d" },
    ],
  },
];

// Loosely typed so the exact same renderer functions could in principle
// run in multiple canvas-like contexts -- kept minimal to what these
// templates actually use rather than the full Canvas2D API surface.
export type Canvas2DLike = {
  fillRect: (x: number, y: number, w: number, h: number) => void;
  fillStyle: any;
  strokeStyle: any;
  lineWidth: number;
  lineCap: any;
  font: string;
  textAlign: any;
  filter: string;
  beginPath: () => void;
  closePath: () => void;
  moveTo: (x: number, y: number) => void;
  lineTo: (x: number, y: number) => void;
  arc: (x: number, y: number, r: number, start: number, end: number) => void;
  arcTo: (x1: number, y1: number, x2: number, y2: number, r: number) => void;
  ellipse: (x: number, y: number, rx: number, ry: number, rot: number, start: number, end: number) => void;
  fill: () => void;
  stroke: () => void;
  clip: () => void;
  save: () => void;
  restore: () => void;
  translate: (x: number, y: number) => void;
  rotate: (angle: number) => void;
  scale: (x: number, y: number) => void;
  drawImage: (img: any, dx: number, dy: number, dw?: number, dh?: number) => void;
  fillText: (text: string, x: number, y: number) => void;
  measureText: (text: string) => { width: number };
  createLinearGradient: (x0: number, y0: number, x1: number, y1: number) => { addColorStop: (offset: number, color: string) => void };
};

export interface SnippetRenderContext {
  ctx: Canvas2DLike;
  width: number;
  height: number;
  t: number; // seconds elapsed within the snippet (0 at trim start)
  duration: number; // total snippet duration (<=30s)
  progress: number; // t / duration, 0-1
  frequencyData: Uint8Array | null; // live analyser data, may be null before first frame
  trackTitle: string;
  showTrackTitle: boolean; // off by default everywhere; Depth Vinyl is the only template that exposes this as a toggle
  elementColors: Record<string, string>; // per-template customizable elements, keyed by SnippetElementConfig.key
  albumArt: any | null; // HTMLImageElement (browser) or napi-rs Image (server); null if no cover or opted out
  vinylImages: Record<DiscColor, any>;
  discColor: DiscColor;
  gradient: GradientChoice;
  useAlbumArt: boolean;
  spinSpeed: number; // multiplier on the base disc rotation rate, default 1
  textColor: TextColor;
  durationColor: TextColor; // independent from textColor -- title and duration are separate entities
  trimStartAbs: number; // absolute position in the full track where this snippet starts
  trackDurationAbs: number; // full track length, for the "0:16 / 3:04" live counter
}
