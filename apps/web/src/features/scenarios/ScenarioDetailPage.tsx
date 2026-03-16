import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { UserRole } from '@web/shared/enums';
import apiClient, { unwrapApiData } from '../../api/client';
import { useAuthStore } from '../../stores/auth.store';
import { formatFCFA } from '../../utils/currency';
import CommentSection from '../../components/comments/CommentSection';

type ScenarioHypothesis = {
  id: string;
  label: string;
  parameter: string;
  value: string;
  unit: '%' | 'FCFA' | 'multiplier';
};

type ScenarioSnapshot = {
  id: string;
  is_revenue: string;
  is_expenses: string;
  is_ebitda: string;
  is_net: string;
  bs_assets: string;
  bs_liabilities: string;
  bs_equity: string;
  cf_operating: string;
  cf_investing: string;
  cf_financing: string;
  calculated_at: string;
};

type ScenarioDetail = {
  id: string;
  name: string;
  type: 'BASE' | 'OPTIMISTE' | 'PESSIMISTE' | 'CUSTOM';
  status: 'DRAFT' | 'CALCULATING' | 'CALCULATED' | 'SAVED';
  budget_id: string;
  hypotheses: ScenarioHypothesis[] | null;
  snapshot: ScenarioSnapshot | null;
  created_at: string;
};

type Budget = {
  id: string;
  name: string;
  version: number;
  lines: Array<{ amount_budget: string }>;
};

type PaginatedBudgets = { data: Budget[]; total: number; page: number; limit: number; totalPages: number };

type HypothesisFormState = {
  label: string;
  parameter: string;
  value: string;
  unit: '%' | 'FCFA' | 'multiplier';
};

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  DRAFT: { bg: 'var(--surface2)', color: 'var(--text-md)' },
  CALCULATING: { bg: 'var(--gold-lt)', color: 'var(--gold)' },
  CALCULATED: { bg: 'var(--indigo-lt)', color: 'var(--indigo)' },
  SAVED: { bg: 'var(--kola-lt)', color: 'var(--kola)' },
};

