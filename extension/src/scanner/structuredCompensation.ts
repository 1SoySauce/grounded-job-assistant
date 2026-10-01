import type { Compensation } from '../types/jobPosting';
import {
  composeObservation,
  conflicted,
  mapObservation,
  missing,
  resolved,
  scalarObservation,
  type Observation,
} from './structuredObservation';

export interface Quantity {
  minimum: number | null;
  maximum: number | null;
  interval: Compensation['interval'];
  rawText: string | null;
}

// Internal observations may contain only currency/interval evidence. They are
// not public Compensation values until sibling reconciliation has completed.
export interface Salary extends Quantity {
  currency: string | null;
}

function amountObservation<T extends Quantity>(
  observations: readonly Observation<T>[],
): Observation<T> {
  return scalarObservation(
    observations.map((observation) =>
      mapObservation(observation, (value) =>
        value.minimum !== null ||
        value.maximum !== null ||
        value.rawText !== null
          ? value
          : null,
      ),
    ),
    ({ minimum, maximum, rawText }) =>
      JSON.stringify({ minimum, maximum, rawText }),
  );
}

function intervalObservation(
  observations: readonly Observation<Quantity>[],
): Observation<NonNullable<Compensation['interval']>> {
  return scalarObservation(
    observations.map((observation) =>
      mapObservation(observation, (value) => value.interval),
    ),
  );
}

export function quantityObservation(
  observations: readonly Observation<Quantity>[],
): Observation<Quantity> {
  return composeObservation(
    {
      amount: amountObservation(observations),
      interval: intervalObservation(observations),
    },
    ({ amount, interval }) =>
      amount || interval
        ? {
            minimum: amount?.minimum ?? null,
            maximum: amount?.maximum ?? null,
            interval,
            rawText: amount?.rawText ?? null,
          }
        : null,
  );
}

export function numericValue(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !/^-?\d+(?:\.\d+)?$/.test(value.trim()))
    return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function intervalValue(value: unknown): Compensation['interval'] {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return (
    (['hour', 'day', 'week', 'month', 'year'] as const).find(
      (interval) => normalized === interval || normalized === `${interval}s`,
    ) ?? null
  );
}

export function structuredQuantity(
  single: Observation<number>,
  minimum: Observation<number>,
  maximum: Observation<number>,
  interval: Observation<NonNullable<Compensation['interval']>>,
): Observation<Quantity> {
  const parts = composeObservation(
    { single, minimum, maximum, interval },
    (values) => values,
  );
  if (parts.status !== 'resolved') return parts;
  const values = parts.value;
  if (
    values.single !== null &&
    ((values.minimum !== null && values.single < values.minimum) ||
      (values.maximum !== null && values.single > values.maximum))
  )
    return conflicted([parts.provenance]);
  const lower = values.minimum ?? values.single;
  const upper = values.maximum ?? values.single;
  return lower === null && upper === null && values.interval === null
    ? missing()
    : resolved(
        {
          minimum: lower,
          maximum: upper,
          interval: values.interval,
          rawText: null,
        },
        parts.provenance,
      );
}

export function monetaryCompensation(
  quantity: Observation<Quantity>,
  currency: Observation<string>,
  interval: Observation<NonNullable<Compensation['interval']>>,
): Observation<Salary> {
  const parts = composeObservation(
    { quantity, currency, interval },
    (values) => values,
  );
  if (parts.status !== 'resolved') return parts;
  const values = parts.value;
  const amount = values.quantity;
  if (
    amount?.interval &&
    values.interval &&
    amount.interval !== values.interval
  ) {
    return conflicted([parts.provenance]);
  }
  const period = amount?.interval ?? values.interval;
  if (!amount && values.currency === null && period === null) return missing();
  return resolved(
    {
      rawText: amount?.rawText ?? null,
      minimum: amount?.minimum ?? null,
      maximum: amount?.maximum ?? null,
      currency: values.currency,
      interval: period,
    },
    parts.provenance,
  );
}

export function compensationObservation(
  observations: readonly Observation<Salary>[],
): Observation<Compensation> {
  const parts = composeObservation(
    {
      // Complete amounts still obey scalar semantics; separate ranges are not
      // merged. Component-only siblings also participate in conflict checks.
      amount: amountObservation(observations),
      currency: scalarObservation(
        observations.map((observation) =>
          mapObservation(observation, (value) => value.currency),
        ),
      ),
      interval: intervalObservation(observations),
    },
    ({ amount, currency, interval }) =>
      amount ? { ...amount, currency, interval } : null,
  );
  if (parts.status !== 'resolved') return parts;
  const amount = parts.value;
  const numericText =
    amount.minimum !== null &&
    amount.maximum !== null &&
    amount.minimum !== amount.maximum
      ? `${amount.minimum}\u2013${amount.maximum}`
      : String(amount.minimum ?? amount.maximum);
  const rawText =
    amount.rawText ??
    [
      numericText,
      amount.currency,
      amount.interval ? `per ${amount.interval}` : null,
    ]
      .filter(Boolean)
      .join(' ');
  return resolved(
    {
      rawText,
      minimum: amount.minimum,
      maximum: amount.maximum,
      currency: amount.currency,
      interval: amount.interval,
    },
    parts.provenance,
  );
}
