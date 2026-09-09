import { describe, expect, it } from 'vitest';
import { GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { parseResume } from '../src/imports/parseResume';
import { extractDocx } from '../src/imports/extractDocx';
import { createImportDraft } from '../src/imports/extractCandidates';
import { docxFixture, pdfFixture } from './documentFixtures';

describe('local resume parser integration', () => {
  it('extracts a real PDF fixture into unverified suggestions', async () => {
    GlobalWorkerOptions.workerSrc = new URL(
      '../node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs',
      import.meta.url,
    ).href;
    const text = await parseResume(pdfFixture(), 'application/pdf');
    expect(text).toContain('taylor@example.com');
    expect(
      createImportDraft(crypto.randomUUID(), text).candidate.verification,
    ).toEqual({});
  });
  it('extracts raw text from a real DOCX archive without rendering HTML', async () => {
    const text = await extractDocx(docxFixture());
    expect(text).toContain('taylor@example.com');
    expect(text).toContain('Systems project');
    expect(text).not.toContain('<w:');
  });
  it('rejects invalid documents with no profile mutation', async () => {
    await expect(extractDocx(new ArrayBuffer(4))).rejects.toThrow();
    await expect(
      parseResume(new ArrayBuffer(4), 'application/pdf'),
    ).rejects.toThrow(/extraction failed/);
  });
});
