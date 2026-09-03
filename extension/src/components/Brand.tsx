interface BrandProps {
  compact?: boolean;
}

export function Brand({ compact = false }: BrandProps) {
  return (
    <div className={compact ? 'brand brand--compact' : 'brand'}>
      <span className="brand__mark" aria-hidden="true">
        G
      </span>
      <span>
        <strong>Grounded</strong>
        {!compact && <small>Job Assistant</small>}
      </span>
    </div>
  );
}
