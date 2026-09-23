/** Colour utilities. Emotion hues are mixed in OKLab (§6.3). */

export type RGB = [number, number, number];

export const srgbToLinear = (c: number) =>
  c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

export function hexToLinear(hex: string): RGB {
  const n = parseInt(hex.replace('#', ''), 16);
  return [srgbToLinear(((n >> 16) & 255) / 255), srgbToLinear(((n >> 8) & 255) / 255), srgbToLinear((n & 255) / 255)];
}

export function linearToOklab([r, g, b]: RGB): RGB {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function oklabToLinear([L, a, b]: RGB): RGB {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    Math.max(0, 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    Math.max(0, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    Math.max(0, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

/** Weighted mix in OKLab. Weights need not be normalized. */
export function mixOklab(colors: RGB[], weights: number[]): RGB {
  let L = 0, A = 0, B = 0, W = 0;
  colors.forEach((c, i) => {
    const w = weights[i] ?? 0;
    if (w <= 0) return;
    const [l, a, b] = linearToOklab(c);
    L += l * w; A += a * w; B += b * w; W += w;
  });
  if (W === 0) return [1, 1, 1];
  return oklabToLinear([L / W, A / W, B / W]);
}

/** Rotate hue in OKLab by `rad` radians, keeping lightness and chroma. */
export function shiftHue(c: RGB, rad: number): RGB {
  const [L, a, b] = linearToOklab(c);
  const cs = Math.cos(rad), sn = Math.sin(rad);
  return oklabToLinear([L, a * cs - b * sn, a * sn + b * cs]);
}
