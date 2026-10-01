import {
  JOB_POSTING_LIMITS,
  type ExtractionSource,
  type Provenance,
} from '../types/jobPosting';

// Only a resolved observation exposes a value. Composition must handle the
// other states before it can turn observations into plain values.
export type Observation<T> =
  | { readonly status: 'missing' }
  | {
      readonly status: 'resolved';
      readonly value: T;
      readonly provenance: Provenance[];
    }
  | { readonly status: 'conflicted'; readonly provenance: Provenance[] };

export function missing(): Observation<never> {
  return { status: 'missing' };
}

export function evidence(
  source: ExtractionSource,
  locator: string,
  text: string,
): Provenance {
  return {
    source,
    locator: locator.slice(0, JOB_POSTING_LIMITS.provenanceLocator),
    excerpt: text.trim().slice(0, JOB_POSTING_LIMITS.provenanceExcerpt),
  };
}

function boundedEvidence(
  groups: readonly (readonly Provenance[])[],
): Provenance[] {
  const result: Provenance[] = [];
  const seen = new Set<string>();
  // Interleave witnesses so a large first observation cannot crowd out the
  // evidence from the observation it disagrees with.
  for (
    let index = 0;
    index < JOB_POSTING_LIMITS.provenancePerValue;
    index += 1
  ) {
    for (const group of groups) {
      const item = group[index];
      if (!item) continue;
      const bounded = evidence(item.source, item.locator, item.excerpt);
      const key = JSON.stringify(bounded);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(bounded);
      if (result.length === JOB_POSTING_LIMITS.provenancePerValue)
        return result;
    }
  }
  return result;
}

export function resolved<T>(
  value: T,
  provenance: readonly Provenance[],
): Observation<T> {
  return {
    status: 'resolved',
    value,
    provenance: boundedEvidence([provenance]),
  };
}

export function conflicted(
  groups: readonly (readonly Provenance[])[],
): Observation<never> {
  // Prefer distinctive witnesses over shared context when the cap cannot fit
  // every leaf of two otherwise similar compound observations.
  const frequency = new Map<string, number>();
  for (const group of groups) {
    for (const excerpt of new Set(group.map((item) => item.excerpt))) {
      frequency.set(excerpt, (frequency.get(excerpt) ?? 0) + 1);
    }
  }
  const prioritized = groups.map((group) =>
    [...group].sort(
      (left, right) =>
        (frequency.get(left.excerpt) ?? 0) -
        (frequency.get(right.excerpt) ?? 0),
    ),
  );
  return { status: 'conflicted', provenance: boundedEvidence(prioritized) };
}

function childConflict(
  observations: readonly Observation<unknown>[],
): Observation<never> | null {
  const conflicts = observations.filter((item) => item.status === 'conflicted');
  return conflicts.length > 0
    ? conflicted(conflicts.map((item) => item.provenance))
    : null;
}

export function mapObservation<T, U>(
  observation: Observation<T>,
  map: (value: T) => U | null,
): Observation<U> {
  if (observation.status !== 'resolved') return observation;
  const value = map(observation.value);
  return value === null ? missing() : resolved(value, observation.provenance);
}

export function fallbackObservation<T>(
  primary: Observation<T>,
  fallback: () => Observation<T>,
): Observation<T> {
  return primary.status === 'missing' ? fallback() : primary;
}

export function scalarObservation<T>(
  observations: readonly Observation<T>[],
  key: (value: T) => string = (value) => JSON.stringify(value),
): Observation<T> {
  const conflict = childConflict(observations);
  if (conflict) return conflict;
  const unique = new Map<
    string,
    Extract<Observation<T>, { status: 'resolved' }>
  >();
  for (const item of observations) {
    if (item.status === 'resolved' && !unique.has(key(item.value))) {
      unique.set(key(item.value), item);
    }
  }
  if (unique.size > 1)
    return conflicted([...unique.values()].map((item) => item.provenance));
  return unique.values().next().value ?? missing();
}

// Collections retain distinct members; only a conflicted member conflicts the
// parent. Scalar cardinality is deliberately handled by a different helper.
export function collectionObservation<T>(
  observations: readonly Observation<T>[],
  memberKey?: (value: T) => string,
): Observation<T[]> {
  const conflict = childConflict(observations);
  if (conflict) return conflict;
  const seen = new Set<string>();
  // Opt-in membership deduplication happens before sharing the evidence cap.
  // Unkeyed collections (including ordered address components) retain repeats.
  const present = observations
    .filter((item) => item.status === 'resolved')
    .filter((item) => {
      if (!memberKey) return true;
      const key = memberKey(item.value);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return present.length === 0
    ? missing()
    : resolved(
        present.map((item) => item.value),
        boundedEvidence(present.map((item) => item.provenance)),
      );
}

// The builder only runs after every child has been checked for conflicts.
export function composeObservation<T extends object, U>(
  fields: { [K in keyof T]: Observation<T[K]> },
  build: (values: { [K in keyof T]: T[K] | null }) => U | null,
): Observation<U> {
  const keys = Object.keys(fields) as (keyof T)[];
  const observations = keys.map((key) => fields[key]);
  const conflict = childConflict(observations);
  if (conflict) return conflict;
  const values = {} as { [K in keyof T]: T[K] | null };
  for (const key of keys) {
    const item = fields[key];
    values[key] = item.status === 'resolved' ? item.value : null;
  }
  const value = build(values);
  const groups = observations.flatMap((item) =>
    item.status === 'resolved' ? [item.provenance] : [],
  );
  return value === null ? missing() : resolved(value, boundedEvidence(groups));
}

export function normalizedObservation<T>(
  observation: Observation<T>,
  score: number,
) {
  return {
    value: observation.status === 'resolved' ? observation.value : null,
    score: observation.status === 'resolved' ? score : 0,
    confidence:
      observation.status === 'resolved' ? ('high' as const) : ('low' as const),
    conflicted: observation.status === 'conflicted',
    provenance: observation.status === 'missing' ? [] : observation.provenance,
  };
}
