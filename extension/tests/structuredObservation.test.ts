import { describe, expect, it, vi } from 'vitest';
import { JOB_POSTING_LIMITS } from '../src/types/jobPosting';
import {
  collectionObservation,
  composeObservation,
  evidence,
  fallbackObservation,
  mapObservation,
  missing,
  normalizedObservation,
  resolved,
  scalarObservation,
} from '../src/scanner/structuredObservation';

function observation(value: string, locator = value) {
  return resolved(value, [evidence('semantic', locator, value)]);
}

describe('structured observation contract', () => {
  it('keeps absence distinct from scalar disagreement and equivalent repeats', () => {
    expect(normalizedObservation(scalarObservation([]), 0.9)).toEqual({
      value: null,
      conflicted: false,
      score: 0,
      confidence: 'low',
      provenance: [],
    });
    const first = observation('First');
    expect(scalarObservation([missing(), first, first])).toEqual(first);
    expect(
      scalarObservation([observation('USD'), observation('usd')], (value) =>
        value.toUpperCase(),
      ),
    ).toEqual(observation('USD'));
    for (const values of [
      ['First', 'Second'],
      ['Second', 'First'],
    ]) {
      const conflict = scalarObservation(
        values.map((value) => observation(value)),
      );
      expect(normalizedObservation(conflict, 0.9)).toMatchObject({
        value: null,
        conflicted: true,
        score: 0,
        confidence: 'low',
      });
    }
  });

  it('never invokes mapping, fallback, or a parent builder on a conflict', () => {
    const conflict = scalarObservation([
      observation('First'),
      observation('Second'),
    ]);
    const map = vi.fn((value: string) => value.toUpperCase());
    const fallback = vi.fn(() => observation('Fallback'));
    const build = vi.fn(() => 'Confident partial parent');
    expect(mapObservation(conflict, map)).toEqual(conflict);
    expect(fallbackObservation(conflict, fallback)).toEqual(conflict);
    expect(
      composeObservation(
        { child: conflict, other: observation('Known') },
        build,
      ),
    ).toEqual(conflict);
    expect(map).not.toHaveBeenCalled();
    expect(fallback).not.toHaveBeenCalled();
    expect(build).not.toHaveBeenCalled();
    expect(fallbackObservation(missing(), fallback)).toEqual(
      observation('Fallback'),
    );
    expect(mapObservation(observation('Present'), map)).toEqual(
      resolved('PRESENT', [evidence('semantic', 'Present', 'Present')]),
    );
  });

  it('retains collection membership but propagates a conflicted child', () => {
    const first = observation('First');
    const second = observation('Second');
    expect(collectionObservation([first, second, missing()])).toMatchObject({
      status: 'resolved',
      value: ['First', 'Second'],
    });
    const conflict = scalarObservation([first, second]);
    expect(collectionObservation([observation('Third'), conflict])).toEqual(
      conflict,
    );
    expect(scalarObservation([observation('Fallback'), conflict])).toEqual(
      conflict,
    );
    expect(
      composeObservation(
        { a: missing(), b: observation('Partial') },
        ({ a, b }) => a ?? b,
      ),
    ).toMatchObject({
      status: 'resolved',
      value: 'Partial',
    });
  });

  it('deduplicates keyed members before sharing provenance without changing unkeyed collections', () => {
    const repeats = Array.from(
      { length: JOB_POSTING_LIMITS.provenancePerValue + 1 },
      (_, index) => observation('London', 'location-' + index),
    );
    const members = [...repeats, observation('Paris')];
    const locations = collectionObservation(members, (value) => value);
    expect(locations).toMatchObject({
      status: 'resolved',
      value: ['London', 'Paris'],
      provenance: [
        evidence('semantic', 'location-0', 'London'),
        evidence('semantic', 'Paris', 'Paris'),
      ],
    });
    expect(collectionObservation(repeats)).toMatchObject({
      value: Array<string>(repeats.length).fill('London'),
    });
    const conflict = scalarObservation([
      observation('London'),
      observation('Berlin'),
    ]);
    expect(
      collectionObservation([...members, conflict], (value) => value),
    ).toEqual(conflict);
  });

  it('bounds evidence while retaining distinctive witnesses in compound conflicts', () => {
    const shared = Array.from({ length: 9 }, (_, index) =>
      evidence('semantic', 'shared-' + index, 'shared-' + index),
    );
    const first = resolved('First', [
      ...shared,
      evidence('semantic', 'first', 'First witness'),
    ]);
    const second = resolved('Second', [
      ...shared,
      evidence('semantic', 'second', 'Second witness'),
    ]);
    const conflict = normalizedObservation(
      scalarObservation([first, second]),
      0.9,
    );
    expect(conflict.provenance).toHaveLength(
      JOB_POSTING_LIMITS.provenancePerValue,
    );
    expect(conflict.provenance.map(({ excerpt }) => excerpt)).toEqual(
      expect.arrayContaining(['First witness', 'Second witness']),
    );
    const bounded = evidence(
      'semantic',
      'L'.repeat(1000),
      ' '.repeat(1000) + 'E'.repeat(1000),
    );
    expect(bounded.locator).toHaveLength(JOB_POSTING_LIMITS.provenanceLocator);
    expect(bounded.excerpt).toHaveLength(JOB_POSTING_LIMITS.provenanceExcerpt);
    expect(bounded.excerpt.trim()).not.toBe('');
  });
});
