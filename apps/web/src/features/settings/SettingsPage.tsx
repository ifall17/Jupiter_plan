import { useAuthStore } from '../../stores/auth.store';
import { useOrgStore } from '../../stores/org.store';

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const orgName = useOrgStore((s) => s.orgName);
  const currency = useOrgStore((s) => s.currency);
  const fiscalYearId = useOrgStore((s) => s.fiscalYearId);
  const currentPeriod = useOrgStore((s) => s.currentPeriod);

  return (
    <div className="dashboard-page">
      <div className="page-head">
        <div>
          <p className="page-eyebrow">CONFIGURATION</p>
          <h1 className="page-title">Paramètres</h1>
          <p className="page-sub">Organisation &amp; profil utilisateur</p>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 20, maxWidth: 760 }}>
        {/* Organisation info */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '24px 28px' }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-hi)', margin: '0 0 18px 0', letterSpacing: '-0.01em' }}>
            Organisation
          </h2>
          <div style={{ display: 'grid', gap: 0 }}>
            {[
              { label: 'Nom', value: orgName ?? '—' },
              { label: 'Devise', value: currency },
              { label: 'Exercice actif', value: fiscalYearId ? `…${fiscalYearId.slice(-8)}` : '—' },
              { label: 'Période ouverte', value: currentPeriod ? `…${currentPeriod.slice(-8)}` : '—' },
            ].map(({ label, value }, i, arr) => (
              <div
                key={label}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '12px 0',
                  borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none',
                }}
              >
                <span style={{ fontSize: 13, color: 'var(--text-md)' }}>{label}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-hi)' }}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* User profile */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '24px 28px' }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-hi)', margin: '0 0 18px 0', letterSpacing: '-0.01em' }}>
            Mon profil
          </h2>
          <div style={{ display: 'grid', gap: 0 }}>
            {[
              { label: 'Email', value: user?.email ?? '—' },
              { label: 'Rôle', value: user?.role ?? '—' },
            ].map(({ label, value }, i, arr) => (
              <div
                key={label}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '12px 0',
                  borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none',
                }}
              >
                <span style={{ fontSize: 13, color: 'var(--text-md)' }}>{label}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: label === 'Rôle' ? 'var(--terra)' : 'var(--text-hi)' }}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
