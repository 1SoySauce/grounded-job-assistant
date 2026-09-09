import { vi } from 'vitest';
export function storageHarness(initial: Record<string, unknown> = {}) {
  const records = structuredClone(initial);
  let tail: Promise<unknown> = Promise.resolve();
  const local = {
    get: vi.fn(async (keys: string | string[]) =>
      Object.fromEntries(
        (Array.isArray(keys) ? keys : [keys])
          .filter((key) => Object.hasOwn(records, key))
          .map((key) => [key, structuredClone(records[key])]),
      ),
    ),
    set: vi.fn(async (values: Record<string, unknown>) => {
      Object.assign(records, structuredClone(values));
    }),
    setAccessLevel: vi.fn(async () => {}),
  };
  vi.stubGlobal('chrome', { storage: { local } });
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request: (_name: string, callback: () => Promise<unknown>) => {
        const next = tail.then(callback);
        tail = next.catch(() => {});
        return next;
      },
    },
  });
  return { records, local };
}
