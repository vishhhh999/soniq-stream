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

export interface SnippetRenderContext {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  t: number; // seconds elapsed within the snippet (0 at trim start)
  duration: number; // total snippet duration (<=30s)
  progress: number; // t / duration, 0-1
  frequencyData: Uint8Array | null; // live analyser data, may be null before first frame
  trackTitle: string;
  trackArtist: string;
  albumArt: HTMLImageElement | null; // null if no cover or user opted out
  vinylImages: Record<DiscColor, HTMLImageElement>;
  discColor: DiscColor;
  gradient: GradientChoice;
  useAlbumArt: boolean;
}