export default function ScenarioDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const role = useAuthStore((state) => state.user?.role);
  const canEditHypothesis = role === UserRole.SUPER_ADMIN || role === UserRole.FPA;

  const [showHypothesisModal, setShowHypothesisModal] = useState(false);
  const [editingHypothesisId, setEditingHypothesisId] = useState<string | null>(null);
  const [lastHypothesisAction, setLastHypothesisAction] = useState<'create' | 'edit' | 'delete' | null>(null);
  const [hypothesisForm, setHypothesisForm] = useState<HypothesisFormState>({
    label: '',
    parameter: 'revenue_growth',
    value: '',
    unit: '%',
  });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const scenarioQuery = useQuery({
    queryKey: ['scenario', id],
    enabled: Boolean(id),
    refetchInterval: (query) => {
      const status = (query.state.data as ScenarioDetail | undefined)?.status;
      return status === 'CALCULATING' ? 2000 : false;
    },
    queryFn: () => apiClient.get<ScenarioDetail>(`/scenarios/${id}`).then(unwrapApiData),
  });

  const budgetsQuery = useQuery({
    queryKey: ['budgets-approved'],
    queryFn: () => apiClient.get<PaginatedBudgets>('/budgets', { params: { status: 'APPROVED', limit: 100 } }).then(unwrapApiData),
  });

  const scenario = scenarioQuery.data;
  const budget = useMemo(
    () => budgetsQuery.data?.data.find((item) => item.id === scenario?.budget_id) ?? null,
    [budgetsQuery.data?.data, scenario?.budget_id],
  );

  const upsertHypothesisMutation = useMutation({
    mutationFn: async (payload: { hypotheses: Array<{ label: string; parameter: string; value: string; unit: string }> }) => {
      return apiClient.put(`/scenarios/${id}/hypotheses`, payload).then(unwrapApiData);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['scenario', id] });
      setShowHypothesisModal(false);
      setEditingHypothesisId(null);
      setHypothesisForm({ label: '', parameter: 'revenue_growth', value: '', unit: '%' });
      setError('');
      setNotice(
        lastHypothesisAction === 'delete'
          ? 'Hypothèse supprimée.'
          : lastHypothesisAction === 'edit'
            ? 'Hypothèse mise à jour.'
            : 'Hypothèse ajoutée.',
      );
      setLastHypothesisAction(null);
    },
    onError: (err: any) => setError(err.response?.data?.message ?? 'Erreur lors de l ajout de l hypothèse'),
  });

  const calculateMutation = useMutation({
    mutationFn: async () => apiClient.post(`/scenarios/${id}/calculate`, {}).then(unwrapApiData),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['scenario', id] });
    },
    onError: (err: any) => {
      const code = err.response?.data?.code;
      if (code === 'SCENARIO_NOT_EDITABLE') {
        setError('Le scénario doit être en brouillon (DRAFT) pour lancer le calcul.');
        return;
      }
      setError(err.response?.data?.message ?? 'Erreur lors du calcul du scénario');
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => apiClient.post(`/scenarios/${id}/save`, {}).then(unwrapApiData),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['scenario', id] });
      await queryClient.invalidateQueries({ queryKey: ['scenarios'] });
    },
    onError: (err: any) => {
      setError(err.response?.data?.message ?? 'Erreur lors de la sauvegarde du scénario');
    },
  });

  const deleteScenarioMutation = useMutation({
    mutationFn: async () => apiClient.delete(`/scenarios/${id}`).then(unwrapApiData),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['scenarios'] });
      navigate('/scenarios');
    },
    onError: (err: any) => {
      const code = err.response?.data?.code;
      if (code === 'SCENARIO_LOCKED') {
        setError('Ce scénario est verrouillé car référencé dans un rapport exporté.');
        return;
      }
      setError(err.response?.data?.message ?? 'Erreur lors de la suppression du scénario');
    },
  });

  const scenarioTypeLabel =
    scenario?.type === 'OPTIMISTE'
      ? 'Optimiste'
      : scenario?.type === 'PESSIMISTE'
      ? 'Pessimiste'
      : scenario?.type === 'CUSTOM'
      ? 'Stress test'
      : 'Base';

  if (scenarioQuery.isLoading) {
    return <div className="dashboard-page"><div style={{ padding: 40, textAlign: 'center' }}>Chargement...</div></div>;
  }

  if (!scenario) {
    return (
      <div className="dashboard-page">
        <div style={{ padding: 24, border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)' }}>
          Scénario introuvable.
        </div>
      </div>
    );
  }

  const statusStyle = STATUS_STYLE[scenario.status] ?? STATUS_STYLE.DRAFT;
  const hypotheses = scenario.hypotheses ?? [];

  const toPayloadList = (list: Array<{ label: string; parameter: string; value: string; unit: string }>) => ({
    hypotheses: list.map((item) => ({
      label: item.label,
      parameter: item.parameter,
      value: item.value,
      unit: item.unit,
    })),
  });

  const openCreateHypothesisModal = () => {
    setNotice('');
    setEditingHypothesisId(null);
    setHypothesisForm({ label: '', parameter: 'revenue_growth', value: '', unit: '%' });
    setError('');
    setShowHypothesisModal(true);
  };

  const openEditHypothesisModal = (hypothesis: ScenarioHypothesis) => {
    setNotice('');
    setEditingHypothesisId(hypothesis.id);
    setHypothesisForm({
      label: hypothesis.label,
      parameter: hypothesis.parameter,
      value: hypothesis.value,
      unit: hypothesis.unit,
    });
    setError('');
    setShowHypothesisModal(true);
  };

  const handleDeleteHypothesis = (hypothesisId: string) => {
    const target = hypotheses.find((item) => item.id === hypothesisId);
    const confirmed = window.confirm(`Supprimer l'hypothèse "${target?.label ?? ''}" ?`);
    if (!confirmed) {
      return;
    }

    setNotice('');
    const nextList = hypotheses
      .filter((item) => item.id !== hypothesisId)
      .map((item) => ({
        label: item.label,
        parameter: item.parameter,
        value: item.value,
        unit: item.unit,
      }));

    setError('');
    setLastHypothesisAction('delete');
    upsertHypothesisMutation.mutate(toPayloadList(nextList));
  };

  return (
    <div className="dashboard-page" style={{ display: 'grid', gap: 16 }}>
      <div className="page-head" style={{ alignItems: 'center' }}>
        <div>
          <p className="page-eyebrow">SCÉNARIO</p>
          <h1 className="page-title">{scenario.name}</h1>
          <p className="page-sub">Type : {scenarioTypeLabel} · Budget de base : {budget?.name ?? scenario.budget_id}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: statusStyle.bg, color: statusStyle.color }}>
            {scenario.status}
          </span>
          {canEditHypothesis ? (
            <button
              onClick={() => {
                const confirmed = window.confirm(`Supprimer le scénario "${scenario.name}" ? Cette action est irréversible.`);
                if (!confirmed) {
                  return;
                }

                setError('');
                setNotice('');
                deleteScenarioMutation.mutate();
              }}
              disabled={deleteScenarioMutation.isPending}
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                border: '1px solid var(--terra)',
                background: 'transparent',
                color: 'var(--terra)',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              {deleteScenarioMutation.isPending ? 'Suppression...' : 'Supprimer le scénario'}
            </button>
          ) : null}
          <button
            onClick={() => navigate('/scenarios')}
            style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer' }}
          >
            Retour
          </button>
        </div>
      </div>

      {canEditHypothesis ? (
        <section style={{ border: '1px solid var(--border)', borderRadius: 14, background: 'var(--surface)', padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 16, color: 'var(--text-hi)' }}>Hypothèses</h3>
            <button
              onClick={openCreateHypothesisModal}
              style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--terra)', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 12 }}
            >
              + Ajouter une hypothèse
            </button>
          </div>

          {hypotheses.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-md)', margin: 0 }}>Aucune hypothèse pour ce scénario.</p>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {hypotheses.map((hypothesis) => (
                <details key={hypothesis.id} style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface2)' }}>
                  <summary
                    style={{
                      listStyle: 'none',
                      cursor: 'pointer',
                      padding: '10px 12px',
                      display: 'grid',
                      gridTemplateColumns: '2fr 2fr 1fr auto',
                      gap: 8,
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{hypothesis.label}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-md)' }}>{hypothesis.parameter}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-hi)', textAlign: 'right' }}>{hypothesis.value} {hypothesis.unit}</span>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button
                        onClick={(event) => {
                          event.preventDefault();
                          openEditHypothesisModal(hypothesis);
                        }}
                        style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}
                        disabled={upsertHypothesisMutation.isPending}
                      >
                        Éditer
                      </button>
                      <button
                        onClick={(event) => {
                          event.preventDefault();
                          handleDeleteHypothesis(hypothesis.id);
                        }}
                        style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--terra)', background: 'transparent', color: 'var(--terra)', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}
                        disabled={upsertHypothesisMutation.isPending}
                      >
                        Supprimer
                      </button>
                    </div>
                  </summary>
                  <div style={{ padding: '0 12px 12px' }}>
                    <CommentSection
                      entityType="HYPOTHESIS"
                      entityId={hypothesis.id}
                      title="Discussion"
                    />
                  </div>
                </details>
              ))}
            </div>
          )}

          {notice ? <p style={{ marginTop: 10, color: 'var(--kola)', fontSize: 12 }}>{notice}</p> : null}
        </section>
      ) : null}

      <section style={{ border: '1px solid var(--border)', borderRadius: 14, background: 'var(--surface)', padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
          <h3 style={{ margin: 0, fontSize: 16, color: 'var(--text-hi)' }}>Calcul</h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {scenario.status === 'DRAFT' && canEditHypothesis ? (
              <button
                onClick={() => {
                  setError('');
                  calculateMutation.mutate();
                }}
                disabled={calculateMutation.isPending}
                style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--indigo)', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 12 }}
              >
                {calculateMutation.isPending ? 'Calcul en cours...' : 'Calculer'}
              </button>
            ) : null}

            {scenario.status === 'CALCULATED' && canEditHypothesis ? (
              <button
                onClick={() => {
                  setError('');
                  saveMutation.mutate();
                }}
                disabled={saveMutation.isPending}
                style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--kola)', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 12 }}
              >
                {saveMutation.isPending ? 'Sauvegarde...' : 'Sauvegarder'}
              </button>
            ) : null}
          </div>
        </div>

        {error ? <p style={{ marginBottom: 12, color: 'var(--terra)', fontSize: 12 }}>{error}</p> : null}

        {scenario.status === 'CALCULATING' ? (
          <p style={{ fontSize: 13, color: 'var(--text-md)', margin: 0 }}>Calcul en cours... actualisation automatique.</p>
        ) : null}

        {scenario.snapshot ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <tr>
                  <td style={{ padding: '9px 10px', borderBottom: '1px solid var(--border)', fontSize: 13 }}>Chiffre d'affaires</td>
                  <td style={{ padding: '9px 10px', borderBottom: '1px solid var(--border)', fontSize: 13, textAlign: 'right', fontWeight: 700 }}>{formatFCFA(scenario.snapshot.is_revenue)}</td>
                </tr>
                <tr>
                  <td style={{ padding: '9px 10px', borderBottom: '1px solid var(--border)', fontSize: 13 }}>Charges totales</td>
                  <td style={{ padding: '9px 10px', borderBottom: '1px solid var(--border)', fontSize: 13, textAlign: 'right', fontWeight: 700 }}>{formatFCFA(scenario.snapshot.is_expenses)}</td>
                </tr>
                <tr>
                  <td style={{ padding: '9px 10px', borderBottom: '1px solid var(--border)', fontSize: 13 }}>EBITDA</td>
                  <td style={{ padding: '9px 10px', borderBottom: '1px solid var(--border)', fontSize: 13, textAlign: 'right', fontWeight: 700 }}>{formatFCFA(scenario.snapshot.is_ebitda)}</td>
                </tr>
                <tr>
                  <td style={{ padding: '9px 10px', fontSize: 13 }}>Résultat net</td>
                  <td style={{ padding: '9px 10px', fontSize: 13, textAlign: 'right', fontWeight: 700 }}>{formatFCFA(scenario.snapshot.is_net)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <p style={{ fontSize: 13, color: 'var(--text-md)', margin: 0 }}>Aucun résultat disponible pour ce scénario.</p>
        )}
      </section>

      {showHypothesisModal ? (
        <div
          onClick={() => setShowHypothesisModal(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(26,26,46,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 260, padding: 20 }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{ width: 'min(100%, 560px)', borderRadius: 14, border: '1px solid var(--border)', background: 'var(--surface)', boxShadow: 'var(--shadow-md)', padding: 20 }}
          >
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>
              {editingHypothesisId ? 'Éditer une hypothèse' : 'Ajouter une hypothèse'}
            </h3>
            <div style={{ display: 'grid', gap: 10 }}>
              <input
                placeholder="Label"
                value={hypothesisForm.label}
                onChange={(event) => setHypothesisForm({ ...hypothesisForm, label: event.target.value })}
                style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border)', padding: '10px 12px', fontSize: 13 }}
              />
              <select
                value={hypothesisForm.parameter}
                onChange={(event) => setHypothesisForm({ ...hypothesisForm, parameter: event.target.value })}
                style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border)', padding: '10px 12px', fontSize: 13 }}
              >
                <option value="revenue_growth">revenue_growth</option>
                <option value="cost_reduction">cost_reduction</option>
                <option value="capex_increase">capex_increase</option>
              </select>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
                <input
                  placeholder="Valeur"
                  value={hypothesisForm.value}
                  onChange={(event) => setHypothesisForm({ ...hypothesisForm, value: event.target.value })}
                  style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border)', padding: '10px 12px', fontSize: 13 }}
                />
                <select
                  value={hypothesisForm.unit}
                  onChange={(event) => setHypothesisForm({ ...hypothesisForm, unit: event.target.value as HypothesisFormState['unit'] })}
                  style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border)', padding: '10px 12px', fontSize: 13 }}
                >
                  <option value="%">%</option>
                  <option value="FCFA">FCFA</option>
                  <option value="multiplier">multiplier</option>
                </select>
              </div>
            </div>

            {error ? <p style={{ marginTop: 10, color: 'var(--terra)', fontSize: 12 }}>{error}</p> : null}

            <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={() => setShowHypothesisModal(false)}
                style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer' }}
                disabled={upsertHypothesisMutation.isPending}
              >
                Annuler
              </button>
              <button
                onClick={() => {
                  if (!hypothesisForm.label.trim() || !hypothesisForm.value.trim()) {
                    setError('Label et valeur sont obligatoires');
                    return;
                  }

                  const existing = hypotheses.map((item) => ({
                    label: item.label,
                    parameter: item.parameter,
                    value: item.value,
                    unit: item.unit,
                  }));

                  const newItem = {
                    label: hypothesisForm.label.trim(),
                    parameter: hypothesisForm.parameter,
                    value: hypothesisForm.value.trim(),
                    unit: hypothesisForm.unit,
                  };

                  const newList = editingHypothesisId
                    ? hypotheses.map((item) =>
                        item.id === editingHypothesisId
                          ? newItem
                          : {
                              label: item.label,
                              parameter: item.parameter,
                              value: item.value,
                              unit: item.unit,
                            },
                      )
                    : [...existing, newItem];

                  setError('');
                  setLastHypothesisAction(editingHypothesisId ? 'edit' : 'create');
                  upsertHypothesisMutation.mutate(toPayloadList(newList));
                }}
                style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--terra)', color: '#fff', cursor: 'pointer', fontWeight: 600 }}
                disabled={upsertHypothesisMutation.isPending}
              >
                {upsertHypothesisMutation.isPending
                  ? editingHypothesisId
                    ? 'Mise à jour...'
                    : 'Ajout...'
                  : editingHypothesisId
                  ? 'Mettre à jour'
                  : 'Ajouter'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <CommentSection
        entityType="SCENARIO"
        entityId={scenario.id}
        title="Commentaires sur ce scénario"
      />
    </div>
  );
}
