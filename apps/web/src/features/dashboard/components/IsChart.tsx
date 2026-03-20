interface IsChartProps {
  data: Array<{
    period_label: string;
    value: number;
  }>;
}

export default function IsChart({ data }: IsChartProps) {
  const values = data.map((d) => Number(d.value) || 0);
  const totalSum = values.reduce((s, v) => s + v, 0);
  const maxValue = Math.max(...values, 1);
  const hasData = data.length > 0 && totalSum > 0;

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
      {!hasData ? (
        <div
          style={{
            height: '140px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-lo)',
            fontSize: '13px',
          }}
        >
          Aucune donnée disponible
        </div>
      ) : (
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
                  height: `${Math.max((Number(item.value) / maxValue) * 100, 5)}%`,
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
      )}
    </div>
  );
}
