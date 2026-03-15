export default function DashboardError() {
  return (
    <div
      style={{
        padding: '40px',
        textAlign: 'center',
        color: 'var(--text-md)',
      }}
    >
      <p style={{ fontSize: 32 }}>⚠️</p>
      <p style={{ fontWeight: 600, marginTop: 12 }}>
        Impossible de charger le dashboard
      </p>
      <p style={{ fontSize: 13, marginTop: 6 }}>
        Vérifiez que l'API est démarrée sur le port 3001
      </p>
      <button
        onClick={() => window.location.reload()}
        style={{
          marginTop: 16,
          padding: '8px 20px',
          background: 'var(--terra)',
          color: 'white',
          border: 'none',
          borderRadius: 8,
          cursor: 'pointer',
        }}
      >
        Réessayer
      </button>
    </div>
  );
}
