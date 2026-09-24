import type { Compensation } from '../types/jobPosting';
import {
  composeObservation,
  conflicted,
  missing,
  resolved,
  type Observation,
} from './structuredObservation';

export interface Quantity {
  minimum: number | null;
  maximum: number | null;
  interval: Compensation['interval'];
  rawText: string | null;
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
  return lower === null && upper === null
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
): Observation<Compensation> {
  const parts = composeObservation(
    { quantity, currency, interval },
    (values) => values,
  );
  if (parts.status !== 'resolved') return parts;
  const values = parts.value;
  if (!values.quantity) return missing();
  const amount = values.quantity;
  if (
    amount.interval &&
    values.interval &&
    amount.interval !== values.interval
  ) {
    return conflicted([parts.provenance]);
  }
  const period = amount.interval ?? values.interval;
  const numericText =
    amount.minimum !== null &&
    amount.maximum !== null &&
    amount.minimum !== amount.maximum
      ? `${amount.minimum}\u2013${amount.maximum}`
      : String(amount.minimum ?? amount.maximum);
  const rawText =
    amount.rawText ??
    [numericText, values.currency, period ? `per ${period}` : null]
      .filter(Boolean)
      .join(' ');
  return resolved(
    {
      rawText,
      minimum: amount.minimum,
      maximum: amount.maximum,
      currency: values.currency,
      interval: period,
    },
    parts.provenance,
  );
}
