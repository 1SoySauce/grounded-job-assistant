import { ContentRequestSchema } from '../types/messages';
import { scanPage } from '../scanner/pageScanner';

type ContentGlobal = typeof globalThis & {
  __groundedJobAssistantLoaded?: boolean;
};

const contentGlobal = globalThis as ContentGlobal;

if (!contentGlobal.__groundedJobAssistantLoaded) {
  contentGlobal.__groundedJobAssistantLoaded = true;

  chrome.runtime.onMessage.addListener(
    (message: unknown, sender, sendResponse) => {
      if (sender.id !== chrome.runtime.id) {
        return false;
      }

      const parsed = ContentRequestSchema.safeParse(message);
      if (!parsed.success) {
        return false;
      }

      sendResponse(scanPage(document, window.location.href));
      return false;
    },
  );
}
