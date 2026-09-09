import {
  getDocument,
  GlobalWorkerOptions,
  PDFWorker,
} from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import type { ResumeRecord } from '../storage/resumeRepository';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
const LIMIT = 200_000;
export async function parseResume(
  bytes: ArrayBuffer,
  mime: ResumeRecord['mimeType'],
): Promise<string> {
  if (mime === 'application/pdf') {
    // Pass the packaged worker port explicitly. PDF.js otherwise treats the
    // extension scheme as cross-origin and wraps it in a CSP-blocked blob URL.
    const port =
      typeof Worker !== 'undefined'
        ? new Worker(pdfWorkerUrl, { type: 'module' })
        : undefined;
    const worker = port ? PDFWorker.create({ port }) : undefined;
    const assetRoot =
      typeof location === 'undefined'
        ? undefined
        : new URL('pdf-assets/', location.href).href;
    const task = getDocument({
      data: bytes.slice(0),
      worker,
      useSystemFonts: false,
      disableFontFace: true,
      standardFontDataUrl: assetRoot
        ? `${assetRoot}standard_fonts/`
        : undefined,
      cMapUrl: assetRoot ? `${assetRoot}cmaps/` : undefined,
      cMapPacked: true,
      useWasm: false,
    });
    const timeout = setTimeout(() => {
      void task.destroy();
    }, 30_000);
    try {
      const document = await task.promise;
      if (document.numPages > 50) throw new Error('Page limit exceeded');
      let text = '';
      for (let page = 1; page <= document.numPages; page++) {
        const content = await (await document.getPage(page)).getTextContent();
        text +=
          content.items
            .map((item) =>
              'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '',
            )
            .join('') + '\n';
        if (text.length > LIMIT) throw new Error('Text limit exceeded');
      }
      return text;
    } catch {
      throw new Error(
        'PDF text extraction failed. Use a text-based, unencrypted PDF up to 50 pages, or enter your profile manually.',
      );
    } finally {
      clearTimeout(timeout);
      try {
        await task.destroy();
      } finally {
        worker?.destroy();
        port?.terminate();
      }
    }
  }
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./docx.worker.ts', import.meta.url), {
      type: 'module',
    });
    const finish = (text?: string) => {
      clearTimeout(timer);
      worker.terminate();
      if (text !== undefined) resolve(text);
      else
        reject(
          new Error(
            'DOCX extraction failed or exceeded 30 seconds. The file is retained; try another document or enter your profile manually.',
          ),
        );
    };
    const timer = setTimeout(() => finish(), 30_000);
    worker.onerror = () => finish();
    worker.onmessage = (event: MessageEvent<{ ok: boolean; text?: string }>) =>
      finish(event.data.ok ? event.data.text : undefined);
    worker.postMessage(bytes.slice(0));
  });
}
