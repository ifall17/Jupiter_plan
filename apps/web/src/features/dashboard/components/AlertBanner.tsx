interface AlertBannerProps {
  alert: {
    id: string;
    severity: 'CRITICAL' | 'WARN' | 'INFO';
    message: string;
  };
}

export default function AlertBanner({ alert }: AlertBannerProps) {
  const colors = {
    CRITICAL: {
      bg: 'var(--terra-lt)',
      border: 'var(--terra)',
      text: 'var(--terra)',
    },
    WARN: {
      bg: 'var(--gold-lt)',
      border: 'var(--gold)',
      text: 'var(--gold)',
    },
    INFO: {
      bg: 'var(--indigo-lt)',
      border: 'var(--indigo)',
      text: 'var(--indigo)',
    },
  };
  const c = colors[alert.severity];

  return (
    <div
      data-testid="alert-item"
      style={{
        background: c.bg,
        border: `1px solid ${c.border}`,
        borderRadius: '10px',
        padding: '12px 16px',
        marginBottom: '12px',
        color: c.text,
        fontWeight: 600,
        fontSize: '13px',
      }}
    >
      {alert.severity === 'CRITICAL'
        ? '🔴'
        : alert.severity === 'WARN'
          ? '🟡'
          : 'ℹ️'}{' '}
      {alert.message}
    </div>
  );
}
