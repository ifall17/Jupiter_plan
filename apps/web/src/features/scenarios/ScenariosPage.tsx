import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import apiClient, { unwrapApiData } from '../../api/client';
import { formatFCFA } from '../../utils/currency';

type Scenario = {
  id: string;
  name: string;
  type: string;
  status: string;
  budget_id: string;
  hypotheses: Array<{ id: string; label: string; parameter: string; value: string; unit: string }> | null;
  snapshot: {
    is_revenue: string;
    is_ebitda: string;
    is_net: string;
  } | null;
  created_at: string;
};

type PaginatedScenarios = { data: Scenario[]; total: number; page: number; limit: number; totalPages: number };

type Budget = {
  id: string;
  name: string;
  version: number;
  lines: Array<{ amount_budget: string }>;
};

type PaginatedBudgets = { data: Budget[]; total: number; page: number; limit: number; totalPages: number };

type ScenarioTypeForm = 'BASE' | 'OPTIMISTE' | 'PESSIMISTE' | 'STRESS_TEST';

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  SAVED: { bg: 'var(--kola-lt)', color: 'var(--kola)' },
  CALCULATED: { bg: 'var(--indigo-lt)', color: 'var(--indigo)' },
  CALCULATING: { bg: 'var(--gold-lt)', color: 'var(--gold)' },
  DRAFT: { bg: 'var(--surface2)', color: 'var(--text-md)' },
};


function ScenarioTypeLabel({ value }: { value: string }) {
  const label = value === 'OPTIMISTE' ? 'Optimiste' : value === 'PESSIMISTE' ? 'Pessimiste' : value === 'CUSTOM' ? 'Stress test' : 'Base';
  return <>{label}</>;
}

