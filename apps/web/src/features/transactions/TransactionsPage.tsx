import { useMemo, useState, type ChangeEvent, type DragEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient, { unwrapApiData } from '../../api/client';
import { formatFCFA } from '../../utils/currency';
import { formatDate } from '../../utils/date';

type Transaction = {
  id: string;
  period_id: string;
  transaction_date: string;
  account_code: string;
  label: string;
  department: string;
  line_type: 'REVENUE' | 'EXPENSE';
  amount: string;
  is_validated: boolean;
};

type Period = {
  id: string;
  label: string;
};

type PaginatedTransactions = {
  data: Transaction[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

type ImportJob = {
  id: string;
  status: 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED';
  rows_inserted: number | null;
  rows_skipped: number | null;
  error_report?: { message?: string } | ImportErrorItem[] | null;
};

type ImportErrorItem = {
  row: number;
  error: string;
  value: string;
};

type ImportUploadPayload = {
  job_id: string;
  status: 'DONE' | 'FAILED' | 'PENDING' | 'PROCESSING';
  rows_inserted: number | null;
  rows_skipped: number | null;
  error_report?: { message?: string } | ImportErrorItem[] | null;
};

function parseImportErrors(errorReport: unknown): ImportErrorItem[] {
  if (!Array.isArray(errorReport)) {
    return [];
  }

  return errorReport
    .filter((item): item is { row: unknown; error: unknown; value: unknown } => typeof item === 'object' && item !== null)
    .map((item) => ({
      row: Number(item.row) || 0,
      error: String(item.error ?? 'UNKNOWN_ERROR'),
      value: String(item.value ?? ''),
    }));
}

function extractImportErrorMessage(errorReport: unknown): string {
  if (errorReport && typeof errorReport === 'object' && !Array.isArray(errorReport) && 'message' in errorReport) {
    return String((errorReport as { message?: unknown }).message ?? 'Import échoué');
  }

  if (Array.isArray(errorReport) && errorReport.length > 0) {
    return 'Certaines lignes sont invalides';
  }

  return 'Import échoué';
}

function normalizeImportPayload(payload: any): ImportUploadPayload {
  if (payload && typeof payload === 'object' && 'job_id' in payload) {
    return payload as ImportUploadPayload;
  }

  if (payload && typeof payload === 'object' && payload.data && typeof payload.data === 'object' && 'job_id' in payload.data) {
    return payload.data as ImportUploadPayload;
  }

  throw new Error('Réponse import invalide');
}

const departments = ['VENTES', 'ACHATS', 'RH', 'FINANCE', 'MARKETING', 'IT', 'PRODUCTION', 'OPERATIONS'];

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <label style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-md)' }}>
      {children}
    </label>
  );
}

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
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
          width: 'min(100%, 620px)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          background: 'var(--surface)',
          boxShadow: 'var(--shadow-md)',
          padding: 28,
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
        <h2 style={{ marginBottom: 20, color: 'var(--ink)', fontSize: 22, fontFamily: 'var(--font-serif)' }}>{title}</h2>
        {children}
      </div>
    </div>
  );
}

