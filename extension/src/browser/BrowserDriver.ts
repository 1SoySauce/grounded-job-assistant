export interface BrowserDriver {
  getCurrentUrl(): Promise<string>;
  scanPage(): Promise<unknown>;
  fillField(fieldId: string, value: string | number | boolean): Promise<void>;
  continueToNextStep(): Promise<void>;
}
