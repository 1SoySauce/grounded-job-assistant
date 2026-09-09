import { extractDocx } from './extractDocx';

self.onmessage = async (event: MessageEvent<ArrayBuffer>) => {
  try {
    self.postMessage({ ok: true, text: await extractDocx(event.data) });
  } catch {
    self.postMessage({ ok: false });
  }
};
