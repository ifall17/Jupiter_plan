interface Period {
  id: string;
  label: string;
  status: string;
}

interface PeriodSelectorProps {
  currentPeriod: Period;
  periods?: Period[];
  onPeriodChange?: (period: Period) => void;
}

export default function PeriodSelector({ currentPeriod, periods = [currentPeriod], onPeriodChange }: PeriodSelectorProps) {
  const selectedPeriods = periods.length > 0 ? periods : [currentPeriod];

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      }}
    >
      <select
        value={currentPeriod.id}
        onChange={(event) => {
          const next = selectedPeriods.find((period) => period.id === event.target.value);
          if (next && onPeriodChange) {
            onPeriodChange(next);
          }
        }}
        style={{
          padding: '8px 12px',
          borderRadius: '8px',
          border: '1px solid var(--border)',
          background: 'var(--surface)',
          color: 'var(--text-hi)',
          fontSize: '13px',
          cursor: 'pointer',
        }}
      >
        {selectedPeriods.map((period) => (
          <option key={period.id} value={period.id}>
            {period.label}
          </option>
        ))}
      </select>
    </div>
  );
}
