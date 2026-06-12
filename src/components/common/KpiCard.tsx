import type { ReactNode } from 'react';
import { SkeletonBox } from './SkeletonLoader';

type KpiCardProps = {
  label: string;
  value: ReactNode;
  meta?: ReactNode;
  variant?: 'default' | 'primary' | 'destructive' | 'success' | 'warning';
  loading?: boolean;
};

export const KpiCard = ({ 
  label, 
  value, 
  meta, 
  variant = 'default',
  loading = false
}: KpiCardProps) => {
  const variantClass = variant === 'default' ? '' : `kpi-card--${variant}`;

  return (
    <article className={`kpi-card ${variantClass}`}>
      <p className="kpi-card__label">{label}</p>
      <div className="kpi-card__value">
        {loading ? <SkeletonBox height="2rem" width="60%" /> : value}
      </div>
      {meta && (
        <div className="kpi-card__meta">
          {loading ? <SkeletonBox height="1rem" width="90%" style={{ marginTop: '0.5rem' }} /> : meta}
        </div>
      )}
    </article>
  );
};
