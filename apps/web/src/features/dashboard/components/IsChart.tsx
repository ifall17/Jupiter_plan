interface IsChartProps {
  data: Array<{
    period_label: string;
    value: number;
  }>;
}

export default function IsChart({ data }: IsChartProps) {
  // Trouve le max pour normaliser
  const maxValue = Math.max(
    ...data.map((d) => Number(d.value) || 0),
    1
  );

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
        Chiffre d'affaires — Tendance
      </h3>
      <div
        style={{
          display: 'flex',
          gap: '8px',
          alignItems: 'flex-end',
          height: '140px',
        }}
      >
        {data.map((item, idx) => (
          <div
            key={idx}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <div
              style={{
                width: '100%',
                height: `${Math.max(
                  (Number(item.value) / maxValue) * 100,
                  5
                )}%`,
                background: 'var(--terra)',
                borderRadius: '4px',
              }}
            />
            <span
              style={{
                fontSize: '10px',
                color: 'var(--text-lo)',
                textAlign: 'center',
                maxWidth: '100%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {item.period_label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
