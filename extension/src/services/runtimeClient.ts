import {
  RuntimeResponseSchema,
  type RuntimeRequest,
  type RuntimeResponse,
} from '../types/messages';

function developmentPreviewResponse(request: RuntimeRequest): RuntimeResponse {
  switch (request.type) {
    case 'GET_DASHBOARD_SNAPSHOT':
      return {
        ok: true,
        type: 'DASHBOARD_SNAPSHOT',
        data: {
          profileReady: false,
          verifiedFieldCount: 0,
          applicationCount: 0,
        },
      };
    case 'SCAN_ACTIVE_TAB':
      return {
        ok: false,
        error: {
          code: 'EXTENSION_CONTEXT_REQUIRED',
          message:
            'Load the production build as an extension to scan an active tab.',
        },
      };
    case 'OPEN_OPTIONS':
      window.location.assign('/options.html');
      return { ok: true, type: 'OPTIONS_OPENED' };
  }
}

export async function sendRuntimeRequest(
  request: RuntimeRequest,
): Promise<RuntimeResponse> {
  if (
    import.meta.env.DEV &&
    (typeof chrome === 'undefined' || typeof chrome.runtime === 'undefined')
  ) {
    return developmentPreviewResponse(request);
  }

  const response: unknown = await chrome.runtime.sendMessage(request);
  return RuntimeResponseSchema.parse(response);
}

export function responseErrorMessage(response: RuntimeResponse): string | null {
  return response.ok ? null : response.error.message;
}
