interface BrandProps {
  compact?: boolean;
}

export function Brand({ compact = false }: BrandProps) {
  return (
    <div className={compact ? 'brand brand--compact' : 'brand'}>
      <span className="brand__mark" aria-hidden="true">
        <svg viewBox="0 0 32 32" fill="none" focusable="false">
          <path
            d="M23 10a10 10 0 1 0 2 10H16"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="m21 5 5 5-5 5"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span>
        <strong>Grounded</strong>
        {!compact && <small>Job Assistant</small>}
      </span>
    </div>
  );
}
