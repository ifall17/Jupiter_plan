import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrgStore } from '../../stores/org.store';
import apiClient, { unwrapApiData } from '../../api/client';
import { formatDate } from '../../utils/date';
import { formatFCFA } from '../../utils/currency';

type BudgetLine = {
  id: string;
  account_code: string;
  account_label: string;
  department: string;
  line_type: string;
  amount_budget: string;
  amount_actual: string;
  variance: string;
};

type Budget = {
  id: string;
  name: string;
  status: string;
  version: number;
  fiscal_year_id: string;
  submitted_at: string | null;
  approved_at: string | null;
  locked_at: string | null;
  rejection_comment: string | null;
  lines: BudgetLine[];
  created_at: string;
};

type PaginatedBudgets = { data: Budget[]; total: number; page: number; limit: number };
type FiscalYear = { id: string; label: string };

const STATUS: Record<string, { bg: string; color: string; label: string }> = {
  DRAFT:     { bg: 'var(--surface2)',    color: 'var(--text-md)',  label: 'Brouillon' },
  SUBMITTED: { bg: 'var(--indigo-lt)',   color: 'var(--indigo)',   label: 'Soumis' },
  APPROVED:  { bg: 'var(--kola-lt)',     color: 'var(--kola)',     label: 'Approuvé' },
  REJECTED:  { bg: 'var(--terra-lt)',    color: 'var(--terra)',    label: 'Rejeté' },
  LOCKED:    { bg: 'var(--gold-lt)',     color: 'var(--gold)',     label: 'Verrouillé' },
};

