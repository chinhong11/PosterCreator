import fs from "node:fs";
import path from "node:path";
import { chromium, type Browser } from "playwright";

let browserPromise: Promise<Browser> | null = null;

/**
 * Find an installed Chromium under PLAYWRIGHT_BROWSERS_PATH when Playwright's
 * bundled revision isn't present (e.g. a preinstalled browser cache). Prefers
 * the highest revision.
 */
function discoverChromium(): string | undefined {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !fs.existsSync(root)) return undefined;
  const dirs = fs
    .readdirSync(root)
    .filter((d) => d.startsWith("chromium-"))
    .sort()
    .reverse();
  for (const d of dirs) {
    const exe = path.join(root, d, "chrome-linux", "chrome");
    if (fs.existsSync(exe)) return exe;
  }
  return undefined;
}

async function launchBrowser(): Promise<Browser> {
  // Explicit override wins.
  const override = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  if (override) return chromium.launch({ executablePath: override });
  // Default: use Playwright's bundled browser (normal setup after
  // `npx playwright install`).
  try {
    return await chromium.launch();
  } catch (err) {
    // Fall back to a preinstalled browser cache if one is available.
    const found = discoverChromium();
    if (found) return chromium.launch({ executablePath: found });
    throw err;
  }
}

/** Reuse a single headless Chromium across export requests. */
async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = launchBrowser().catch((err) => {
      browserPromise = null;
      throw err;
    });
  }
  return browserPromise;
}

/**
 * Renders a self-contained poster HTML document to a single-page, print-true
 * PDF at exactly the poster's pixel dimensions. Images should already be inlined
 * as data URIs so the render has no network dependency.
 */
export async function renderPosterPdf(
  posterHtml: string,
  width: number,
  height: number,
): Promise<Buffer> {
  const doc = `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: ${width}px ${height}px; margin: 0; }
    html, body { margin: 0; padding: 0; }
  </style></head><body>${posterHtml}</body></html>`;

  const browser = await getBrowser();
  const page = await browser.newPage({ viewport: { width, height } });
  try {
    await page.setContent(doc, { waitUntil: "networkidle" });
    const pdf = await page.pdf({
      width: `${width}px`,
      height: `${height}px`,
      printBackground: true,
      pageRanges: "1",
      margin: { top: "0", bottom: "0", left: "0", right: "0" },
    });
    return pdf;
  } finally {
    await page.close();
  }
}
