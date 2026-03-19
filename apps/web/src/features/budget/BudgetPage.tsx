import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useOrgStore } from '../../stores/org.store';
import apiClient, { unwrapApiData } from '../../api/client';
import { formatDate } from '../../utils/date';
import { formatFCFA } from '../../utils/currency';
import { emitAppError } from '../../utils/notifications';

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
  parent_budget_id: string | null;
  is_reference: boolean;
  submitted_at: string | null;
  approved_at: string | null;
  locked_at: string | null;
  rejection_comment: string | null;
  lines: BudgetLine[];
  created_at: string;
};

type PaginatedBudgets = { data: Budget[]; total: number; page: number; limit: number };
type FiscalYear = { id: string; label: string };

const createBudgetSchema = z.object({
  name: z.string().trim().min(1, 'Le nom du budget est obligatoire'),
  fiscal_year_id: z.string().min(1, 'Veuillez selectionner un exercice fiscal'),
  parent_budget_id: z.string().optional(),
});

type CreateBudgetFormValues = z.infer<typeof createBudgetSchema>;

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
  const [isCreating, setIsCreating] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    clearErrors,
    formState: { errors },
  } = useForm<CreateBudgetFormValues>({
    resolver: zodResolver(createBudgetSchema),
    defaultValues: {
      name: '',
      fiscal_year_id: '',
      parent_budget_id: '',
    },
  });
  const selectedFiscalYearId = watch('fiscal_year_id');

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

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const setReference = useMutation({
    mutationFn: (id: string) => apiClient.post(`/budgets/${id}/set-reference`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['budgets'] });
    },
  });

  const totalBudget = budgets.reduce(
    (sum, b) => sum + b.lines.reduce((ls, l) => ls + (Number(l.amount_budget) || 0), 0),
    0,
  );

  const handleCreate = handleSubmit(async (values) => {
    setIsCreating(true);
    setSubmitError('');
    try {
      const res = await apiClient.post<Budget>('/budgets', {
        name: values.name.trim(),
        fiscal_year_id: values.fiscal_year_id,
        parent_budget_id: values.parent_budget_id || undefined,
      });
      void queryClient.invalidateQueries({ queryKey: ['budgets'] });
      const created = unwrapApiData(res);
      setShowCreateModal(false);
      reset({ name: '', fiscal_year_id: '', parent_budget_id: '' });
      navigate(`/budget/${created.id}`);
    } catch (err: any) {
      setSubmitError(err.response?.data?.message ?? 'Erreur lors de la creation');
    } finally {
      setIsCreating(false);
    }
  });

  async function handleDeleteBudget(budget: Budget) {
    if (!window.confirm(`Supprimer le budget \"${budget.name}\" ?`)) {
      return;
    }

    setDeletingId(budget.id);
    try {
      await apiClient.delete(`/budgets/${budget.id}`);
      await queryClient.invalidateQueries({ queryKey: ['budgets'] });
    } catch (err: any) {
      const message = err.response?.data?.message ?? 'Suppression impossible';
      emitAppError(Array.isArray(message) ? message.join(', ') : message);
    } finally {
      setDeletingId(null);
    }
  }

  function handleSetReference(id: string) {
    if (window.confirm('Definir ce budget comme reference pour cet exercice ?\nL ancien budget de reference perdra ce statut.')) {
      setReference.mutate(id);
    }
  }

  const lockedBudgetsForFiscalYear = budgets.filter(
    (b) => b.status === 'LOCKED' && b.fiscal_year_id === selectedFiscalYearId,
  );

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
            setSubmitError('');
            clearErrors();
            setValue('fiscal_year_id', selectedFiscalYearId || fiscalYearId || '');
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
                    <th style={TH}>Reference</th>
                    <th style={TH}>Reforecast de</th>
                    <th style={{ ...TH, textAlign: 'center' }}>Ver.</th>
                    <th style={{ ...TH, textAlign: 'right' }}>Lignes</th>
                    <th style={{ ...TH, textAlign: 'right' }}>Total budgété</th>
                    <th style={TH}>Créé le</th>
                    <th style={TH}>Soumis le</th>
                    <th style={TH}>Approuvé le</th>
                    <th style={{ ...TH, textAlign: 'right' }}>Actions</th>
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
                        <td style={TD}>
                          <span style={{ fontWeight: 600 }}>{b.name}</span>
                          {b.is_reference && (
                            <span
                              style={{
                                padding: '2px 8px',
                                borderRadius: 20,
                                fontSize: 10,
                                fontWeight: 700,
                                background: 'var(--gold-lt)',
                                color: 'var(--gold)',
                                marginLeft: 8,
                              }}
                            >
                              ⭐ Reference
                            </span>
                          )}
                        </td>
                        <td style={TD}><Badge val={b.status} /></td>
                        <td style={{ ...TD, color: 'var(--text-md)' }}>{b.is_reference ? '⭐' : '—'}</td>
                        <td style={{ ...TD, color: 'var(--text-md)' }}>{b.parent_budget_id ? '↩ Reforecast' : '—'}</td>
                        <td style={{ ...TD, textAlign: 'center', color: 'var(--text-md)' }}>v{b.version}</td>
                        <td style={{ ...TD, textAlign: 'right', color: 'var(--text-md)' }}>{b.lines.length}</td>
                        <td style={{ ...TD, textAlign: 'right', fontWeight: 600 }}>{formatFCFA(totalLine)}</td>
                        <td style={{ ...TD, color: 'var(--text-md)' }}>{formatDate(b.created_at, 'short')}</td>
                        <td style={{ ...TD, color: 'var(--text-md)' }}>{b.submitted_at ? formatDate(b.submitted_at, 'short') : '—'}</td>
                        <td style={{ ...TD, color: 'var(--text-md)' }}>{b.approved_at ? formatDate(b.approved_at, 'short') : '—'}</td>
                        <td style={{ ...TD, textAlign: 'right' }}>
                          {b.status === 'LOCKED' ? (
                            <>
                              {!b.is_reference && (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleSetReference(b.id);
                                  }}
                                  style={{
                                    padding: '5px 12px',
                                    background: 'transparent',
                                    border: '1px solid var(--gold)',
                                    borderRadius: 6,
                                    cursor: 'pointer',
                                    fontSize: 12,
                                    fontWeight: 600,
                                    color: 'var(--gold)',
                                    marginRight: 8,
                                  }}
                                >
                                  ⭐ Definir reference
                                </button>
                              )}
                              <span style={{ fontSize: 12, color: 'var(--text-md)', fontWeight: 600 }}>🔒 Protege</span>
                            </>
                          ) : (
                            <button
                              type="button"
                              disabled={deletingId === b.id || b.status === 'APPROVED'}
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleDeleteBudget(b);
                              }}
                              style={{
                                padding: '6px 10px',
                                background: 'transparent',
                                border: '1px solid var(--border)',
                                borderRadius: 8,
                                color: 'var(--terra)',
                                cursor: deletingId === b.id || b.status === 'APPROVED' ? 'not-allowed' : 'pointer',
                                fontSize: 12,
                                fontWeight: 600,
                              }}
                              title={b.status === 'APPROVED' ? 'Suppression interdite pour ce statut' : 'Supprimer ce budget'}
                            >
                              {deletingId === b.id ? 'Suppression...' : 'Supprimer'}
                            </button>
                          )}
                        </td>
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
                {...register('name')}
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
              {errors.name ? <p style={{ color: 'var(--terra)', fontSize: 12, marginTop: 6 }}>{errors.name.message}</p> : null}
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
                {...register('fiscal_year_id')}
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
              {errors.fiscal_year_id ? <p style={{ color: 'var(--terra)', fontSize: 12, marginTop: 6 }}>{errors.fiscal_year_id.message}</p> : null}
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
                Ce budget est un reforecast de :
              </label>
              <select
                {...register('parent_budget_id')}
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
                <option value="">Aucun (budget initial)</option>
                {lockedBudgetsForFiscalYear.map((lockedBudget) => (
                  <option key={lockedBudget.id} value={lockedBudget.id}>
                    {lockedBudget.name}
                  </option>
                ))}
              </select>
            </div>

            {submitError ? <p style={{ color: 'var(--terra)', fontSize: 12, marginBottom: 16 }}>{submitError}</p> : null}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  reset({ name: '', fiscal_year_id: '', parent_budget_id: '' });
                  setSubmitError('');
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
