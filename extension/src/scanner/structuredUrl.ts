import { HttpUrlSchema } from '../types/jobPosting';
import {
  evidence,
  missing,
  resolved,
  scalarObservation,
  type Observation,
} from './structuredObservation';

export function normalizedHttpUrl(
  value: unknown,
  baseUrl: string,
): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = new URL(value.trim(), baseUrl);
    parsed.hash = '';
    const result = HttpUrlSchema.safeParse(parsed.href);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function documentCanonicalUrl(
  document: Document,
  currentUrl: string,
): Observation<string> {
  return scalarObservation(
    Array.from(
      document.querySelectorAll<HTMLLinkElement>(
        'link[rel~="canonical"][href]',
      ),
    ).map((element, index) => {
      const href = element.getAttribute('href');
      const value = normalizedHttpUrl(href, currentUrl);
      return value && href
        ? resolved(value, [
            evidence('url', `link[rel~="canonical"][${index}]`, href),
          ])
        : missing();
    }),
  );
}
