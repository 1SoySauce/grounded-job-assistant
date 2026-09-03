import type { ApplicationFieldDescriptor } from '../autofill/types';
import type { AtsProvider, PageScanResult } from '../types/scanner';

export interface ATSAdapter {
  readonly provider: AtsProvider;
  detect(url: URL, document: Document): boolean;
  scanPage(document: Document, url: URL): PageScanResult;
  scanApplication(document: Document): ApplicationFieldDescriptor[];
}
