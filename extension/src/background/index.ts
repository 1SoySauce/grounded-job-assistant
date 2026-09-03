import { getApplicationHistory } from '../storage/applicationHistoryRepository';
import { getOrCreateProfile } from '../storage/profileRepository';
import { restrictStorageToTrustedContexts } from '../storage/security';
import {
  ContentRequestSchema,
  RuntimeRequestSchema,
  type RuntimeRequest,
  type RuntimeResponse,
} from '../types/messages';
import { isMinimumProfileVerified } from '../types/profile';
import { PageScanResultSchema } from '../types/scanner';
import { toErrorMessage } from '../utils/errors';

async function initializeExtension(): Promise<void> {
  await restrictStorageToTrustedContexts();
  await getOrCreateProfile();
}

chrome.runtime.onInstalled.addListener(() => {
  void initializeExtension();
});

chrome.runtime.onStartup.addListener(() => {
  void restrictStorageToTrustedContexts();
});

void restrictStorageToTrustedContexts();

function isScannableUrl(url: string | undefined): url is string {
  if (!url) {
    return false;
  }

  try {
    const protocol = new URL(url).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

async function scanActiveTab(): Promise<RuntimeResponse> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id || !isScannableUrl(tab.url)) {
    return {
      ok: false,
      error: {
        code: 'UNSUPPORTED_PAGE',
        message: 'Open a regular http(s) job page, then try again.',
      },
    };
  }

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content.js'],
  });

  const request = ContentRequestSchema.parse({ type: 'CONTENT_SCAN_PAGE' });
  const rawResult: unknown = await chrome.tabs.sendMessage(tab.id, request);
  const result = PageScanResultSchema.parse(rawResult);

  return { ok: true, type: 'PAGE_SCAN', data: result };
}

async function handleRequest(
  request: RuntimeRequest,
): Promise<RuntimeResponse> {
  switch (request.type) {
    case 'GET_DASHBOARD_SNAPSHOT': {
      const [profile, applications] = await Promise.all([
        getOrCreateProfile(),
        getApplicationHistory(),
      ]);
      const verifiedFieldCount = Object.values(profile.verification).filter(
        (record) => record.status === 'verified',
      ).length;

      return {
        ok: true,
        type: 'DASHBOARD_SNAPSHOT',
        data: {
          profileReady: isMinimumProfileVerified(profile),
          verifiedFieldCount,
          applicationCount: applications.length,
        },
      };
    }
    case 'SCAN_ACTIVE_TAB':
      return scanActiveTab();
    case 'OPEN_OPTIONS':
      await chrome.runtime.openOptionsPage();
      return { ok: true, type: 'OPTIONS_OPENED' };
  }
}

chrome.runtime.onMessage.addListener(
  (
    message: unknown,
    sender,
    sendResponse: (response: RuntimeResponse) => void,
  ) => {
    if (sender.id !== chrome.runtime.id) {
      return false;
    }

    const parsed = RuntimeRequestSchema.safeParse(message);
    if (!parsed.success) {
      sendResponse({
        ok: false,
        error: {
          code: 'INVALID_MESSAGE',
          message: 'The extension rejected an invalid request.',
        },
      });
      return false;
    }

    void handleRequest(parsed.data)
      .then(sendResponse)
      .catch((error: unknown) => {
        sendResponse({
          ok: false,
          error: { code: 'REQUEST_FAILED', message: toErrorMessage(error) },
        });
      });

    return true;
  },
);