export default function ScenariosPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [form, setForm] = useState<{ name: string; type: ScenarioTypeForm; budget_id: string }>({
    name: '',
    type: 'BASE',
    budget_id: '',
  });
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['scenarios'],
    queryFn: () => apiClient.get<PaginatedScenarios>('/scenarios?limit=50').then(unwrapApiData),
  });

  const budgetsQuery = useQuery({
    queryKey: ['budgets-approved'],
    queryFn: () =>
      apiClient
        .get<PaginatedBudgets>('/budgets', { params: { status: 'APPROVED', limit: 100 } })
        .then(unwrapApiData),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const apiType = form.type === 'STRESS_TEST' ? 'CUSTOM' : form.type;
      const created = await apiClient
        .post<Scenario>('/scenarios', {
          name: form.name.trim(),
          type: apiType,
          budget_id: form.budget_id,
        })
        .then(unwrapApiData);
      return created;
    },
    onSuccess: async (scenario) => {
      await queryClient.invalidateQueries({ queryKey: ['scenarios'] });
      setShowCreateModal(false);
      setForm({ name: '', type: 'BASE', budget_id: '' });
      navigate(`/scenarios/${scenario.id}`);
    },
    onError: (err: any) => {
      setError(err.response?.data?.message ?? 'Erreur lors de la création du scénario');
    },
    onSettled: () => setIsCreating(false),
  });

  const scenarios = data?.data ?? [];
  const doneCount = scenarios.filter((s) => s.status === 'CALCULATED' || s.status === 'SAVED').length;
  const budgets = budgetsQuery.data?.data ?? [];

  async function handleCreate() {
    if (!form.name.trim()) {
      setError('Le nom du scénario est obligatoire');
      return;
    }
    if (!form.budget_id) {
      setError('Le budget de base est obligatoire');
      return;
    }

    setError('');
    setIsCreating(true);
    createMutation.mutate();
  }

  return (
    <div className="dashboard-page">
      <div className="page-head">
        <div>
          <p className="page-eyebrow">SCÉNARIOS</p>
          <h1 className="page-title">Planification & Scénarios</h1>
          <p className="page-sub">
            {isLoading ? '…' : `${scenarios.length} scénario(s)`}
            {doneCount > 0 ? ` · ${doneCount} calculé(s)` : ''}
          </p>
        </div>
        <button
          onClick={() => {
            setError('');
            setShowCreateModal(true);
          }}
          style={{
            padding: '9px 20px',
            background: 'var(--terra)',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: 13,
          }}
        >
          + Nouveau scénario
        </button>
      </div>

      {isLoading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {[...Array(3)].map((_, i) => (
            <div key={i} style={{ height: 140, background: 'var(--surface2)', borderRadius: 14, animation: 'pulse 1.5s ease infinite' }} />
          ))}
        </div>
      )}

      {isError && (
        <div style={{ padding: 24, background: 'var(--terra-lt)', border: '1px solid var(--terra)', borderRadius: 14, color: 'var(--terra)', fontSize: 13 }}>
          ⚠️ Impossible de charger les scénarios.
        </div>
      )}

      {!isLoading && !isError && (
        scenarios.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-lo)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14 }}>
            <p style={{ fontSize: 28 }}>📐</p>
            <p style={{ fontWeight: 600, marginTop: 8, color: 'var(--text-md)' }}>Aucun scénario créé</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 14 }}>
            {scenarios.map((scenario) => {
              const statusStyle = STATUS_STYLE[scenario.status] ?? { bg: 'var(--surface2)', color: 'var(--text-md)' };
              return (
                <div
                  key={scenario.id}
                  onClick={() => navigate(`/scenarios/${scenario.id}`)}
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 14,
                    padding: '20px 24px',
                    cursor: 'pointer',
                    transition: 'box-shadow 0.2s, transform 0.2s',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = 'var(--shadow-md)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = '';
                    e.currentTarget.style.transform = '';
                  }}
                  data-testid="scenario-card"
                >
                  <div>
                    <p style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-hi)', marginBottom: 4 }}>
                      {scenario.name}
                    </p>
                    <p style={{ fontSize: 12, color: 'var(--text-md)' }}>
                      Type : <ScenarioTypeLabel value={scenario.type} /> · {scenario.hypotheses?.length ?? 0} hypothèse(s)
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span
                      style={{
                        padding: '4px 12px',
                        borderRadius: 20,
                        fontSize: 11,
                        fontWeight: 700,
                        background: statusStyle.bg,
                        color: statusStyle.color,
                      }}
                    >
                      {scenario.status}
                    </span>
                    <span style={{ fontSize: 13, color: 'var(--text-lo)' }}>→</span>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {showCreateModal && (
        <div
          onClick={() => {
            if (!isCreating) {
              setShowCreateModal(false);
            }
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(26,26,46,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 250,
            padding: 20,
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: 'min(100%, 560px)',
              background: 'var(--surface)',
              borderRadius: 16,
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow-md)',
              padding: 24,
            }}
          >
            <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 24, color: 'var(--ink)', marginBottom: 18 }}>
              Nouveau scénario
            </h2>

            <div style={{ display: 'grid', gap: 12 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 12, color: 'var(--text-md)', fontWeight: 600 }}>
                  Nom du scénario *
                </label>
                <input
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  placeholder="Ex: Scénario Optimiste 2026"
                  style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border)', padding: '10px 12px', fontSize: 13 }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 12, color: 'var(--text-md)', fontWeight: 600 }}>
                  Type *
                </label>
                <select
                  value={form.type}
                  onChange={(event) => setForm({ ...form, type: event.target.value as ScenarioTypeForm })}
                  style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border)', padding: '10px 12px', fontSize: 13 }}
                >
                  <option value="BASE">BASE</option>
                  <option value="OPTIMISTE">OPTIMISTE</option>
                  <option value="PESSIMISTE">PESSIMISTE</option>
                  <option value="STRESS_TEST">STRESS_TEST</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 12, color: 'var(--text-md)', fontWeight: 600 }}>
                  Budget de base *
                </label>
                <select
                  value={form.budget_id}
                  onChange={(event) => setForm({ ...form, budget_id: event.target.value })}
                  style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border)', padding: '10px 12px', fontSize: 13 }}
                >
                  <option value="">Sélectionner un budget approuvé</option>
                  {budgets.map((budget) => {
                    const amount = budget.lines.reduce((sum, line) => sum + (Number(line.amount_budget) || 0), 0);
                    return (
                      <option key={budget.id} value={budget.id}>
                        {`${budget.name} V${budget.version} — ${formatFCFA(amount)}`}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            {error ? <p style={{ marginTop: 12, color: 'var(--terra)', fontSize: 12 }}>{error}</p> : null}

            <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                onClick={() => setShowCreateModal(false)}
                style={{ borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', padding: '8px 16px', cursor: 'pointer' }}
                disabled={isCreating}
              >
                Annuler
              </button>
              <button
                onClick={handleCreate}
                style={{ borderRadius: 8, border: 'none', background: 'var(--terra)', color: '#fff', padding: '8px 16px', cursor: 'pointer', fontWeight: 600 }}
                disabled={isCreating}
              >
                {isCreating ? 'Création...' : 'Créer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
