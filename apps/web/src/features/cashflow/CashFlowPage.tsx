import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import apiClient, { unwrapApiData } from '../../api/client';
import { formatFCFA } from '../../utils/currency';
import { formatDate } from '../../utils/date';
import { usePeriodStore } from '../../stores/period.store';
import {
  bankAccountSchema,
  cashFlowDataSchema,
  parseFinancialPayload,
  plannedFlowSchema,
  type BankAccount,
} from '../../contracts/financial.schemas';

type FlowType =
  | 'ENCAISSEMENT_CLIENT'
  | 'DECAISSEMENT_FOURNISSEUR'
  | 'SALAIRES'
  | 'IMPOTS_TAXES'
  | 'INVESTISSEMENT'
  | 'FINANCEMENT'
  | 'AUTRE_ENTREE'
  | 'AUTRE_SORTIE';

const FLOW_TYPES: Array<{ value: FlowType; label: string }> = [
  { value: 'ENCAISSEMENT_CLIENT', label: 'Paiement recu d un client' },
  { value: 'DECAISSEMENT_FOURNISSEUR', label: 'Paiement a un fournisseur' },
  { value: 'SALAIRES', label: 'Paiement des salaires' },
  { value: 'IMPOTS_TAXES', label: 'Paiements fiscaux' },
  { value: 'INVESTISSEMENT', label: 'Achat d equipement' },
  { value: 'FINANCEMENT', label: 'Emprunt / remboursement' },
  { value: 'AUTRE_ENTREE', label: 'Autre encaissement' },
  { value: 'AUTRE_SORTIE', label: 'Autre decaissement' },
];

const addCashFlowSchema = z.object({
  flow_type: z.enum([
    'ENCAISSEMENT_CLIENT',
    'DECAISSEMENT_FOURNISSEUR',
    'SALAIRES',
    'IMPOTS_TAXES',
    'INVESTISSEMENT',
    'FINANCEMENT',
    'AUTRE_ENTREE',
    'AUTRE_SORTIE',
  ]),
  label: z.string().trim().min(1, 'Les champs obligatoires doivent etre renseignes'),
  amount: z
    .string()
    .min(1, 'Le montant doit etre un nombre positif')
    .refine((value) => Number.isFinite(Number(value)) && Number(value) > 0, 'Le montant doit etre un nombre positif'),
  planned_date: z.string().min(1, 'Les champs obligatoires doivent etre renseignes'),
  bank_account_id: z.string().optional(),
  notes: z.string().optional(),
});

type AddCashFlowFormValues = z.infer<typeof addCashFlowSchema>;

const addBankAccountSchema = z.object({
  bank_name: z.string().trim().min(1, 'Nom de banque et intitule obligatoires'),
  account_number: z.string(),
  account_name: z.string().trim().min(1, 'Nom de banque et intitule obligatoires'),
  current_balance: z
    .string()
    .refine((value) => value === '' || (Number.isFinite(Number(value)) && Number(value) >= 0), 'Solde actuel invalide'),
});

type AddBankAccountFormValues = z.infer<typeof addBankAccountSchema>;

function deriveDirection(flowType: FlowType): 'IN' | 'OUT' {
  if (flowType === 'ENCAISSEMENT_CLIENT' || flowType === 'AUTRE_ENTREE' || flowType === 'FINANCEMENT') {
    return 'IN';
  }
  return 'OUT';
}

function computeWeekFromDate(dateString: string): number {
  const planned = new Date(dateString);
  const now = new Date();
  const diff = planned.getTime() - now.getTime();
  const week = Math.floor(diff / (7 * 24 * 60 * 60 * 1000)) + 1;
  return Math.min(13, Math.max(1, week));
}

function maskAccountNumber(raw: string): string {
  const cleaned = String(raw ?? '').replace(/\s+/g, '');
  const tail = cleaned.slice(-4);
  return `****${tail || '0000'}`;
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 300,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(26, 26, 46, 0.45)',
        padding: 20,
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          position: 'relative',
          width: 'min(100%, 760px)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          background: 'var(--surface)',
          boxShadow: 'var(--shadow-md)',
          padding: 24,
        }}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            width: 30,
            height: 30,
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            color: 'var(--text-md)',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          X
        </button>
        <h2 style={{ marginBottom: 16, color: 'var(--ink)', fontSize: 22, fontFamily: 'var(--font-serif)' }}>{title}</h2>
        {children}
      </div>
    </div>
  );
}

