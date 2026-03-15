import { useQuery } from '@tanstack/react-query';
import { UserRole } from '@web/shared/enums';
import apiClient, { unwrapApiData } from '../../api/client';
import { formatDate } from '../../utils/date';

type DepartmentScope = { department: string; can_read: boolean; can_write: boolean };

type User = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: UserRole;
  org_id: string;
  is_active: boolean;
  last_login_at: string | null;
  department_scope: DepartmentScope[] | null;
  created_at: string;
};

type PaginatedUsers = { data: User[]; total: number };

const ROLE_STYLE: Record<string, { bg: string; color: string }> = {
  SUPER_ADMIN:  { bg: 'var(--terra-lt)',  color: 'var(--terra)' },
  FPA:          { bg: 'var(--indigo-lt)', color: 'var(--indigo)' },
  CONTRIBUTEUR: { bg: 'var(--kola-lt)',   color: 'var(--kola)' },
  LECTEUR:      { bg: 'var(--gold-lt)',   color: 'var(--gold)' },
};

const TH: React.CSSProperties = {
  padding: '10px 16px', color: 'var(--text-lo)', fontWeight: 600,
  fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', textAlign: 'left',
};
const TD: React.CSSProperties = { padding: '14px 16px', color: 'var(--text-hi)', fontSize: 13 };

export default function UsersPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['users'],
    queryFn: () =>
      apiClient.get<PaginatedUsers>('/users?limit=100').then(unwrapApiData),
  });

  const users = data?.data ?? [];
  const activeCount = users.filter((u) => u.is_active).length;

  return (
    <div className="dashboard-page">
      <div className="page-head">
        <div>
          <p className="page-eyebrow">ADMINISTRATION</p>
          <h1 className="page-title">Gestion des Utilisateurs</h1>
          <p className="page-sub">
            {isLoading ? '…' : `${users.length} utilisateur(s)`}
            {activeCount > 0 && !isLoading ? ` · ${activeCount} actif(s)` : ''}
          </p>
        </div>
      </div>

      {isLoading && (
        <div style={{ display: 'grid', gap: 10 }}>
          {[...Array(5)].map((_, i) => (
            <div key={i} style={{ height: 52, background: 'var(--surface2)', borderRadius: 14, animation: 'pulse 1.5s ease infinite' }} />
          ))}
        </div>
      )}

      {isError && (
        <div style={{ padding: 24, background: 'var(--terra-lt)', border: '1px solid var(--terra)', borderRadius: 14, color: 'var(--terra)', fontSize: 13 }}>
          ⚠️ Impossible de charger les utilisateurs.
        </div>
      )}

      {!isLoading && !isError && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
          {users.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-lo)' }}>Aucun utilisateur.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
                    <th style={TH}>Nom</th>
                    <th style={TH}>Email</th>
                    <th style={TH}>Rôle</th>
                    <th style={TH}>Départements</th>
                    <th style={{ ...TH, textAlign: 'center' }}>Statut</th>
                    <th style={TH}>Dernière connexion</th>
                    <th style={TH}>Créé le</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u, idx) => {
                    const rc = ROLE_STYLE[u.role] ?? { bg: 'var(--surface2)', color: 'var(--text-md)' };
                    const depts = u.department_scope?.filter((d) => d.can_write).map((d) => d.department) ?? [];
                    return (
                      <tr
                        key={u.id}
                        style={{ borderBottom: idx < users.length - 1 ? '1px solid var(--border)' : 'none' }}
                      >
                        <td style={TD}>
                          <span style={{ fontWeight: 600 }}>{u.first_name} {u.last_name}</span>
                        </td>
                        <td style={{ ...TD, color: 'var(--text-md)' }}>{u.email}</td>
                        <td style={TD}>
                          <span style={{ background: rc.bg, color: rc.color, padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>
                            {u.role}
                          </span>
                        </td>
                        <td style={{ ...TD, color: 'var(--text-md)', fontSize: 11 }}>
                          {depts.length > 0 ? depts.join(', ') : '—'}
                        </td>
                        <td style={{ ...TD, textAlign: 'center' }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: u.is_active ? 'var(--kola)' : 'var(--terra)' }}>
                            {u.is_active ? '✓ Actif' : '✗ Inactif'}
                          </span>
                        </td>
                        <td style={{ ...TD, color: 'var(--text-md)' }}>
                          {u.last_login_at ? formatDate(u.last_login_at, 'short') : '—'}
                        </td>
                        <td style={{ ...TD, color: 'var(--text-md)' }}>{formatDate(u.created_at, 'short')}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