function AddTransactionModal({
  periods,
  onClose,
  onSuccess,
}: {
  periods: Period[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    transaction_date: new Date().toISOString().slice(0, 10),
    account_code: '',
    label: '',
    department: departments[0],
    line_type: 'REVENUE' as 'REVENUE' | 'EXPENSE',
    amount: '',
    period_id: periods[0]?.id ?? '',
    notes: '',
  });
  const [error, setError] = useState('');

  const createMutation = useMutation({
    mutationFn: () =>
      apiClient.post('/transactions', {
        transaction_date: form.transaction_date,
        account_code: form.account_code.trim(),
        label: form.label.trim(),
        department: form.department,
        line_type: form.line_type,
        amount: Number(form.amount).toFixed(2),
        period_id: form.period_id,
        notes: form.notes.trim() || undefined,
      }),
    onSuccess: () => onSuccess(),
    onError: (err: any) => {
      setError(err.response?.data?.message ?? 'Erreur lors de la création');
    },
  });

  const handleSubmit = () => {
    if (!form.transaction_date || !/^\d{6}$/.test(form.account_code.trim()) || !form.label.trim() || !form.period_id) {
      setError('Tous les champs obligatoires doivent être remplis');
      return;
    }

    if (!Number.isFinite(Number(form.amount)) || Number(form.amount) <= 0) {
      setError('Le montant doit être un nombre positif');
      return;
    }

    setError('');
    createMutation.mutate();
  };

  return (
    <ModalShell title="Saisir une transaction" onClose={onClose}>
      <div style={{ display: 'grid', gap: 12 }}>
        <div>
          <FieldLabel>Date de transaction *</FieldLabel>
          <input
            type="date"
            value={form.transaction_date}
            onChange={(event) => setForm({ ...form, transaction_date: event.target.value })}
            style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}
          />
        </div>
        <div>
          <FieldLabel>Code comptable SYSCOHADA *</FieldLabel>
          <input
            value={form.account_code}
            onChange={(event) => setForm({ ...form, account_code: event.target.value })}
            placeholder="701000"
            style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}
          />
        </div>
        <div>
          <FieldLabel>Libellé *</FieldLabel>
          <input
            value={form.label}
            onChange={(event) => setForm({ ...form, label: event.target.value })}
            placeholder="Ex: Vente locale"
            style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}
          />
        </div>
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
          <div>
            <FieldLabel>Département *</FieldLabel>
            <select
              value={form.department}
              onChange={(event) => setForm({ ...form, department: event.target.value })}
              style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}
            >
              {departments.map((department) => (
                <option key={department} value={department}>
                  {department}
                </option>
              ))}
            </select>
          </div>
          <div>
            <FieldLabel>Type *</FieldLabel>
            <select
              value={form.line_type}
              onChange={(event) => setForm({ ...form, line_type: event.target.value as 'REVENUE' | 'EXPENSE' })}
              style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}
            >
              <option value="REVENUE">REVENUE</option>
              <option value="EXPENSE">EXPENSE</option>
            </select>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
          <div>
            <FieldLabel>Montant *</FieldLabel>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.amount}
              onChange={(event) => setForm({ ...form, amount: event.target.value })}
              style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}
            />
          </div>
          <div>
            <FieldLabel>Période *</FieldLabel>
            <select
              value={form.period_id}
              onChange={(event) => setForm({ ...form, period_id: event.target.value })}
              style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}
            >
              <option value="">Sélectionner une période</option>
              {periods.map((period) => (
                <option key={period.id} value={period.id}>
                  {period.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <FieldLabel>Notes</FieldLabel>
          <textarea
            value={form.notes}
            onChange={(event) => setForm({ ...form, notes: event.target.value })}
            rows={3}
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
          onClick={handleSubmit}
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
          {createMutation.isPending ? 'Création...' : 'Créer'}
        </button>
      </div>
    </ModalShell>
  );
}

function ImportExcelModal({
  periods,
  onClose,
  onSuccess,
}: {
  periods: Period[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [periodId, setPeriodId] = useState(periods[0]?.id ?? '');
  const [error, setError] = useState('');
  const [previewRows, setPreviewRows] = useState<string[][]>([]);
  const [importResult, setImportResult] = useState<ImportJob | null>(null);
  const importErrors = useMemo(() => parseImportErrors(importResult?.error_report), [importResult?.error_report]);

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!file) {
        throw new Error('Aucun fichier sélectionné');
      }

      const formData = new FormData();
      formData.append('file', file);
      formData.append('period_id', periodId);

      return apiClient
        .post<{
          job_id: string;
          status: 'DONE' | 'FAILED';
          rows_inserted: number | null;
          rows_skipped: number | null;
          error_report?: { message?: string } | null;
        }>('/imports/upload', formData, {
          headers: { 'Content-Type': undefined },
        })
        .then(unwrapApiData);
    },
    onSuccess: (rawPayload) => {
      let payload: ImportUploadPayload;
      try {
        payload = normalizeImportPayload(rawPayload);
      } catch {
        setError('Réponse import invalide');
        return;
      }

      setImportResult({
        id: payload.job_id,
        status: payload.status,
        rows_inserted: payload.rows_inserted,
        rows_skipped: payload.rows_skipped,
        error_report: payload.error_report ?? null,
      });

      if (payload.status === 'DONE') {
        void onSuccess();
        return;
      }

      setError(extractImportErrorMessage(payload.error_report));
    },
    onError: (err: any) => {
      setError(err.response?.data?.message ?? 'Erreur lors de l import');
    },
  });

  const handleFile = async (selectedFile: File | null) => {
    if (!selectedFile) {
      return;
    }

    if (!selectedFile.name.toLowerCase().endsWith('.xlsx')) {
      setError('Seuls les fichiers .xlsx sont acceptés');
      return;
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      setError('Le fichier dépasse 10Mo');
      return;
    }

    setError('');
    setFile(selectedFile);
    setImportResult(null);

    setPreviewRows([]);
  };

  const handleInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    await handleFile(event.target.files?.[0] ?? null);
  };

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    await handleFile(event.dataTransfer.files?.[0] ?? null);
  };

  return (
    <ModalShell title="Importer un fichier Excel" onClose={onClose}>
      <div style={{ display: 'grid', gap: 14 }}>
        <div
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
          style={{ border: '2px dashed var(--border)', borderRadius: 12, padding: 24, textAlign: 'center', color: 'var(--text-md)' }}
        >
          <p style={{ margin: 0, fontSize: 13 }}>Glissez-déposez un fichier .xlsx ici</p>
          <p style={{ margin: '8px 0', fontSize: 12 }}>ou</p>
          <label style={{ display: 'inline-flex', padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            Parcourir
            <input type="file" accept=".xlsx" onChange={handleInputChange} style={{ display: 'none' }} />
          </label>
          <p style={{ marginTop: 10, fontSize: 11 }}>Taille max : 10Mo</p>
        </div>

        <div>
          <FieldLabel>Période *</FieldLabel>
          <select
            value={periodId}
            onChange={(event) => setPeriodId(event.target.value)}
            style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}
          >
            <option value="">Sélectionner une période</option>
            {periods.map((period) => (
              <option key={period.id} value={period.id}>
                {period.label}
              </option>
            ))}
          </select>
        </div>

        {previewRows.length > 0 ? (
          <div style={{ overflow: 'hidden', border: '1px solid var(--border)', borderRadius: 10 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {previewRows.map((row, index) => (
                  <tr key={index} style={{ background: index === 0 ? 'var(--surface2)' : 'var(--surface)' }}>
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex} style={{ borderBottom: '1px solid var(--border)', padding: '8px 10px', fontSize: 12 }}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {importResult ? (
          <div style={{ borderRadius: 10, background: 'var(--surface2)', padding: '10px 12px', fontSize: 12, color: 'var(--text-md)' }}>
            Statut import : <strong>{importResult.status}</strong>
            {importResult.rows_inserted !== null ? ` · ${importResult.rows_inserted} insérées` : ''}
            {importResult.rows_skipped !== null ? ` · ${importResult.rows_skipped} ignorées` : ''}
          </div>
        ) : null}

        {importErrors.length > 0 ? (
          <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ background: 'var(--surface2)', padding: '8px 10px', fontSize: 12, fontWeight: 700, color: 'var(--text-hi)' }}>
              Détails des lignes rejetées ({importErrors.length})
            </div>
            <div style={{ maxHeight: 180, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--surface2)' }}>
                    <th style={{ padding: '6px 10px', textAlign: 'left', fontSize: 11, color: 'var(--text-lo)' }}>Ligne</th>
                    <th style={{ padding: '6px 10px', textAlign: 'left', fontSize: 11, color: 'var(--text-lo)' }}>Erreur</th>
                    <th style={{ padding: '6px 10px', textAlign: 'left', fontSize: 11, color: 'var(--text-lo)' }}>Valeur</th>
                  </tr>
                </thead>
                <tbody>
                  {importErrors.map((item, index) => (
                    <tr key={`${item.row}-${item.error}-${index}`}>
                      <td style={{ padding: '6px 10px', borderTop: '1px solid var(--border)', fontSize: 12 }}>{item.row}</td>
                      <td style={{ padding: '6px 10px', borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--terra)' }}>{item.error}</td>
                      <td style={{ padding: '6px 10px', borderTop: '1px solid var(--border)', fontSize: 12 }}>{item.value || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
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
          onClick={() => {
            if (!file) {
              setError('Sélectionnez un fichier');
              return;
            }

            if (!periodId) {
              setError('Sélectionnez une période');
              return;
            }

            setError('');
            importMutation.mutate();
          }}
          disabled={!file || !periodId || importMutation.isPending}
          style={{
            padding: '8px 18px',
            borderRadius: 8,
            border: 'none',
            background: importMutation.isPending ? 'var(--text-lo)' : 'var(--terra)',
            color: '#fff',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          {importMutation.isPending ? 'Import...' : 'Confirmer l import'}
        </button>
      </div>
    </ModalShell>
  );
}

export default function TransactionsPage() {
  const [filters, setFilters] = useState({
    period_id: '',
    department: '',
    line_type: '',
    page: 1,
    limit: 20,
  });
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const queryClient = useQueryClient();

  const transactionsQuery = useQuery({
    queryKey: ['transactions', filters],
    queryFn: () => apiClient.get<PaginatedTransactions>('/transactions', { params: filters }).then(unwrapApiData),
  });

  const periodsQuery = useQuery({
    queryKey: ['periods-all'],
    queryFn: () => apiClient.get<Period[]>('/periods').then(unwrapApiData),
  });

  const validateBatchMutation = useMutation({
    mutationFn: (ids: string[]) => apiClient.patch('/transactions/validate-batch', { ids }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['transactions'] });
      setSelectedIds([]);
    },
  });

  const rows = transactionsQuery.data?.data ?? [];
  const allCurrentSelected = useMemo(
    () => rows.length > 0 && rows.every((transaction) => selectedIds.includes(transaction.id)),
    [rows, selectedIds],
  );

  return (
    <div style={{ margin: '0 auto', maxWidth: 1360, padding: '28px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, marginBottom: 28, flexWrap: 'wrap' }}>
        <div>
          <p style={{ marginBottom: 4, color: 'var(--terra)', fontSize: 10, fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase' }}>
            TRANSACTIONS
          </p>
          <h1 style={{ color: 'var(--ink)', fontSize: 28, fontFamily: 'var(--font-serif)' }}>Transactions Financières</h1>
          <p style={{ marginTop: 5, color: 'var(--text-md)', fontSize: 13 }}>
            {transactionsQuery.data?.total ?? 0} transaction(s) au total
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setShowImportModal(true)}
            style={{
              padding: '9px 18px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text-hi)',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Importer Excel
          </button>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            style={{
              padding: '9px 18px',
              borderRadius: 8,
              border: 'none',
              background: 'var(--terra)',
              color: '#fff',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Saisir une transaction
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 20, border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', padding: '14px 18px' }}>
        <select
          value={filters.period_id}
          onChange={(event) => setFilters({ ...filters, period_id: event.target.value, page: 1 })}
          style={{ minWidth: 160, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', padding: '7px 12px', fontSize: 12, color: 'var(--text-hi)' }}
        >
          <option value="">Toutes les périodes</option>
          {periodsQuery.data?.map((period) => (
            <option key={period.id} value={period.id}>
              {period.label}
            </option>
          ))}
        </select>

        <select
          value={filters.department}
          onChange={(event) => setFilters({ ...filters, department: event.target.value, page: 1 })}
          style={{ minWidth: 150, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', padding: '7px 12px', fontSize: 12, color: 'var(--text-hi)' }}
        >
          <option value="">Tous les départements</option>
          {departments.map((department) => (
            <option key={department} value={department}>
              {department}
            </option>
          ))}
        </select>

        <select
          value={filters.line_type}
          onChange={(event) => setFilters({ ...filters, line_type: event.target.value, page: 1 })}
          style={{ minWidth: 130, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', padding: '7px 12px', fontSize: 12, color: 'var(--text-hi)' }}
        >
          <option value="">Tous les types</option>
          <option value="REVENUE">Revenus</option>
          <option value="EXPENSE">Charges</option>
        </select>

        {selectedIds.length > 0 ? (
          <button
            type="button"
            onClick={() => validateBatchMutation.mutate(selectedIds)}
            style={{
              marginLeft: 'auto',
              padding: '7px 16px',
              borderRadius: 8,
              border: 'none',
              background: 'var(--kola)',
              color: '#fff',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            Valider {selectedIds.length} sélectionnée(s)
          </button>
        ) : null}
      </div>

      <div style={{ overflow: 'hidden', border: '1px solid var(--border)', borderRadius: 14, background: 'var(--surface)', boxShadow: 'var(--shadow-sm)' }}>
        {transactionsQuery.isLoading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-md)' }}>Chargement...</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: 28 }}>Aucune transaction</p>
            <p style={{ marginTop: 10, color: 'var(--text-md)', fontSize: 13 }}>Saisissez ou importez des transactions pour alimenter ce module.</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
                <th style={{ width: 40, padding: '12px 16px' }}>
                  <input
                    type="checkbox"
                    checked={allCurrentSelected}
                    onChange={(event) => {
                      if (event.target.checked) {
                        setSelectedIds(rows.map((transaction) => transaction.id));
                        return;
                      }

                      setSelectedIds([]);
                    }}
                  />
                </th>
                {['Date', 'Code', 'Libellé', 'Département', 'Type', 'Montant', 'Statut'].map((header) => (
                  <th
                    key={header}
                    style={{
                      padding: '12px 16px',
                      textAlign: header === 'Montant' ? 'right' : 'left',
                      color: 'var(--text-lo)',
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                    }}
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((transaction, index) => {
                const selected = selectedIds.includes(transaction.id);
                return (
                  <tr
                    key={transaction.id}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      background: selected ? 'rgba(79, 70, 229, 0.08)' : index % 2 === 0 ? 'var(--surface)' : 'var(--surface2)',
                    }}
                  >
                    <td style={{ padding: '12px 16px' }}>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={(event) => {
                          if (event.target.checked) {
                            setSelectedIds((previous) => [...previous, transaction.id]);
                            return;
                          }

                          setSelectedIds((previous) => previous.filter((id) => id !== transaction.id));
                        }}
                      />
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-md)', fontSize: 12 }}>{formatDate(transaction.transaction_date, 'short')}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-md)', fontSize: 12, fontFamily: 'monospace' }}>{transaction.account_code}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-hi)', fontSize: 13, fontWeight: 500 }}>{transaction.label}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-md)', fontSize: 12 }}>{transaction.department}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          borderRadius: 20,
                          padding: '2px 8px',
                          background: transaction.line_type === 'REVENUE' ? 'rgba(5, 150, 105, 0.12)' : 'rgba(200, 95, 52, 0.12)',
                          color: transaction.line_type === 'REVENUE' ? 'var(--kola)' : 'var(--terra)',
                          fontSize: 10,
                          fontWeight: 700,
                        }}
                      >
                        {transaction.line_type === 'REVENUE' ? 'REVENU' : 'CHARGE'}
                      </span>
                    </td>
                    <td
                      style={{
                        padding: '12px 16px',
                        textAlign: 'right',
                        color: transaction.line_type === 'REVENUE' ? 'var(--kola)' : 'var(--terra)',
                        fontSize: 13,
                        fontWeight: 600,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {transaction.line_type === 'REVENUE' ? '+' : '-'}
                      {formatFCFA(transaction.amount)}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          borderRadius: 20,
                          padding: '2px 8px',
                          background: transaction.is_validated ? 'rgba(5, 150, 105, 0.12)' : 'rgba(245, 158, 11, 0.14)',
                          color: transaction.is_validated ? 'var(--kola)' : '#b45309',
                          fontSize: 10,
                          fontWeight: 700,
                        }}
                      >
                        {transaction.is_validated ? 'Validée' : 'En attente'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {transactionsQuery.data && transactionsQuery.data.totalPages > 1 ? (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
          {Array.from({ length: transactionsQuery.data.totalPages }, (_, index) => (
            <button
              key={index}
              type="button"
              onClick={() => setFilters({ ...filters, page: index + 1 })}
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: filters.page === index + 1 ? 'var(--terra)' : 'var(--surface)',
                color: filters.page === index + 1 ? '#fff' : 'var(--text-md)',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {index + 1}
            </button>
          ))}
        </div>
      ) : null}

      {showAddModal && periodsQuery.data ? (
        <AddTransactionModal
          periods={periodsQuery.data}
          onClose={() => setShowAddModal(false)}
          onSuccess={async () => {
            await queryClient.invalidateQueries({ queryKey: ['transactions'] });
            setShowAddModal(false);
          }}
        />
      ) : null}

      {showImportModal && periodsQuery.data ? (
        <ImportExcelModal
          periods={periodsQuery.data}
          onClose={() => setShowImportModal(false)}
          onSuccess={async () => {
            await queryClient.invalidateQueries({ queryKey: ['transactions'] });
            setShowImportModal(false);
          }}
        />
      ) : null}
    </div>
  );
}
