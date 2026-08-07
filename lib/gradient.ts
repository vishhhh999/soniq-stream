// Deterministic per-track/per-album color gradients — same input always
// produces the same output, so "track one always gets the pink/purple
// gradient" holds true across refreshes and future sessions with zero
// storage needed; it's a pure function of the id (or cover image).
//
// Always returns hex (#rrggbb) so callers can safely append an alpha suffix
// (e.g. color + "55") for CSS — hsl()/rgb() strings can't be extended that
// way without producing invalid CSS.

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x: number) => Math.round(x * 255).toString(16).padStart(2, "0");
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (x: number) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function gradientFromSeed(seed: string): { from: string; to: string } {
  const h = hashString(seed);
  const hue1 = h % 360;
  const hue2 = (hue1 + 60 + (h % 80)) % 360;
  return {
    from: hslToHex(hue1, 70, 55),
    to: hslToHex(hue2, 70, 45),
  };
}

// Extracts two dominant-ish colors from an image by sampling pixels on a
// downscaled canvas — cheap, runs client-side, no extra dependency. Not a
// true clustering algorithm, but good enough for an ambient backdrop.
export async function gradientFromImage(imageUrl: string): Promise<{ from: string; to: string } | null> {
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const loaded = new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("image load failed"));
    });
    img.src = imageUrl;
    await loaded;

    const canvas = document.createElement("canvas");
    const size = 32;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);

    let r1 = 0, g1 = 0, b1 = 0, r2 = 0, g2 = 0, b2 = 0, n1 = 0, n2 = 0;
    for (let i = 0; i < data.length; i += 4) {
      const idx = i / 4;
      const isTop = idx < data.length / 4 / 2;
      if (isTop) {
        r1 += data[i]; g1 += data[i + 1]; b1 += data[i + 2]; n1++;
      } else {
        r2 += data[i]; g2 += data[i + 1]; b2 += data[i + 2]; n2++;
      }
    }
    return {
      from: rgbToHex(r1 / n1, g1 / n1, b1 / n1),
      to: rgbToHex(r2 / n2, g2 / n2, b2 / n2),
    };
  } catch {
    // CORS-blocked or failed to load — caller falls back to gradientFromSeed
    return null;
  }
}
