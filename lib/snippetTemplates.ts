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
}

export const SNIPPET_TEMPLATES: SnippetTemplateMeta[] = [
  { id: "vinyl-rise", name: "Vinyl Rise", premium: false, supportsAlbumArt: true },
  { id: "vinyl-edge", name: "Vinyl Edge", premium: false, supportsAlbumArt: true },
  { id: "depth-vinyl", name: "Depth Vinyl", premium: true, supportsAlbumArt: true },
  { id: "pulse-grid", name: "Pulse Grid", premium: true, supportsAlbumArt: false },
  { id: "type-wave", name: "Type Wave", premium: true, supportsAlbumArt: false },
  { id: "orbit", name: "Orbit", premium: true, supportsAlbumArt: false },
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
