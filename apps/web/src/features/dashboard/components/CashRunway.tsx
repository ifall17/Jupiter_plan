interface CashRunwayProps {
  runway: number;
}

export default function CashRunway({ runway }: CashRunwayProps) {
  const isHealthy = runway >= 8;
  const isWarning = runway >= 4 && runway < 8;
  const isCritical = runway < 4;

  const color = isCritical ? 'var(--terra)' : isWarning ? 'var(--gold)' : 'var(--kola)';
  const bgColor = isCritical
    ? 'var(--terra-lt)'
    : isWarning
      ? 'var(--gold-lt)'
      : 'var(--kola-lt)';

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '14px',
        padding: '20px 22px',
      }}
    >
      <h3
        style={{
          fontSize: '13px',
          fontWeight: 600,
          marginTop: 0,
          marginBottom: '16px',
          color: 'var(--text-hi)',
        }}
      >
        Runway Trésorerie
      </h3>
      <div
        style={{
          background: bgColor,
          border: `1px solid ${color}`,
          borderRadius: '10px',
          padding: '16px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontSize: '24px',
            fontWeight: 700,
            color: color,
          }}
        >
          {runway}
        </div>
        <div
          style={{
            fontSize: '12px',
            color: color,
            marginTop: '4px',
          }}
        >
          semaines
        </div>
        <div
          style={{
            fontSize: '11px',
            color: color,
            marginTop: '8px',
            fontWeight: 500,
          }}
        >
          {isHealthy
            ? '✅ Sain'
            : isWarning
              ? '⚠️ Attention'
              : '🔴 Critique'}
        </div>
      </div>
    </div>
  );
}
