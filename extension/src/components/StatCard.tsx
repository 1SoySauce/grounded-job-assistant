import { Icon, type IconName } from './Icon';

interface StatCardProps {
  label: string;
  value: string | number;
  detail: string;
  icon?: IconName;
}

export function StatCard({ label, value, detail, icon }: StatCardProps) {
  return (
    <article className="stat-card">
      <span className="stat-card__label">
        {label}
        {icon && <Icon name={icon} />}
      </span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}