function Badge({ val }: { val: string }) {
  const s = STATUS[val] ?? { bg: 'var(--surface2)', color: 'var(--text-md)', label: val };
  return (
    <span style={{ background: s.bg, color: s.color, padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>
      {s.label}
    </span>
  );
}

const TH: React.CSSProperties = {
  padding: '10px 16px', color: 'var(--text-lo)', fontWeight: 600,
  fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', textAlign: 'left',
};
const TD: React.CSSProperties = { padding: '14px 16px', color: 'var(--text-hi)', fontSize: 13 };

export default function BudgetPage() {
  const fiscalYearId = useOrgStore((s) => s.fiscalYearId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [form, setForm] = useState({ name: '', fiscal_year_id: '' });
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');

  const { data, isLoading, isError: isListError } = useQuery({
    queryKey: ['budgets', fiscalYearId],
    queryFn: () =>
      apiClient
        .get<PaginatedBudgets>(`/budgets${fiscalYearId ? `?fiscal_year_id=${fiscalYearId}&limit=50` : '?limit=50'}`)
        .then(unwrapApiData),
  });

  const fiscalYearsQuery = useQuery({
    queryKey: ['fiscal-years'],
    queryFn: () => apiClient.get<FiscalYear[]>('/fiscal-years').then(unwrapApiData),
    retry: false,
  });

  const budgets = data?.data ?? [];
  const fiscalYears =
    fiscalYearsQuery.data ??
    (fiscalYearId ? [{ id: fiscalYearId, label: 'Exercice courant' }] : []);

  const totalBudget = budgets.reduce(
    (sum, b) => sum + b.lines.reduce((ls, l) => ls + (Number(l.amount_budget) || 0), 0),
    0,
  );

  async function handleCreate() {
    if (!form.name.trim()) {
      setError('Le nom du budget est obligatoire');
      return;
    }
    if (!form.fiscal_year_id) {
      setError('Veuillez selectionner un exercice fiscal');
      return;
    }

    setIsCreating(true);
    setError('');
    try {
      const res = await apiClient.post<Budget>('/budgets', {
        name: form.name.trim(),
        fiscal_year_id: form.fiscal_year_id,
      });
      void queryClient.invalidateQueries({ queryKey: ['budgets'] });
      const created = unwrapApiData(res);
      setShowCreateModal(false);
      setForm({ name: '', fiscal_year_id: '' });
      navigate(`/budget/${created.id}`);
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Erreur lors de la creation');
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="dashboard-page">
      <div className="page-head">
        <div>
          <p className="page-eyebrow">BUDGETS</p>
          <h1 className="page-title">Gestion des Budgets</h1>
          <p className="page-sub">
            {isLoading ? '…' : `${budgets.length} budget(s)`}
            {totalBudget > 0 ? ` · Total budgété : ${formatFCFA(totalBudget)}` : ''}
          </p>
        </div>
        <button
          onClick={() => {
            setShowCreateModal(true);
            setError('');
            setForm((prev) => ({ ...prev, fiscal_year_id: prev.fiscal_year_id || fiscalYearId || '' }));
          }}
          style={{
            padding: '9px 20px',
            background: 'var(--terra)',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          + Nouveau budget
        </button>
      </div>

      {isLoading && (
        <div style={{ display: 'grid', gap: 12 }}>
          {[...Array(4)].map((_, i) => (
            <div key={i} style={{ height: 58, background: 'var(--surface2)', borderRadius: 14, animation: 'pulse 1.5s ease infinite' }} />
          ))}
        </div>
      )}

      {isListError && (
        <div style={{ padding: 24, background: 'var(--terra-lt)', border: '1px solid var(--terra)', borderRadius: 14, color: 'var(--terra)', fontSize: 13 }}>
          ⚠️ Impossible de charger les budgets. Vérifiez que l'API est disponible.
        </div>
      )}

      {!isLoading && !isListError && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
          {budgets.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-lo)' }}>
              Aucun budget pour cet exercice.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
                    <th style={TH}>Nom</th>
                    <th style={TH}>Statut</th>
                    <th style={{ ...TH, textAlign: 'center' }}>Ver.</th>
                    <th style={{ ...TH, textAlign: 'right' }}>Lignes</th>
                    <th style={{ ...TH, textAlign: 'right' }}>Total budgété</th>
                    <th style={TH}>Créé le</th>
                    <th style={TH}>Soumis le</th>
                    <th style={TH}>Approuvé le</th>
                  </tr>
                </thead>
                <tbody>
                  {budgets.map((b, idx) => {
                    const totalLine = b.lines.reduce((s, l) => s + (Number(l.amount_budget) || 0), 0);
                    return (
                      <tr
                        key={b.id}
                        onClick={() => navigate(`/budget/${b.id}`)}
                        style={{
                          borderBottom: idx < budgets.length - 1 ? '1px solid var(--border)' : 'none',
                          cursor: 'pointer',
                          transition: 'background 0.15s',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'var(--surface2)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <td style={TD}><span style={{ fontWeight: 600 }}>{b.name}</span></td>
                        <td style={TD}><Badge val={b.status} /></td>
                        <td style={{ ...TD, textAlign: 'center', color: 'var(--text-md)' }}>v{b.version}</td>
                        <td style={{ ...TD, textAlign: 'right', color: 'var(--text-md)' }}>{b.lines.length}</td>
                        <td style={{ ...TD, textAlign: 'right', fontWeight: 600 }}>{formatFCFA(totalLine)}</td>
                        <td style={{ ...TD, color: 'var(--text-md)' }}>{formatDate(b.created_at, 'short')}</td>
                        <td style={{ ...TD, color: 'var(--text-md)' }}>{b.submitted_at ? formatDate(b.submitted_at, 'short') : '—'}</td>
                        <td style={{ ...TD, color: 'var(--text-md)' }}>{b.approved_at ? formatDate(b.approved_at, 'short') : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showCreateModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(26,26,46,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 300,
          }}
        >
          <div
            style={{
              background: 'var(--surface)',
              borderRadius: 16,
              padding: 32,
              width: 480,
              boxShadow: 'var(--shadow-md)',
            }}
          >
            <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 22, color: 'var(--ink)', marginBottom: 24 }}>
              Nouveau budget
            </h2>

            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--text-md)',
                  display: 'block',
                  marginBottom: 6,
                }}
              >
                Nom du budget *
              </label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ex: Budget FY2026 V2"
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  fontSize: 13,
                  outline: 'none',
                  fontFamily: 'var(--font-body)',
                }}
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--text-md)',
                  display: 'block',
                  marginBottom: 6,
                }}
              >
                Exercice fiscal *
              </label>
              <select
                value={form.fiscal_year_id}
                onChange={(e) => setForm({ ...form, fiscal_year_id: e.target.value })}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  fontSize: 13,
                  background: 'var(--surface)',
                  fontFamily: 'var(--font-body)',
                }}
              >
                <option value="">Selectionner un exercice</option>
                {fiscalYears?.map((fy) => (
                  <option key={fy.id} value={fy.id}>
                    {fy.label}
                  </option>
                ))}
              </select>
            </div>

            {error && <p style={{ color: 'var(--terra)', fontSize: 12, marginBottom: 16 }}>{error}</p>}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setForm({ name: '', fiscal_year_id: '' });
                  setError('');
                }}
                style={{
                  padding: '9px 20px',
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontSize: 13,
                  color: 'var(--text-md)',
                }}
              >
                Annuler
              </button>
              <button
                onClick={handleCreate}
                disabled={isCreating}
                style={{
                  padding: '9px 20px',
                  background: isCreating ? 'var(--text-lo)' : 'var(--terra)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: 13,
                }}
              >
                {isCreating ? 'Creation...' : 'Creer le budget'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
