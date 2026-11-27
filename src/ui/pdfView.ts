/**
 * In-memory PDF viewer for KYC files (E-41, project head decision 19 Nov 2026: option 3, pdfjs-dist 6.5.438, Apache-2.0).
 * Renders pages to canvases inside a host element. Nothing is saved or downloaded: the bytes live in memory, the canvases are cleared and the
 * document destroyed on `destroy()` (Close or the end of the 5-minute link).
 *
 * Security (CSP unchanged: script-src 'self', object-src 'none', no frame-src):
 *  - pdf.js is loaded on demand (code split), the worker is a module asset served from 'self' (`worker-src 'self' blob:` already allows it);
 *  - this version has no `isEvalSupported` option: its build contains no `eval(` and no `new Function(` (tests/unit/pdfjsSupply.test.ts checks it);
 *  - `disableFontFace: true`: glyphs are drawn as paths, so no font is loaded from a data: URL (`font-src 'self'`);
 *  - no WebAssembly (`script-src` has no 'wasm-unsafe-eval'), so JPEG 2000 images inside a PDF are not drawn; scripting and XFA are off.
 */
export type PdfHandle = { pages: number; shown: number; destroy(): void };

/** Pages drawn at most (a KYC document is a page or two). */
export const MAX_PDF_PAGES = 10;
const MAX_CSS_WIDTH = 720;

export async function renderPdf(bytes: ArrayBuffer, host: HTMLElement): Promise<PdfHandle> {
  const pdfjs = await import("pdfjs-dist");
  const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  // A copy: pdf.js hands the buffer to its worker, which detaches it; the caller's bytes stay intact until they are dropped.
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)), disableFontFace: true, useSystemFonts: false, enableXfa: false });
  let destroyed = false;
  const canvases: HTMLCanvasElement[] = [];
  const clear = () => { for (const c of canvases) { c.width = 0; c.height = 0; c.remove(); } canvases.length = 0; };
  const handle: PdfHandle = {
    pages: 0, shown: 0,
    destroy() { destroyed = true; clear(); void task.destroy(); },
  };
  try {
    const pdf = await task.promise;
    handle.pages = pdf.numPages;
    for (let n = 1; n <= Math.min(pdf.numPages, MAX_PDF_PAGES); n++) {
      if (destroyed) break;
      const page = await pdf.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(2, MAX_CSS_WIDTH / base.width) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      canvas.setAttribute("role", "img");
      canvas.setAttribute("aria-label", `PDF page ${n} of ${pdf.numPages}`);
      canvas.className = "max-w-full rounded border border-line bg-white";
      host.appendChild(canvas);
      canvases.push(canvas);
      await page.render({ canvas, viewport }).promise;
      handle.shown = n;
    }
    return handle;
  } catch (e) {
    handle.destroy();
    throw e;
  }
}