function AddCashFlowModal({
  bankAccounts,
  onClose,
  onSuccess,
}: {
  bankAccounts: BankAccount[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [error, setError] = useState('');
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<AddCashFlowFormValues>({
    resolver: zodResolver(addCashFlowSchema),
    defaultValues: {
      flow_type: 'ENCAISSEMENT_CLIENT',
      label: '',
      amount: '',
      planned_date: new Date().toISOString().slice(0, 10),
      bank_account_id: '',
      notes: '',
    },
  });

  const createMutation = useMutation({
    mutationFn: (values: AddCashFlowFormValues) =>
      apiClient
        .post('/cash-flow/plans', {
          flow_type: values.flow_type,
          label: values.label.trim(),
          amount: Number(values.amount).toFixed(2),
          planned_date: values.planned_date,
          direction: deriveDirection(values.flow_type),
          bank_account_id: values.bank_account_id || undefined,
          notes: values.notes?.trim() || undefined,
        })
        .then((response) => response.data),
    onSuccess: () => {
      onSuccess();
    },
    onError: (err: any) => {
      setError(err.response?.data?.message ?? 'Erreur lors de la creation du flux');
    },
  });

  const flowType = watch('flow_type');
  const plannedDate = watch('planned_date');
  const computedWeek = useMemo(() => computeWeekFromDate(plannedDate || new Date().toISOString().slice(0, 10)), [plannedDate]);

  return (
    <ModalShell title="Saisir un flux de tresorerie" onClose={onClose}>
      <div style={{ display: 'grid', gap: 12 }}>
        <div>
          <label htmlFor="cashflow-type" style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-md)' }}>
            Type de flux *
          </label>
          <select
            id="cashflow-type"
            {...register('flow_type')}
            style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}
          >
            {FLOW_TYPES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.value} - {item.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="cashflow-label" style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-md)' }}>
            Libelle *
          </label>
          <input
            id="cashflow-label"
            {...register('label')}
            placeholder="Ex: Reglement client A"
            style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}
          />
          {errors.label ? <p style={{ marginTop: 6, marginBottom: 0, color: 'var(--terra)', fontSize: 12 }}>{errors.label.message}</p> : null}
        </div>

        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
          <div>
            <label htmlFor="cashflow-amount" style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-md)' }}>
              Montant *
            </label>
            <input
              id="cashflow-amount"
              type="number"
              min="0"
              step="0.01"
              {...register('amount')}
              placeholder="500000"
              style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}
            />
            {errors.amount ? <p style={{ marginTop: 6, marginBottom: 0, color: 'var(--terra)', fontSize: 12 }}>{errors.amount.message}</p> : null}
          </div>

          <div>
            <label htmlFor="cashflow-date" style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-md)' }}>
              Date prevue *
            </label>
            <input
              id="cashflow-date"
              type="date"
              {...register('planned_date')}
              style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}
            />
            {errors.planned_date ? <p style={{ marginTop: 6, marginBottom: 0, color: 'var(--terra)', fontSize: 12 }}>{errors.planned_date.message}</p> : null}
          </div>
        </div>

        <div style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface2)', padding: '10px 12px', fontSize: 12, color: 'var(--text-md)' }}>
          Semaine calculee automatiquement : <strong>S{computedWeek}</strong> · Direction : <strong>{deriveDirection((flowType as FlowType) || 'ENCAISSEMENT_CLIENT')}</strong>
        </div>

        <div>
          <label htmlFor="cashflow-bank" style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-md)' }}>
            Compte bancaire
          </label>
          <select
            id="cashflow-bank"
            {...register('bank_account_id')}
            style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}
          >
            <option value="">Aucun</option>
            {bankAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name} ({account.currency})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="cashflow-notes" style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-md)' }}>
            Notes
          </label>
          <textarea
            id="cashflow-notes"
            rows={3}
            {...register('notes')}
            style={{ width: '100%', resize: 'vertical', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}
          />
        </div>
      </div>

      {error ? <p style={{ marginTop: 14, color: 'var(--terra)', fontSize: 12 }}>{error}</p> : null}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
        <button
          type="button"
          onClick={onClose}
          style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer' }}
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={handleSubmit((values) => {
            setError('');
            createMutation.mutate(values);
          })}
          disabled={createMutation.isPending}
          style={{
            padding: '8px 18px',
            borderRadius: 8,
            border: 'none',
            background: createMutation.isPending ? 'var(--text-lo)' : 'var(--terra)',
            color: '#fff',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          {createMutation.isPending ? 'Creation...' : 'Enregistrer'}
        </button>
      </div>
    </ModalShell>
  );
}

function BankAccountsModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState('');
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AddBankAccountFormValues>({
    resolver: zodResolver(addBankAccountSchema),
    defaultValues: {
      bank_name: '',
      account_number: '',
      account_name: '',
      current_balance: '',
    },
  });

  const accountsQuery = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: () =>
      apiClient
        .get('/bank-accounts')
        .then((r) => parseFinancialPayload(z.array(bankAccountSchema), unwrapApiData(r), 'bank-accounts')),
  });

  const createMutation = useMutation({
    mutationFn: (values: AddBankAccountFormValues) =>
      apiClient.post('/bank-accounts', {
        bank_name: values.bank_name.trim(),
        account_number: values.account_number?.trim(),
        account_name: values.account_name.trim(),
        currency: 'XOF',
        current_balance: Number(values.current_balance || '0').toFixed(2),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['bank-accounts'] });
      setShowCreate(false);
      reset({ bank_name: '', account_number: '', account_name: '', current_balance: '' });
      setError('');
    },
    onError: (err: any) => {
      setError(err.response?.data?.message ?? 'Erreur lors de la creation du compte');
    },
  });

  const accounts = accountsQuery.data ?? [];

  return (
    <ModalShell title="Comptes bancaires" onClose={onClose}>
      <div style={{ display: 'grid', gap: 12 }}>
        {accounts.length === 0 ? (
          <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 16, color: 'var(--text-md)', background: 'var(--surface2)' }}>
            Aucun compte bancaire enregistre.
          </div>
        ) : (
          accounts.map((account) => (
            <div
              key={account.id}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: '12px 14px',
                background: 'var(--surface)',
                display: 'grid',
                gridTemplateColumns: '2fr 1.5fr 1fr 1fr 1fr',
                gap: 8,
                alignItems: 'center',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-hi)' }}>{account.bank_name || account.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-md)' }}>{maskAccountNumber(account.account_number || '')}</div>
              <div style={{ fontSize: 12, color: 'var(--text-hi)', fontWeight: 600 }}>{formatFCFA(account.current_balance || account.balance)}</div>
              <div style={{ fontSize: 12, color: 'var(--text-md)' }}>{account.currency || 'XOF'}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: account.is_active ? 'var(--kola)' : 'var(--terra)' }}>
                {account.is_active ? 'ACTIF' : 'INACTIF'}
              </div>
            </div>
          ))
        )}

        <div>
          <button
            type="button"
            onClick={() => setShowCreate((value) => !value)}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text-hi)',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            + Ajouter un compte
          </button>
        </div>

        {showCreate ? (
          <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, background: 'var(--surface2)', display: 'grid', gap: 10 }}>
            <input
              {...register('bank_name')}
              placeholder="Nom de la banque"
              style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', fontSize: 13 }}
            />
            <input
              {...register('account_number')}
              placeholder="Numero de compte"
              style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', fontSize: 13 }}
            />
            <input
              {...register('account_name')}
              placeholder="Intitule du compte"
              style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', fontSize: 13 }}
            />
            <input
              type="number"
              min="0"
              step="0.01"
              {...register('current_balance')}
              placeholder="Solde actuel"
              style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', fontSize: 13 }}
            />
            {errors.bank_name || errors.account_name || errors.current_balance ? (
              <p style={{ margin: 0, color: 'var(--terra)', fontSize: 12 }}>
                {errors.bank_name?.message || errors.account_name?.message || errors.current_balance?.message}
              </p>
            ) : null}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer' }}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleSubmit((values) => {
                  setError('');
                  createMutation.mutate(values);
                })}
                disabled={createMutation.isPending}
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: 'none',
                  background: createMutation.isPending ? 'var(--text-lo)' : 'var(--terra)',
                  color: '#fff',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                {createMutation.isPending ? 'Creation...' : 'Creer'}
              </button>
            </div>
          </div>
        ) : null}

        {error ? <p style={{ margin: 0, color: 'var(--terra)', fontSize: 12 }}>{error}</p> : null}
      </div>
    </ModalShell>
  );
}

