import AlertBanner from './AlertBanner';

interface Alert {
  id: string;
  severity: 'CRITICAL' | 'WARN' | 'INFO';
  message: string;
}

interface AlertsListProps {
  alerts: Alert[];
}

export default function AlertsList({ alerts }: AlertsListProps) {
  if (alerts.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        marginTop: '24px',
      }}
    >
      <h3
        style={{
          fontSize: '13px',
          fontWeight: 600,
          marginBottom: '12px',
          color: 'var(--text-hi)',
        }}
      >
        Autres Alertes
      </h3>
      <div>
        {alerts.map((alert) => (
          <AlertBanner key={alert.id} alert={alert} />
        ))}
      </div>
    </div>
  );
}
