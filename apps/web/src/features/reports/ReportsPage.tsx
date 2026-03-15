export default function ReportsPage() {
  return (
    <div className="dashboard-page">
      <div className="page-head">
        <div>
          <p className="page-eyebrow">RAPPORTS</p>
          <h1 className="page-title">Rapports &amp; Exports</h1>
          <p className="page-sub">États financiers et exports PDF/Excel</p>
        </div>
      </div>
      <div style={{ padding: 56, textAlign: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, color: 'var(--text-lo)' }}>
        <p style={{ fontSize: 36, margin: 0 }}>🚧</p>
        <p style={{ fontSize: 16, fontWeight: 600, marginTop: 16, color: 'var(--text-md)' }}>Module en cours de développement</p>
        <p style={{ fontSize: 13, marginTop: 8 }}>La génération d'états financiers (P&amp;L, bilan, trésorerie) et l'export seront disponibles prochainement.</p>
      </div>
    </div>
  );
}