export default function CashFlowPage() {
  const queryClient = useQueryClient();
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [showBankModal, setShowBankModal] = useState(false);
  const { mode, quarterNumber, customFrom, customTo, currentPeriodId } = usePeriodStore();

  const getPeriodParams = () => {
    if (mode === 'ytd') return { ytd: true };
    if (mode === 'quarter') return { quarter: quarterNumber ?? undefined };
    if (mode === 'custom') return { from_period: customFrom ?? undefined, to_period: customTo ?? undefined };
    return { period_id: currentPeriodId };
  };

  const { data: cashFlowData } = useQuery({
    queryKey: ['cashflow', mode, quarterNumber, customFrom, customTo, currentPeriodId],
    queryFn: () =>
      apiClient
        .get('/cash-flow', { params: getPeriodParams() })
        .then((r) => parseFinancialPayload(cashFlowDataSchema, unwrapApiData(r), 'cash-flow')),
    enabled:
      mode === 'ytd' ||
      (mode === 'quarter' && quarterNumber != null) ||
      (mode === 'custom' && !!customFrom && !!customTo) ||
      (!!currentPeriodId && mode === 'single'),
  });
  const { data: bankAccounts } = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: () =>
      apiClient
        .get('/bank-accounts')
        .then((r) => parseFinancialPayload(z.array(bankAccountSchema), unwrapApiData(r), 'bank-accounts')),
  });

  const { data: plans } = useQuery({
    queryKey: ['cashflow-plans', mode, quarterNumber, customFrom, customTo, currentPeriodId],
    queryFn: () =>
      apiClient
        .get('/cash-flow/plans', { params: getPeriodParams() })
        .then((r) => parseFinancialPayload(z.array(plannedFlowSchema), unwrapApiData(r), 'cash-flow/plans')),
    enabled:
      mode === 'ytd' ||
      (mode === 'quarter' && quarterNumber != null) ||
      (mode === 'custom' && !!customFrom && !!customTo) ||
      (!!currentPeriodId && mode === 'single'),
  });

  const deletePlan = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/cash-flow/plans/${id}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['cashflow'] });
      await queryClient.invalidateQueries({ queryKey: ['cashflow-plans'] });
    },
  });

  return (
    <div className="dashboard-page">
      <div className="page-head" style={{ alignItems: 'center' }}>
        <div>
          <p className="page-eyebrow">TRESORERIE</p>
          <h1 className="page-title">Plan de Tresorerie</h1>
          <p className="page-sub">{cashFlowData?.entries_count ?? 0} flux planifie(s)</p>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => setShowBankModal(true)}
            style={{
              padding: '9px 18px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--text-hi)',
            }}
          >
            🏦 Comptes bancaires
          </button>
          <button
            onClick={() => setShowEntryModal(true)}
            style={{
              padding: '9px 18px',
              background: 'var(--terra)',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            + Saisir un flux
          </button>
        </div>
      </div>

      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          overflow: 'auto',
          boxShadow: 'var(--shadow-sm)',
          marginTop: 24,
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
          <thead>
            <tr style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
              <th
                style={{
                  padding: '12px 16px',
                  textAlign: 'left',
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: 'var(--text-lo)',
                  minWidth: 160,
                }}
              >
                CATEGORIE
              </th>
              {Array.from({ length: 13 }, (_, i) => (
                <th
                  key={i}
                  style={{
                    padding: '12px 10px',
                    textAlign: 'right',
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                    color: 'var(--text-lo)',
                    minWidth: 110,
                  }}
                >
                  S{i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--kola-lt)' }}>
              <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, color: 'var(--kola)' }}>
                ↑ Entrees prevues
              </td>
              {Array.from({ length: 13 }, (_, i) => (
                <td key={i} style={{ padding: '12px 10px', textAlign: 'right', fontSize: 12, color: 'var(--kola)', fontWeight: 600 }}>
                  {formatFCFA(cashFlowData?.weekly?.[i]?.inflows ?? '0', false)}
                </td>
              ))}
            </tr>

            <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--terra-lt)' }}>
              <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, color: 'var(--terra)' }}>
                ↓ Sorties prevues
              </td>
              {Array.from({ length: 13 }, (_, i) => (
                <td key={i} style={{ padding: '12px 10px', textAlign: 'right', fontSize: 12, color: 'var(--terra)', fontWeight: 600 }}>
                  {formatFCFA(cashFlowData?.weekly?.[i]?.outflows ?? '0', false)}
                </td>
              ))}
            </tr>

            <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
              <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, color: 'var(--text-hi)' }}>
                = Solde net
              </td>
              {Array.from({ length: 13 }, (_, i) => {
                const inflows = parseFloat(cashFlowData?.weekly?.[i]?.inflows ?? '0');
                const outflows = parseFloat(cashFlowData?.weekly?.[i]?.outflows ?? '0');
                const net = inflows - outflows;
                return (
                  <td
                    key={i}
                    style={{
                      padding: '12px 10px',
                      textAlign: 'right',
                      fontSize: 13,
                      fontWeight: 700,
                      color: net >= 0 ? 'var(--kola)' : 'var(--terra)',
                    }}
                  >
                    {net >= 0 ? '+' : ''}
                    {formatFCFA(String(net), false)}
                  </td>
                );
              })}
            </tr>

            <tr style={{ background: 'var(--surface)' }}>
              <td
                style={{
                  padding: '12px 16px',
                  fontSize: 13,
                  fontWeight: 700,
                  color: 'var(--ink)',
                  borderTop: '2px solid var(--border)',
                }}
              >
                Solde cumule
              </td>
              {Array.from({ length: 13 }, (_, i) => {
                let cumul = 0;
                for (let j = 0; j <= i; j += 1) {
                  const inflows = parseFloat(cashFlowData?.weekly?.[j]?.inflows ?? '0');
                  const outflows = parseFloat(cashFlowData?.weekly?.[j]?.outflows ?? '0');
                  cumul += inflows - outflows;
                }
                return (
                  <td
                    key={i}
                    style={{
                      padding: '12px 10px',
                      textAlign: 'right',
                      fontSize: 13,
                      fontWeight: 700,
                      borderTop: '2px solid var(--border)',
                      color: cumul >= 0 ? 'var(--kola)' : 'var(--terra)',
                    }}
                  >
                    {formatFCFA(String(cumul), false)}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          marginTop: 24,
          overflow: 'hidden',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--surface2)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <p
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--text-lo)',
            }}
          >
            FLUX PLANIFIES ({plans?.length ?? 0})
          </p>
        </div>

        {(plans?.length ?? 0) === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-lo)', fontSize: 13 }}>
            Aucun flux planifie
          </div>
        ) : (
          plans?.map((plan, i) => (
            <div
              key={plan.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '14px 20px',
                borderBottom: i < (plans?.length ?? 0) - 1 ? '1px solid var(--border)' : 'none',
                background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface2)',
                gap: 16,
              }}
            >
              <span
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 16,
                  background: plan.direction === 'IN' ? 'var(--kola-lt)' : 'var(--terra-lt)',
                  flexShrink: 0,
                }}
              >
                {plan.direction === 'IN' ? '↑' : '↓'}
              </span>

              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-hi)', marginBottom: 2 }}>{plan.label}</p>
                <p style={{ fontSize: 11, color: 'var(--text-lo)' }}>
                  {plan.flow_type} · {plan.planned_date ? formatDate(plan.planned_date, 'short') : '-'}
                </p>
              </div>

              <p
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: plan.direction === 'IN' ? 'var(--kola)' : 'var(--terra)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {plan.direction === 'IN' ? '+' : '-'}
                {formatFCFA(plan.amount)}
              </p>

              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`Supprimer "${plan.label}" ?`)) {
                    deletePlan.mutate(plan.id);
                  }
                }}
                title="Supprimer ce flux"
                disabled={deletePlan.isPending}
                style={{
                  background: 'none',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '6px 10px',
                  cursor: deletePlan.isPending ? 'not-allowed' : 'pointer',
                  color: 'var(--terra)',
                  fontSize: 12,
                  flexShrink: 0,
                  transition: 'background 0.15s',
                }}
              >
                Supprimer
              </button>
            </div>
          ))
        )}
      </div>

      {showEntryModal ? (
        <AddCashFlowModal
          bankAccounts={bankAccounts ?? []}
          onClose={() => setShowEntryModal(false)}
          onSuccess={async () => {
            await queryClient.invalidateQueries({ queryKey: ['cashflow'] });
            setShowEntryModal(false);
          }}
        />
      ) : null}

      {showBankModal ? <BankAccountsModal onClose={() => setShowBankModal(false)} /> : null}
    </div>
  );
}
