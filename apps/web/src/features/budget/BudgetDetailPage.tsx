import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useParams } from 'react-router-dom';
import apiClient, { unwrapApiData } from '../../api/client';
import { formatFCFA } from '../../utils/currency';

type BudgetLine = {
  id: string;
  period_id: string;
  period_label?: string;
  account_code: string;
  account_label: string;
  department: string;
  line_type: 'REVENUE' | 'EXPENSE' | string;
  amount_budget: string;
  amount_actual: string;
  variance: string;
};

type Budget = {
  id: string;
  name: string;
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'LOCKED' | string;
  version: number;
  fiscal_year_id: string;
  is_reference?: boolean;
  parent_budget_id?: string | null;
  lines: BudgetLine[];
};

type Period = {
  id: string;
  label: string;
};

const budgetLineSchema = z.object({
  account_code: z.string().trim().regex(/^\d{6}$/, 'Code SYSCOHADA invalide (6 chiffres obligatoires)'),
  account_label: z.string().trim().min(1, 'Tous les champs obligatoires doivent être remplis'),
  department: z.string().min(1, 'Tous les champs obligatoires doivent être remplis'),
  line_type: z.enum(['REVENUE', 'EXPENSE']),
  amount_budget: z
    .string()
    .min(1, 'Montant budget invalide (nombre positif obligatoire)')
    .refine((value) => {
      const parsed = Number(value.replace(',', '.'));
      return Number.isFinite(parsed) && parsed > 0;
    }, 'Montant budget invalide (nombre positif obligatoire)'),
  period_id: z.string().min(1, 'Tous les champs obligatoires doivent être remplis'),
});

type BudgetLineFormValues = z.infer<typeof budgetLineSchema>;

function calcVariance(budget: string, actual: string): string {
  const b = parseFloat(budget ?? '0');
  const a = parseFloat(actual ?? '0');
  if (b === 0) return '—';
  const pct = ((a - b) / b) * 100;
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
}

