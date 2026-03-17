interface KpiCardProps {
  label: string;
  value: string;
  subtitle?: string;
  trend?: 'up' | 'down' | 'stable';
  color: 'terra' | 'gold' | 'kola' | 'indigo';
  testId?: string;
  showYtdBadge?: boolean;
}

export default function KpiCard({
  label,
  value,
  subtitle,
  trend,
  color,
  testId,
  showYtdBadge,
}: KpiCardProps) {
  const trendIcon =
    trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→';
  const trendColor =
    trend === 'up'
      ? 'var(--kola)'
      : trend === 'down'
        ? 'var(--terra)'
        : 'var(--text-lo)';

  return (
    <div className={`kpi-card ${color}`} data-testid={testId}>
      <div className="kpi-accent" />
      <div className="kpi-body">
        <p className="kpi-label">{label}</p>
        {showYtdBadge && (
          <span
            style={{
              padding: '2px 8px',
              borderRadius: 20,
              fontSize: 9,
              fontWeight: 700,
              background: 'var(--indigo-lt)',
              color: 'var(--indigo)',
              marginLeft: 6,
            }}
          >
            YTD
          </span>
        )}
        <p className="kpi-value" data-testid="kpi-value">
          {value}
        </p>
        {subtitle && <p className="kpi-sub">{subtitle}</p>}
        {trend && (
          <span className="kpi-trend" style={{ color: trendColor }}>
            {trendIcon}
          </span>
        )}
      </div>
    </div>
  );
}
