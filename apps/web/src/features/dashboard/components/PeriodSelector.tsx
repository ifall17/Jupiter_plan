interface Period {
  id: string;
  label: string;
  status: string;
}

interface PeriodSelectorProps {
  currentPeriod: Period;
}

export default function PeriodSelector({ currentPeriod }: PeriodSelectorProps) {
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
        onChange={() => {
          // TODO: implémenter le changement de période
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
        <option value={currentPeriod.id}>{currentPeriod.label}</option>
      </select>
    </div>
  );
}
