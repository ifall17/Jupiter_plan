import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useState } from 'react';
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

function formatSignedFCFA(value: number): string {
  if (!Number.isFinite(value) || value === 0) {
    return formatFCFA(0);
  }
  return `${value > 0 ? '+' : '-'}${formatFCFA(Math.abs(value))}`;
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
  const [showBulkDuplicateModal, setShowBulkDuplicateModal] = useState(false);
  const [bulkSourceLine, setBulkSourceLine] = useState<BudgetLine | null>(null);
  const [selectedPeriodIds, setSelectedPeriodIds] = useState<string[]>([]);
  const [isBulkDuplicating, setIsBulkDuplicating] = useState(false);
  const [bulkError, setBulkError] = useState('');
  const [lineTypeFilter, setLineTypeFilter] = useState<'ALL' | 'REVENUE' | 'EXPENSE'>('ALL');
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
  const budgetRevenueTotal = budget.lines?.reduce(
    (sum, line) => sum + (line.line_type === 'REVENUE' ? Number(line.amount_budget) || 0 : 0),
    0,
  ) ?? 0;
  const budgetExpenseTotal = budget.lines?.reduce(
    (sum, line) => sum + (line.line_type === 'EXPENSE' ? Number(line.amount_budget) || 0 : 0),
    0,
  ) ?? 0;
  const actualRevenueTotal = budget.lines?.reduce(
    (sum, line) => sum + (line.line_type === 'REVENUE' ? Number(line.amount_actual) || 0 : 0),
    0,
  ) ?? 0;
  const actualExpenseTotal = budget.lines?.reduce(
    (sum, line) => sum + (line.line_type === 'EXPENSE' ? Number(line.amount_actual) || 0 : 0),
    0,
  ) ?? 0;
  const totalBudget = budgetRevenueTotal - budgetExpenseTotal;
  const totalActual = actualRevenueTotal - actualExpenseTotal;
  const totalVarianceAmount = totalActual - totalBudget;

  const periodTotals = periods
    .map((period, fiscalIndex) => {
      const lines = (budget.lines ?? []).filter((line) => line.period_id === period.id);
      const revenueBudget = lines.reduce(
        (sum, line) => sum + (line.line_type === 'REVENUE' ? Number(line.amount_budget) || 0 : 0),
        0,
      );
      const expenseBudget = lines.reduce(
        (sum, line) => sum + (line.line_type === 'EXPENSE' ? Number(line.amount_budget) || 0 : 0),
        0,
      );
      const revenueActual = lines.reduce(
        (sum, line) => sum + (line.line_type === 'REVENUE' ? Number(line.amount_actual) || 0 : 0),
        0,
      );
      const expenseActual = lines.reduce(
        (sum, line) => sum + (line.line_type === 'EXPENSE' ? Number(line.amount_actual) || 0 : 0),
        0,
      );
      const netBudget = revenueBudget - expenseBudget;
      const netActual = revenueActual - expenseActual;

      return {
        id: period.id,
        label: period.label,
        fiscalIndex,
        lineCount: lines.length,
        revenueBudget,
        expenseBudget,
        netBudget,
        netActual,
        variance: netActual - netBudget,
      };
    })
    .filter((item) => item.lineCount > 0)
    .sort((a, b) => a.fiscalIndex - b.fiscalIndex);

  const filteredLines = (budget.lines ?? []).filter(
    (line) => lineTypeFilter === 'ALL' || line.line_type === lineTypeFilter,
  );

  const periodOrder = new Map(periods.map((p, idx) => [p.id, idx]));
  const periodLabelOrder = new Map<string, number>();
  periods.forEach((period, idx) => {
    const label = (period.label || '').trim().toLowerCase();
    if (label && !periodLabelOrder.has(label)) {
      periodLabelOrder.set(label, idx);
    }
  });

  const sortedFilteredLines = [...filteredLines].sort(
    (a, b) => (periodOrder.get(a.period_id) ?? 999) - (periodOrder.get(b.period_id) ?? 999),
  );

  type GroupedPeriod = { periodId: string; periodLabel: string; lines: BudgetLine[] };
  const groupedByPeriodMap = new Map<string, GroupedPeriod>();
  for (const line of sortedFilteredLines) {
    const periodLabel = line.period_label ?? '—';
    const periodLabelKey = periodLabel.trim().toLowerCase();

    if (!groupedByPeriodMap.has(periodLabelKey)) {
      groupedByPeriodMap.set(periodLabelKey, {
        periodId: line.period_id,
        periodLabel,
        lines: [line],
      });
    } else {
      groupedByPeriodMap.get(periodLabelKey)!.lines.push(line);
    }
  }

  const groupedByPeriod = Array.from(groupedByPeriodMap.values()).sort((a, b) => {
    const aOrder = periodLabelOrder.get(a.periodLabel.trim().toLowerCase()) ?? 999;
    const bOrder = periodLabelOrder.get(b.periodLabel.trim().toLowerCase()) ?? 999;
    return aOrder - bOrder;
  });

  const departmentTotals = Object.values(
    (budget.lines ?? []).reduce<Record<string, {
      department: string;
      lineCount: number;
      revenueBudget: number;
      expenseBudget: number;
      revenueActual: number;
      expenseActual: number;
    }>>((acc, line) => {
      const department = line.department || 'Non défini';
      const current = acc[department] ?? {
        department,
        lineCount: 0,
        revenueBudget: 0,
        expenseBudget: 0,
        revenueActual: 0,
        expenseActual: 0,
      };

      current.lineCount += 1;
      if (line.line_type === 'REVENUE') {
        current.revenueBudget += Number(line.amount_budget) || 0;
        current.revenueActual += Number(line.amount_actual) || 0;
      } else {
        current.expenseBudget += Number(line.amount_budget) || 0;
        current.expenseActual += Number(line.amount_actual) || 0;
      }

      acc[department] = current;
      return acc;
    }, {}),
  )
    .map((item) => ({
      ...item,
      netBudget: item.revenueBudget - item.expenseBudget,
      netActual: item.revenueActual - item.expenseActual,
      variance: item.revenueActual - item.expenseActual - (item.revenueBudget - item.expenseBudget),
    }))
    .sort((left, right) => left.department.localeCompare(right.department));

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

  const handleDuplicateLine = (line: BudgetLine) => {
    resetLineForm();
    setValue('account_code', line.account_code);
    setValue('account_label', line.account_label);
    setValue('department', line.department);
    setValue('line_type', line.line_type as 'REVENUE' | 'EXPENSE');
    setValue('amount_budget', String(parseFloat(line.amount_budget)));
    setValue('period_id', periods[0]?.id ?? '');
    setEditingLine(null);
    setShowLineModal(true);
  };

  const openBulkDuplicateModal = (line: BudgetLine) => {
    setBulkSourceLine(line);
    setSelectedPeriodIds([]);
    setBulkError('');
    setShowBulkDuplicateModal(true);
  };

  const togglePeriodSelection = (periodId: string) => {
    setSelectedPeriodIds((prev) =>
      prev.includes(periodId) ? prev.filter((p) => p !== periodId) : [...prev, periodId],
    );
  };

  const selectAllPeriods = () => {
    if (!bulkSourceLine) return;
    const available = periods.filter((p) => p.id !== bulkSourceLine.period_id).map((p) => p.id);
    setSelectedPeriodIds((prev) => (prev.length === available.length ? [] : available));
  };

  const handleBulkDuplicate = async () => {
    if (!bulkSourceLine || selectedPeriodIds.length === 0) return;
    setIsBulkDuplicating(true);
    setBulkError('');
    try {
      const existingLinesPayload = (budget.lines ?? []).map((line) => ({
        id: line.id,
        period_id: line.period_id,
        account_code: line.account_code,
        account_label: line.account_label,
        department: line.department,
        line_type: line.line_type,
        amount_budget: String(line.amount_budget),
      }));

      const newLines = selectedPeriodIds.map((periodId) => ({
        account_code: bulkSourceLine.account_code,
        account_label: bulkSourceLine.account_label,
        department: bulkSourceLine.department,
        line_type: bulkSourceLine.line_type,
        amount_budget: parseFloat(bulkSourceLine.amount_budget).toFixed(2),
        period_id: periodId,
      }));

      await apiClient.put(`/budgets/${budget.id}/lines`, {
        lines: [...existingLinesPayload, ...newLines],
      });

      await queryClient.invalidateQueries({ queryKey: ['budget', budget.id] });
      setShowBulkDuplicateModal(false);
      setBulkSourceLine(null);
      setSelectedPeriodIds([]);
      setSuccessToast(`${newLines.length} ligne(s) dupliquée(s) avec succès`);
    } catch (err: any) {
      setBulkError(err.response?.data?.message ?? 'Erreur lors de la duplication');
    } finally {
      setIsBulkDuplicating(false);
    }
  };

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1680, margin: '0 auto' }}>
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
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 14,
          marginBottom: 18,
        }}
      >
        {[
          {
            label: 'Total Global Net',
            budgetValue: totalBudget,
            actualValue: totalActual,
            accent: 'var(--ink)',
          },
          {
            label: 'Total Revenus',
            budgetValue: budgetRevenueTotal,
            actualValue: actualRevenueTotal,
            accent: 'var(--kola)',
          },
          {
            label: 'Total Charges',
            budgetValue: budgetExpenseTotal,
            actualValue: actualExpenseTotal,
            accent: 'var(--terra)',
          },
        ].map((item) => (
          <div
            key={item.label}
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              padding: 16,
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <p
              style={{
                margin: 0,
                marginBottom: 8,
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'var(--text-lo)',
              }}
            >
              {item.label}
            </p>
            <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: item.accent }}>{formatFCFA(item.budgetValue)}</p>
            <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-md)' }}>
              Réel : {formatFCFA(item.actualValue)}
            </p>
            <p
              style={{
                margin: '4px 0 0',
                fontSize: 12,
                fontWeight: 600,
                color: item.actualValue - item.budgetValue >= 0 ? 'var(--kola)' : 'var(--terra)',
              }}
            >
              Écart : {formatSignedFCFA(item.actualValue - item.budgetValue)}
            </p>
          </div>
        ))}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
          gap: 18,
          marginBottom: 18,
        }}
      >
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 14,
            padding: 18,
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <h2 style={{ margin: '0 0 14px', fontSize: 18, color: 'var(--ink)' }}>Totaux par période</h2>
          <div style={{ display: 'grid', gap: 10 }}>
            {periodTotals.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-md)' }}>Aucune ligne budgétaire par période.</p>
            ) : (
              periodTotals.map((period) => (
                <div
                  key={period.id}
                  style={{
                    padding: '12px 14px',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    background: 'var(--surface2)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
                    <strong style={{ fontSize: 14, color: 'var(--text-hi)' }}>{period.label}</strong>
                    <span style={{ fontSize: 12, color: 'var(--text-lo)' }}>{period.lineCount} ligne(s)</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6, fontSize: 12 }}>
                    <span style={{ color: 'var(--kola)' }}>Revenus : {formatFCFA(period.revenueBudget)}</span>
                    <span style={{ color: 'var(--terra)' }}>Charges : {formatFCFA(period.expenseBudget)}</span>
                    <span style={{ color: 'var(--text-md)' }}>Net budgété : {formatFCFA(period.netBudget)}</span>
                    <span style={{ color: period.variance >= 0 ? 'var(--kola)' : 'var(--terra)' }}>
                      Écart net : {formatSignedFCFA(period.variance)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 14,
            padding: 18,
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <h2 style={{ margin: '0 0 14px', fontSize: 18, color: 'var(--ink)' }}>Totaux par département</h2>
          <div style={{ display: 'grid', gap: 10 }}>
            {departmentTotals.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-md)' }}>Aucune ligne budgétaire par département.</p>
            ) : (
              departmentTotals.map((department) => (
                <div
                  key={department.department}
                  style={{
                    padding: '12px 14px',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    background: 'var(--surface2)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
                    <strong style={{ fontSize: 14, color: 'var(--text-hi)' }}>{department.department}</strong>
                    <span style={{ fontSize: 12, color: 'var(--text-lo)' }}>{department.lineCount} ligne(s)</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6, fontSize: 12 }}>
                    <span style={{ color: 'var(--kola)' }}>Revenus : {formatFCFA(department.revenueBudget)}</span>
                    <span style={{ color: 'var(--terra)' }}>Charges : {formatFCFA(department.expenseBudget)}</span>
                    <span style={{ color: 'var(--text-md)' }}>Net budgété : {formatFCFA(department.netBudget)}</span>
                    <span style={{ color: department.variance >= 0 ? 'var(--kola)' : 'var(--terra)' }}>
                      Écart net : {formatSignedFCFA(department.variance)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {(['ALL', 'REVENUE', 'EXPENSE'] as const).map((filter) => {
          const labels: Record<string, string> = { ALL: 'Toutes les lignes', REVENUE: 'Revenus uniquement', EXPENSE: 'Charges uniquement' };
          const isActive = lineTypeFilter === filter;
          return (
            <button
              key={filter}
              onClick={() => setLineTypeFilter(filter)}
              style={{
                padding: '6px 16px',
                fontSize: 12,
                fontWeight: 600,
                border: isActive ? '2px solid var(--indigo)' : '1px solid var(--border)',
                borderRadius: 8,
                background: isActive ? 'var(--indigo-lt, rgba(99,102,241,0.08))' : 'var(--surface)',
                color: isActive ? 'var(--indigo)' : 'var(--text-md)',
                cursor: 'pointer',
              }}
            >
              {labels[filter]}
            </button>
          );
        })}
      </div>

      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          overflowX: 'auto',
          overflowY: 'hidden',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <table style={{ width: '100%', minWidth: isEditable ? 1520 : 1320, borderCollapse: 'collapse' }}>
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
            {groupedByPeriod.map((group) => {
              const groupBudgetSum = group.lines.reduce((s, l) => s + (Number(l.amount_budget) || 0), 0);
              const groupActualSum = group.lines.reduce((s, l) => s + (Number(l.amount_actual) || 0), 0);
              return (
                <React.Fragment key={group.periodId}>
                  {group.lines.map((line, i) => (
                    <tr
                      key={line.id}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface2)',
                      }}
                    >
                      <td style={{ padding: '12px 16px', fontSize: 12, fontFamily: 'monospace', color: 'var(--text-md)' }}>
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
                        <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', minWidth: 320 }}>
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
                      onClick={() => handleDuplicateLine(line)}
                      title="Dupliquer cette ligne sur une autre période"
                      style={{
                        padding: '4px 10px',
                        marginRight: 6,
                        fontSize: 12,
                        border: '1px solid var(--border)',
                        borderRadius: 6,
                        background: 'var(--surface)',
                        cursor: 'pointer',
                        color: 'var(--kola)',
                      }}
                    >
                      Dupliquer
                    </button>
                    <button
                      onClick={() => openBulkDuplicateModal(line)}
                      title="Dupliquer cette ligne sur plusieurs périodes"
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
                      Multi-périodes
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
                  <tr
                    style={{
                      background: 'rgba(99,102,241,0.04)',
                      borderBottom: '2px solid var(--indigo, #6366f1)',
                    }}
                  >
                    <td
                      colSpan={5}
                      style={{
                        padding: '10px 16px',
                        fontSize: 11,
                        fontWeight: 700,
                        color: 'var(--indigo, #6366f1)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                      }}
                    >
                      Sous-total — {group.periodLabel}
                    </td>
                    <td
                      style={{
                        padding: '10px 16px',
                        textAlign: 'right',
                        fontSize: 13,
                        fontWeight: 700,
                        color: 'var(--indigo, #6366f1)',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {formatFCFA(groupBudgetSum)}
                    </td>
                    <td
                      style={{
                        padding: '10px 16px',
                        textAlign: 'right',
                        fontSize: 13,
                        fontWeight: 700,
                        color: 'var(--indigo, #6366f1)',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {formatFCFA(groupActualSum)}
                    </td>
                    <td
                      style={{
                        padding: '10px 16px',
                        textAlign: 'right',
                        fontSize: 13,
                        fontWeight: 700,
                        color: groupActualSum - groupBudgetSum >= 0 ? 'var(--kola)' : 'var(--terra)',
                      }}
                    >
                      {formatSignedFCFA(groupActualSum - groupBudgetSum)}
                    </td>
                    {isEditable ? <td /> : null}
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
          <tfoot>
            {lineTypeFilter === 'ALL' && (
              <>
                <tr style={{ background: 'rgba(34,197,94,0.06)', borderTop: '1px solid var(--border)' }}>
                  <td colSpan={5} style={{ padding: '10px 16px', fontSize: 11, fontWeight: 700, color: 'var(--kola)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Total Revenus
                  </td>
                  <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--kola)' }}>
                    {formatFCFA(budgetRevenueTotal)}
                  </td>
                  <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--kola)' }}>
                    {formatFCFA(actualRevenueTotal)}
                  </td>
                  <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: actualRevenueTotal - budgetRevenueTotal >= 0 ? 'var(--kola)' : 'var(--terra)' }}>
                    {formatSignedFCFA(actualRevenueTotal - budgetRevenueTotal)}
                  </td>
                  {isEditable ? <td /> : null}
                </tr>
                <tr style={{ background: 'rgba(239,68,68,0.06)' }}>
                  <td colSpan={5} style={{ padding: '10px 16px', fontSize: 11, fontWeight: 700, color: 'var(--terra)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Total Charges
                  </td>
                  <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--terra)' }}>
                    {formatFCFA(budgetExpenseTotal)}
                  </td>
                  <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--terra)' }}>
                    {formatFCFA(actualExpenseTotal)}
                  </td>
                  <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: actualExpenseTotal - budgetExpenseTotal >= 0 ? 'var(--kola)' : 'var(--terra)' }}>
                    {formatSignedFCFA(actualExpenseTotal - budgetExpenseTotal)}
                  </td>
                  {isEditable ? <td /> : null}
                </tr>
              </>
            )}
            <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--surface2)' }}>
              <td
                colSpan={5}
                style={{
                  padding: '14px 16px',
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--text-hi)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                {lineTypeFilter === 'ALL' ? 'SOLDE NET (Revenus − Charges)' : lineTypeFilter === 'REVENUE' ? 'TOTAL REVENUS' : 'TOTAL CHARGES'}
              </td>
              <td style={{ padding: '14px 16px', textAlign: 'right', fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>
                {formatFCFA(
                  lineTypeFilter === 'ALL'
                    ? totalBudget
                    : lineTypeFilter === 'REVENUE'
                      ? budgetRevenueTotal
                      : budgetExpenseTotal,
                )}
              </td>
              <td style={{ padding: '14px 16px', textAlign: 'right', fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>
                {formatFCFA(
                  lineTypeFilter === 'ALL'
                    ? totalActual
                    : lineTypeFilter === 'REVENUE'
                      ? actualRevenueTotal
                      : actualExpenseTotal,
                )}
              </td>
              <td
                style={{
                  padding: '14px 16px',
                  textAlign: 'right',
                  fontSize: 14,
                  fontWeight: 700,
                  color: totalVarianceAmount >= 0 ? 'var(--kola)' : 'var(--terra)',
                }}
              >
                {formatSignedFCFA(
                  lineTypeFilter === 'ALL'
                    ? totalVarianceAmount
                    : lineTypeFilter === 'REVENUE'
                      ? actualRevenueTotal - budgetRevenueTotal
                      : actualExpenseTotal - budgetExpenseTotal,
                )}
              </td>
              {isEditable ? <td /> : null}
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
                {isAddingLine ? 'Enregistrement...' : editingLine ? 'Enregistrer les modifications' : 'Ajouter la ligne'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showBulkDuplicateModal && bulkSourceLine && (
        <div
          onClick={() => { setShowBulkDuplicateModal(false); setBulkSourceLine(null); }}
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
              width: 520,
              boxShadow: 'var(--shadow-md)',
              position: 'relative',
            }}
          >
            <button
              type="button"
              onClick={() => { setShowBulkDuplicateModal(false); setBulkSourceLine(null); }}
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

            <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 22, color: 'var(--ink)', marginBottom: 8 }}>
              Dupliquer sur plusieurs périodes
            </h2>

            <div
              style={{
                padding: '12px 16px',
                background: 'var(--surface2)',
                borderRadius: 10,
                border: '1px solid var(--border)',
                marginBottom: 16,
              }}
            >
              <p style={{ fontSize: 12, color: 'var(--text-lo)', margin: 0, marginBottom: 4 }}>Ligne source</p>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-hi)', margin: 0 }}>
                {bulkSourceLine.account_code} — {bulkSourceLine.account_label}
              </p>
              <p style={{ fontSize: 12, color: 'var(--text-md)', margin: 0, marginTop: 2 }}>
                {bulkSourceLine.department} · {bulkSourceLine.line_type === 'REVENUE' ? 'Revenu' : 'Charge'} · {formatFCFA(bulkSourceLine.amount_budget)}
              </p>
              <p style={{ fontSize: 11, color: 'var(--text-lo)', margin: 0, marginTop: 2 }}>
                Période actuelle : {bulkSourceLine.period_label ?? '—'}
              </p>
            </div>

            <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-md)' }}>
                Sélectionner les périodes cibles
              </label>
              <button
                type="button"
                onClick={selectAllPeriods}
                style={{
                  padding: '4px 12px',
                  fontSize: 11,
                  fontWeight: 600,
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  background: 'var(--surface)',
                  cursor: 'pointer',
                  color: 'var(--indigo)',
                }}
              >
                {selectedPeriodIds.length === periods.filter((p) => p.id !== bulkSourceLine.period_id).length
                  ? 'Tout désélectionner'
                  : 'Tout sélectionner'}
              </button>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 8,
                maxHeight: 240,
                overflowY: 'auto',
                marginBottom: 16,
              }}
            >
              {periods
                .filter((p) => p.id !== bulkSourceLine.period_id)
                .map((period) => {
                  const isSelected = selectedPeriodIds.includes(period.id);
                  return (
                    <label
                      key={period.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '8px 12px',
                        borderRadius: 8,
                        border: isSelected ? '2px solid var(--indigo)' : '1px solid var(--border)',
                        background: isSelected ? 'var(--indigo-lt, rgba(99,102,241,0.08))' : 'var(--surface)',
                        cursor: 'pointer',
                        fontSize: 13,
                        fontWeight: isSelected ? 600 : 400,
                        color: isSelected ? 'var(--indigo)' : 'var(--text-md)',
                        transition: 'all 0.15s',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => togglePeriodSelection(period.id)}
                        style={{ accentColor: 'var(--indigo)' }}
                      />
                      {period.label}
                    </label>
                  );
                })}
            </div>

            {selectedPeriodIds.length > 0 && (
              <p style={{ fontSize: 12, color: 'var(--text-md)', marginBottom: 12 }}>
                {selectedPeriodIds.length} période(s) sélectionnée(s) — {selectedPeriodIds.length} ligne(s) seront créées
              </p>
            )}

            {bulkError ? <p style={{ color: 'var(--terra)', fontSize: 12, marginTop: 8 }}>{bulkError}</p> : null}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <button
                type="button"
                onClick={() => { setShowBulkDuplicateModal(false); setBulkSourceLine(null); }}
                style={{ padding: '8px 18px', border: '1px solid var(--border)', borderRadius: 8, background: 'transparent', cursor: 'pointer' }}
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={isBulkDuplicating || selectedPeriodIds.length === 0}
                onClick={handleBulkDuplicate}
                style={{
                  padding: '8px 18px',
                  border: 'none',
                  borderRadius: 8,
                  background:
                    isBulkDuplicating || selectedPeriodIds.length === 0 ? 'var(--text-lo)' : 'var(--indigo)',
                  color: '#fff',
                  cursor: selectedPeriodIds.length === 0 ? 'not-allowed' : 'pointer',
                  fontWeight: 600,
                }}
              >
                {isBulkDuplicating
                  ? 'Duplication...'
                  : `Dupliquer sur ${selectedPeriodIds.length || '…'} période(s)`}
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
