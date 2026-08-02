import { toPng } from "html-to-image";
import type { PosterSize } from "@poster/shared";

/**
 * Exports the currently-rendered poster iframe as a PNG at a chosen scale.
 * Reads the poster's #poster node from inside the same-origin iframe and
 * rasterizes it with html-to-image.
 */
export async function exportPng(
  iframe: HTMLIFrameElement,
  size: PosterSize,
  scale: number,
): Promise<void> {
  const doc = iframe.contentDocument;
  const node = doc?.getElementById("poster");
  if (!node) throw new Error("Nothing to export yet.");

  const dataUrl = await toPng(node as HTMLElement, {
    width: size.width,
    height: size.height,
    pixelRatio: scale,
    cacheBust: true,
  });

  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = `poster@${scale}x.png`;
  a.click();
}
