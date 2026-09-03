import type { ReactNode } from 'react';

interface StatusPillProps {
  tone: 'positive' | 'warning' | 'neutral' | 'info';
  children: ReactNode;
}

export function StatusPill({ tone, children }: StatusPillProps) {
  return <span className={`status-pill status-pill--${tone}`}>{children}</span>;
}