function BudgetActions({ budget }: { budget: Budget }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const actionMutation = useMutation({
    mutationFn: async (endpoint: 'submit' | 'approve' | 'reject' | 'lock') => {
      if (endpoint === 'reject') {
        const rejectionComment = window.prompt('Motif du rejet (min 10 caractères) :', 'Budget non conforme');
        if (!rejectionComment) return;
        await apiClient.post(`/budgets/${budget.id}/reject`, { rejection_comment: rejectionComment });
        return;
      }
      await apiClient.post(`/budgets/${budget.id}/${endpoint}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['budget', budget.id] });
      void queryClient.invalidateQueries({ queryKey: ['budgets'] });
    },
  });

  const triggerAction = (endpoint: 'submit' | 'approve' | 'reject' | 'lock') => {
    actionMutation.mutate(endpoint);
  };

  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
      {budget.status === 'DRAFT' && (
        <button
          onClick={() => triggerAction('submit')}
          style={{
            padding: '8px 20px',
            background: 'var(--indigo)',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: 13,
          }}
        >
          Soumettre pour approbation
        </button>
      )}

      {budget.status === 'SUBMITTED' && (
        <>
          <button
            onClick={() => triggerAction('approve')}
            style={{
              padding: '8px 20px',
              background: 'var(--kola)',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 13,
            }}
          >
            Approuver
          </button>
          <button
            onClick={() => triggerAction('reject')}
            style={{
              padding: '8px 20px',
              background: 'var(--terra)',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 13,
            }}
          >
            Rejeter
          </button>
        </>
      )}

      {budget.status === 'APPROVED' && (
        <button
          onClick={() => triggerAction('lock')}
          style={{
            padding: '8px 20px',
            background: 'var(--ink)',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: 13,
          }}
        >
          Verrouiller
        </button>
      )}

      {budget.status === 'LOCKED' && (
        <span
          style={{
            padding: '8px 20px',
            background: 'var(--surface2)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            fontSize: 13,
            color: 'var(--text-md)',
          }}
        >
          Budget verrouille - lecture seule
        </span>
      )}

      <button
        onClick={() => navigate(-1)}
        style={{
          padding: '8px 20px',
          background: 'transparent',
          border: '1px solid var(--border)',
          borderRadius: 8,
          cursor: 'pointer',
          fontSize: 13,
          color: 'var(--text-md)',
          marginLeft: 'auto',
        }}
      >
        Retour
      </button>
    </div>
  );
}

export default function BudgetDetailPage() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [showLineModal, setShowLineModal] = useState(false);
  const [editingLine, setEditingLine] = useState<BudgetLine | null>(null);
  const [isAddingLine, setIsAddingLine] = useState(false);
  const [lineError, setLineError] = useState('');
  const [successToast, setSuccessToast] = useState('');
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<BudgetLineFormValues>({
    resolver: zodResolver(budgetLineSchema),
    defaultValues: {
      account_code: '',
      account_label: '',
      department: 'VENTES',
      line_type: 'REVENUE',
      amount_budget: '',
      period_id: '',
    },
  });
  const watchedPeriodId = watch('period_id');

  const deleteMutation = useMutation({
    mutationFn: (lineId: string) => apiClient.delete(`/budgets/${id}/lines/${lineId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['budget', id] });
      setSuccessToast('Ligne supprimée');
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ['budget', id],
    enabled: Boolean(id),
    queryFn: () => apiClient.get<Budget>(`/budgets/${id}`).then(unwrapApiData),
  });

  const periodsQuery = useQuery({
    queryKey: ['periods', data?.fiscal_year_id],
    enabled: Boolean(data?.fiscal_year_id),
    queryFn: () =>
      apiClient
        .get<Period[]>(`/fiscal-years/${data!.fiscal_year_id}/periods`)
        .then(unwrapApiData),
  });

  useEffect(() => {
    if (!successToast) {
      return;
    }
    const timer = window.setTimeout(() => setSuccessToast(''), 2500);
    return () => window.clearTimeout(timer);
  }, [successToast]);

  useEffect(() => {
    if (!showLineModal) {
      return;
    }

    const onEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowLineModal(false);
        reset({
          account_code: '',
          account_label: '',
          department: 'VENTES',
          line_type: 'REVENUE',
          amount_budget: '',
          period_id: '',
        });
        setLineError('');
      }
    };

    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [reset, showLineModal]);

  const periods = periodsQuery.data ?? [];

  useEffect(() => {
    if (!showLineModal || watchedPeriodId || periods.length === 0) {
      return;
    }
    setValue('period_id', periods[0].id);
  }, [periods, setValue, showLineModal, watchedPeriodId]);

  if (isLoading) return <div>Chargement...</div>;
  if (!data) return <div>Budget introuvable.</div>;

  const budget = data;
  const totalBudget = budget.lines?.reduce((sum, line) => sum + (Number(line.amount_budget) || 0), 0) ?? 0;
  const totalActual = budget.lines?.reduce((sum, line) => sum + (Number(line.amount_actual) || 0), 0) ?? 0;

  const resetLineForm = () => {
    reset({
      account_code: '',
      account_label: '',
      department: 'VENTES',
      line_type: 'REVENUE',
      amount_budget: '',
      period_id: periods[0]?.id ?? '',
    });
    setEditingLine(null);
    setLineError('');
  };

  const handleAddLine = handleSubmit(async (values) => {
    const parsedAmount = Number(values.amount_budget.replace(',', '.'));
    setIsAddingLine(true);
    setLineError('');
    try {
      const existingLinesPayload = (budget.lines ?? [])
        .filter((l) => editingLine === null || l.id !== editingLine.id)
        .map((line) => ({
        id: line.id,
        period_id: line.period_id,
        account_code: line.account_code,
        account_label: line.account_label,
        department: line.department,
        line_type: line.line_type,
        amount_budget: String(line.amount_budget),
      }));

      const newLinePayload = {
        ...(editingLine ? { id: editingLine.id } : {}),
        account_code: values.account_code.trim(),
        account_label: values.account_label.trim(),
        department: values.department,
        line_type: values.line_type,
        amount_budget: parsedAmount.toFixed(2),
        period_id: values.period_id,
      };

      await apiClient.put(`/budgets/${budget.id}/lines`, {
        lines: [...existingLinesPayload, newLinePayload],
      });

      await queryClient.invalidateQueries({ queryKey: ['budget', budget.id] });
      setShowLineModal(false);
      resetLineForm();
      setSuccessToast(editingLine ? 'Ligne modifiée avec succès' : 'Ligne ajoutée avec succès');
    } catch (err: any) {
      setLineError(err.response?.data?.message ?? "Erreur lors de l'enregistrement de la ligne");
    } finally {
      setIsAddingLine(false);
    }
  });

  const isEditable = budget.status === 'DRAFT' || budget.status === 'REJECTED';

  const openEditModal = (line: BudgetLine) => {
    setEditingLine(line);
    setValue('account_code', line.account_code);
    setValue('account_label', line.account_label);
    setValue('department', line.department);
    setValue('line_type', line.line_type as 'REVENUE' | 'EXPENSE');
    setValue('amount_budget', String(parseFloat(line.amount_budget)));
    setValue('period_id', line.period_id);
    setLineError('');
    setShowLineModal(true);
  };

  const handleDeleteLine = (line: BudgetLine) => {
    if (!window.confirm(`Supprimer la ligne "${line.account_label}" ?`)) return;
    deleteMutation.mutate(line.id);
  };

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1360, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <p
          style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: 'var(--terra)',
            marginBottom: 4,
          }}
        >
          BUDGET
        </p>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 28, color: 'var(--ink)' }}>{budget.name}</h1>
        {budget.is_reference ? (
          <p
            style={{
              display: 'inline-block',
              marginTop: 8,
              padding: '4px 10px',
              borderRadius: 20,
              fontSize: 11,
              fontWeight: 700,
              background: 'var(--gold-lt)',
              color: 'var(--gold)',
            }}
          >
            ⭐ Budget de reference
          </p>
        ) : null}
        <p style={{ fontSize: 13, color: 'var(--text-md)', marginTop: 5 }}>
          Statut : <strong>{budget.status}</strong>
          {' · '}Version : <strong>{budget.version}</strong>
          {' · '}
          {budget.lines?.length || 0} lignes
        </p>
      </div>

      <BudgetActions budget={budget} />

      {isEditable && (
        <button
          onClick={() => {
            resetLineForm();
            setValue('period_id', watchedPeriodId || periods[0]?.id || '');
            setShowLineModal(true);
          }}
          style={{
            padding: '8px 18px',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--text-hi)',
            marginBottom: 16,
          }}
        >
          + Ajouter une ligne
        </button>
      )}

      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          overflow: 'hidden',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
              {['Code', 'Libelle', 'Departement', 'Période', 'Type', 'Montant Budget', 'Montant Reel', 'Variance', ...(isEditable ? ['Actions'] : [])].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: '12px 16px',
                    textAlign: h === 'Montant Budget' || h === 'Montant Reel' || h === 'Variance' ? 'right' : 'left',
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: 'var(--text-lo)',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {budget.lines?.map((line, i) => (
              <tr
                key={line.id}
                style={{
                  borderBottom: i < budget.lines.length - 1 ? '1px solid var(--border)' : 'none',
                  background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface2)',
                }}
              >
                <td
                  style={{
                    padding: '12px 16px',
                    fontSize: 12,
                    fontFamily: 'monospace',
                    color: 'var(--text-md)',
                  }}
                >
                  {line.account_code}
                </td>
                <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 500, color: 'var(--text-hi)' }}>
                  {line.account_label}
                </td>
                <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-md)' }}>{line.department}</td>
                <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-md)' }}>{line.period_label ?? '—'}</td>
                <td style={{ padding: '12px 16px' }}>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: 20,
                      fontSize: 10,
                      fontWeight: 700,
                      background: line.line_type === 'REVENUE' ? 'var(--kola-lt)' : 'var(--terra-lt)',
                      color: line.line_type === 'REVENUE' ? 'var(--kola)' : 'var(--terra)',
                    }}
                  >
                    {line.line_type === 'REVENUE' ? 'REVENU' : 'CHARGE'}
                  </span>
                </td>
                <td
                  style={{
                    padding: '12px 16px',
                    textAlign: 'right',
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--text-hi)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                  data-testid="amount-fcfa"
                >
                  {formatFCFA(line.amount_budget)}
                </td>
                <td
                  style={{
                    padding: '12px 16px',
                    textAlign: 'right',
                    fontSize: 13,
                    color: 'var(--text-md)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {formatFCFA(line.amount_actual ?? '0')}
                </td>
                <td
                  style={{
                    padding: '12px 16px',
                    textAlign: 'right',
                    fontSize: 13,
                    fontWeight: 600,
                    color:
                      parseFloat(line.amount_actual ?? '0') >= parseFloat(line.amount_budget ?? '0')
                        ? 'var(--kola)'
                        : 'var(--terra)',
                  }}
                >
                  {calcVariance(line.amount_budget, line.amount_actual)}
                </td>
                {isEditable && (
                  <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                    <button
                      onClick={() => openEditModal(line)}
                      title="Modifier"
                      style={{
                        padding: '4px 10px',
                        marginRight: 6,
                        fontSize: 12,
                        border: '1px solid var(--border)',
                        borderRadius: 6,
                        background: 'var(--surface)',
                        cursor: 'pointer',
                        color: 'var(--indigo)',
                      }}
                    >
                      Modifier
                    </button>
                    <button
                      onClick={() => handleDeleteLine(line)}
                      title="Supprimer"
                      style={{
                        padding: '4px 10px',
                        fontSize: 12,
                        border: '1px solid var(--terra)',
                        borderRadius: 6,
                        background: 'transparent',
                        cursor: 'pointer',
                        color: 'var(--terra)',
                      }}
                    >
                      Supprimer
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--surface2)' }}>
              <td
                colSpan={isEditable ? 6 : 5}
                style={{
                  padding: '14px 16px',
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--text-hi)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                TOTAL
              </td>
              <td style={{ padding: '14px 16px', textAlign: 'right', fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>
                {formatFCFA(totalBudget)}
              </td>
              <td style={{ padding: '14px 16px', textAlign: 'right', fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>
                {formatFCFA(totalActual)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {showLineModal && (
        <div
          onClick={() => {
            setShowLineModal(false);
            resetLineForm();
          }}
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
            onClick={(event) => event.stopPropagation()}
            style={{
              background: 'var(--surface)',
              borderRadius: 16,
              padding: 28,
              width: 560,
              boxShadow: 'var(--shadow-md)',
              position: 'relative',
            }}
          >
            <button
              type="button"
              onClick={() => {
                setShowLineModal(false);
                resetLineForm();
              }}
              aria-label="Fermer"
              style={{
                position: 'absolute',
                top: 10,
                right: 10,
                width: 30,
                height: 30,
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text-md)',
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              X
            </button>
            <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 22, color: 'var(--ink)', marginBottom: 20 }}>
              {editingLine ? 'Modifier la ligne budgétaire' : 'Ajouter une ligne budgétaire'}
            </h2>

            <div style={{ display: 'grid', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-md)', display: 'block', marginBottom: 6 }}>
                  Code comptable SYSCOHADA *
                </label>
                <input
                  {...register('account_code')}
                  placeholder="Ex: 701000"
                  style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}
                />
                {errors.account_code ? <p style={{ marginTop: 6, marginBottom: 0, color: 'var(--terra)', fontSize: 12 }}>{errors.account_code.message}</p> : null}
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-md)', display: 'block', marginBottom: 6 }}>
                  Libellé *
                </label>
                <input
                  {...register('account_label')}
                  placeholder="Ex: Ventes locales"
                  style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}
                />
                {errors.account_label ? <p style={{ marginTop: 6, marginBottom: 0, color: 'var(--terra)', fontSize: 12 }}>{errors.account_label.message}</p> : null}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-md)', display: 'block', marginBottom: 6 }}>
                    Département *
                  </label>
                  <select
                    {...register('department')}
                    style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}
                  >
                    {['VENTES', 'ACHATS', 'RH', 'FINANCE', 'MARKETING', 'IT', 'PRODUCTION', 'OPERATIONS'].map((dep) => (
                      <option key={dep} value={dep}>
                        {dep}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-md)', display: 'block', marginBottom: 6 }}>
                    Type *
                  </label>
                  <select
                    {...register('line_type')}
                    style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}
                  >
                    <option value="REVENUE">REVENUE</option>
                    <option value="EXPENSE">EXPENSE</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-md)', display: 'block', marginBottom: 6 }}>
                    Montant budget (FCFA) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    {...register('amount_budget')}
                    placeholder="Ex: 12500000"
                    style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}
                  />
                  {errors.amount_budget ? <p style={{ marginTop: 6, marginBottom: 0, color: 'var(--terra)', fontSize: 12 }}>{errors.amount_budget.message}</p> : null}
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-md)', display: 'block', marginBottom: 6 }}>
                    Période *
                  </label>
                  <select
                    {...register('period_id')}
                    style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}
                  >
                    <option value="">Sélectionner une période</option>
                    {periods.map((period) => (
                      <option key={period.id} value={period.id}>
                        {period.label}
                      </option>
                    ))}
                  </select>
                  {errors.period_id ? <p style={{ marginTop: 6, fontSize: 11, color: 'var(--terra)' }}>{errors.period_id.message}</p> : null}
                  {periods.length === 0 ? (
                    <p style={{ marginTop: 6, fontSize: 11, color: 'var(--terra)' }}>
                      Aucune période disponible. Ouvrez une période avant d'ajouter une ligne.
                    </p>
                  ) : null}
                </div>
              </div>
            </div>

            {lineError ? <p style={{ color: 'var(--terra)', fontSize: 12, marginTop: 14 }}>{lineError}</p> : null}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button
                type="button"
                onClick={() => {
                  setShowLineModal(false);
                  resetLineForm();
                }}
                style={{ padding: '8px 18px', border: '1px solid var(--border)', borderRadius: 8, background: 'transparent', cursor: 'pointer' }}
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={isAddingLine}
                onClick={handleAddLine}
                style={{
                  padding: '8px 18px',
                  border: 'none',
                  borderRadius: 8,
                  background: isAddingLine ? 'var(--text-lo)' : 'var(--terra)',
                  color: '#fff',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                {isAddingLine ? 'Ajout...' : 'Ajouter la ligne'}
                              {isAddingLine ? 'Enregistrement...' : editingLine ? 'Enregistrer les modifications' : 'Ajouter la ligne'}
              </button>
            </div>
          </div>
        </div>
      )}

      {successToast ? (
        <div
          style={{
            position: 'fixed',
            right: 24,
            bottom: 24,
            padding: '10px 14px',
            borderRadius: 10,
            background: 'var(--kola)',
            color: '#fff',
            fontSize: 13,
            zIndex: 320,
            boxShadow: 'var(--shadow-md)',
          }}
        >
          {successToast}
        </div>
      ) : null}
    </div>
  );
}
