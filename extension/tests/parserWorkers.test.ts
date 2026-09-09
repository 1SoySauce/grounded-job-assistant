import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocked = vi.hoisted(() => ({
  create: vi.fn(),
  getDocument: vi.fn(),
  destroy: vi.fn(async () => {}),
  pdfDestroy: vi.fn(),
}));
vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  GlobalWorkerOptions: {},
  PDFWorker: { create: mocked.create },
  getDocument: mocked.getDocument,
}));
import { parseResume } from '../src/imports/parseResume';

class LocalWorker {
  static instances: LocalWorker[] = [];
  onmessage?: (event: { data: unknown }) => void;
  onerror?: () => void;
  terminate = vi.fn();
  postMessage = vi.fn();
  constructor(
    readonly url: string | URL,
    readonly options: WorkerOptions,
  ) {
    LocalWorker.instances.push(this);
  }
}
beforeEach(() => {
  LocalWorker.instances = [];
  vi.clearAllMocks();
  vi.stubGlobal('Worker', LocalWorker);
  mocked.create.mockReturnValue({ destroy: mocked.pdfDestroy });
  mocked.getDocument.mockReturnValue({
    promise: Promise.resolve({
      numPages: 1,
      getPage: async () => ({
        getTextContent: async () => ({
          items: [{ str: 'Exact text', hasEOL: true }],
        }),
      }),
    }),
    destroy: mocked.destroy,
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe('packaged parser worker lifecycle', () => {
  it('passes a local PDF port directly and cleans up after success', async () => {
    expect(await parseResume(new ArrayBuffer(1), 'application/pdf')).toContain(
      'Exact text',
    );
    expect(mocked.create).toHaveBeenCalledWith({
      port: LocalWorker.instances[0],
    });
    expect(String(LocalWorker.instances[0]!.url)).not.toMatch(
      /^blob:|^https?:/,
    );
    expect(LocalWorker.instances[0]!.options.type).toBe('module');
    expect(LocalWorker.instances[0]!.terminate).toHaveBeenCalled();
    expect(mocked.pdfDestroy).toHaveBeenCalled();
  });
  it('rejects PDFs over 50 pages and always terminates the worker', async () => {
    mocked.getDocument.mockReturnValue({
      promise: Promise.resolve({ numPages: 51 }),
      destroy: mocked.destroy,
    });
    await expect(
      parseResume(new ArrayBuffer(1), 'application/pdf'),
    ).rejects.toThrow(/50 pages/);
    expect(LocalWorker.instances[0]!.terminate).toHaveBeenCalled();
  });
  it('terminates a DOCX worker after returning extracted text', async () => {
    const result = parseResume(
      new ArrayBuffer(4),
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    LocalWorker.instances[0]!.onmessage!({
      data: { ok: true, text: 'Raw text' },
    });
    expect(await result).toBe('Raw text');
    expect(LocalWorker.instances[0]!.terminate).toHaveBeenCalled();
  });
  it('terminates stalled DOCX parsing at the deadline', async () => {
    vi.useFakeTimers();
    const result = parseResume(
      new ArrayBuffer(4),
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    const rejection = expect(result).rejects.toThrow(/30 seconds/);
    await vi.advanceTimersByTimeAsync(30_000);
    await rejection;
    expect(LocalWorker.instances[0]!.terminate).toHaveBeenCalled();
  });
});
