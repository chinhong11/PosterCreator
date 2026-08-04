import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// node_modules can be hoisted to the repo root under workspaces, so check both.
const NODE_MODULES_ROOTS = [
  path.join(__dirname, "..", "node_modules"),
  path.join(__dirname, "..", "..", "node_modules"),
];

interface FontSpec {
  /** CSS font-family name (must match the leading family in FONT_LIBRARY stacks). */
  family: string;
  /** @fontsource package slug. */
  slug: string;
  weights: number[];
}

const FONTS: FontSpec[] = [
  { family: "Playfair Display", slug: "playfair-display", weights: [400, 700] },
  { family: "EB Garamond", slug: "eb-garamond", weights: [400, 700] },
  { family: "Archivo", slug: "archivo", weights: [400, 700] },
  { family: "Mulish", slug: "mulish", weights: [400, 700] },
  { family: "Anton", slug: "anton", weights: [400] },
  { family: "Oswald", slug: "oswald", weights: [400, 700] },
  { family: "Space Mono", slug: "space-mono", weights: [400, 700] },
  { family: "Quicksand", slug: "quicksand", weights: [400, 700] },
];

function findWoff2(slug: string, weight: number): string | null {
  const file = `${slug}-latin-${weight}-normal.woff2`;
  for (const root of NODE_MODULES_ROOTS) {
    const p = path.join(root, "@fontsource", slug, "files", file);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

let cached: string | null = null;

/**
 * Build a stylesheet of @font-face rules with the woff2 binaries inlined as
 * data URIs. Used both for the live preview (served at /api/fonts.css) and
 * inlined into exported PDFs, so both render with identical fonts. Cached.
 */
export function fontFaceCss(): string {
  if (cached !== null) return cached;
  const rules: string[] = [];
  for (const font of FONTS) {
    for (const weight of font.weights) {
      const file = findWoff2(font.slug, weight);
      if (!file) {
        console.warn(`Font file missing for ${font.family} ${weight}; skipping.`);
        continue;
      }
      const b64 = fs.readFileSync(file).toString("base64");
      rules.push(
        `@font-face{font-family:'${font.family}';font-style:normal;font-weight:${weight};` +
          `font-display:swap;src:url(data:font/woff2;base64,${b64}) format('woff2');}`,
      );
    }
  }
  cached = rules.join("\n");
  return cached;
}
