import type { ReactNode } from 'react';

const paths = {
  grid: <path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" />,
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
    </>
  ),
  file: (
    <>
      <path d="M14 2H5a1 1 0 0 0-1 1v18a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V8zM14 2v6h6M8 13h8M8 17h5" />
    </>
  ),
  message: (
    <path d="M21 11a8 8 0 0 1-8 8H8l-5 3V5a2 2 0 0 1 2-2h8a8 8 0 0 1 8 8ZM7 8h9M7 12h6" />
  ),
  sliders: (
    <>
      <path d="M4 3v7m0 4v7M12 3v12m0 4v2M20 3v2m0 4v12M1 10h6M9 15h6M17 5h6" />
    </>
  ),
  'arrow-right': <path d="M4 12h16m-6-6 6 6-6 6" />,
  scan: (
    <>
      <path d="M8 3H4a1 1 0 0 0-1 1v4m13-5h4a1 1 0 0 1 1 1v4M3 16v4a1 1 0 0 0 1 1h4m8 0h4a1 1 0 0 0 1-1v-4M3 12h18" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  shield: <path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6zM8 11l3 3 5-5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  trash: (
    <>
      <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />
    </>
  ),
  edit: <path d="m16 3 5 5L8 21H3v-5ZM13 6l5 5" />,
  'chevron-right': <path d="m9 5 7 7-7 7" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  alert: (
    <>
      <path d="m12 3 10 18H2zM12 9v4" />
      <path d="M12 17h.01" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="7.5" />
      <path d="m16 16 5 5" />
    </>
  ),
  external: (
    <path d="M14 3h7v7M21 3l-9 9M10 3H4a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-6" />
  ),
  sparkles: (
    <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5ZM20 2v4M18 4h4" />
  ),
  briefcase: (
    <>
      <rect x="3" y="7" width="18" height="14" rx="2" />
      <path d="M8 7V3h8v4M3 12a20 20 0 0 0 18 0M12 12v4" />
    </>
  ),
  settings: (
    <>
      <path d="m9 3-1 3-3 1-2 4 2 2v3l4 3 3-1 3 1 4-3v-3l2-2-2-4-3-1-1-3z" />
      <circle cx="12" cy="11" r="3" />
    </>
  ),
  loader: <path d="M21 12a9 9 0 1 1-9-9" />,
  upload: <path d="M12 16V3m-5 5 5-5 5 5M3 16v5h18v-5" />,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof paths;

/** Decorative icons always accompany visible labels. */
export function Icon({
  name,
  className = '',
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <svg
      className={`icon ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  );
}
