import { useState } from 'react';
import { apiClient } from '../../api/client';
import { usePeriodStore } from '../../stores/period.store';

const REPORTS = [
  {
    id: 'pl',
    icon: '📊',
    title: 'Compte de Résultat',
    description: 'Revenus, charges, EBITDA et résultat net',
    color: 'terra',
  },
  {
    id: 'balance_sheet',
    icon: '⚖️',
    title: 'Bilan Comptable',
    description: 'Actif, passif et capitaux propres',
    color: 'indigo',
  },
  {
    id: 'cash_flow',
    icon: '💰',
    title: 'Plan de Trésorerie',
    description: 'Flux entrants, sortants et runway',
    color: 'kola',
  },
  {
    id: 'budget_variance',
    icon: '📈',
    title: 'Rapport Budget vs Réel',
    description: 'Variance par ligne et département',
    color: 'gold',
  },
  {
    id: 'transactions',
    icon: '📋',
    title: 'Journal des Transactions',
    description: 'Toutes les transactions de la période',
    color: 'indigo',
  },
  {
    id: 'kpis',
    icon: '🎯',
    title: 'Tableau de Bord KPIs',
    description: 'Indicateurs clés et alertes',
    color: 'terra',
  },
];

export default function ReportsPage() {
  const { mode, currentPeriodId, quarterNumber, customFrom, customTo } = usePeriodStore();
  const [generating, setGenerating] = useState<string | null>(null);

  function getPeriodParams() {
    switch (mode) {
      case 'ytd':
        return { ytd: true };
      case 'quarter':
        return { quarter: quarterNumber };
      case 'custom':
        return { from_period: customFrom, to_period: customTo };
      default:
        return { period_id: currentPeriodId };
    }
  }

  async function handleGenerate(type: string, format: 'pdf' | 'excel') {
    setGenerating(`${type}-${format}`);
    try {
      const res = await apiClient.post(
        '/reports/generate',
        { report_type: type, format, ...getPeriodParams() },
        { responseType: 'blob' },
      );

      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute(
        'download',
        `${type}_${new Date().toISOString().slice(0, 10)}.${format === 'pdf' ? 'pdf' : 'xlsx'}`,
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Erreur génération rapport:', err);
      alert('Erreur lors de la génération du rapport');
    } finally {
      setGenerating(null);
    }
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1360, margin: '0 auto' }}>
      <div style={{ marginBottom: 32 }}>
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
          RAPPORTS
        </p>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 28, color: 'var(--ink)' }}>
          Rapports &amp; Exports
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-md)', marginTop: 5 }}>
          Générez vos états financiers en PDF ou Excel
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 20,
        }}
      >
        {REPORTS.map((report) => (
          <div
            key={report.id}
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 16,
              padding: '24px 28px',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  background: `var(--${report.color}-lt)`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 22,
                  flexShrink: 0,
                }}
              >
                {report.icon}
              </div>
              <div>
                <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-hi)', marginBottom: 3 }}>
                  {report.title}
                </p>
                <p style={{ fontSize: 12, color: 'var(--text-md)' }}>{report.description}</p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button
                type="button"
                onClick={() => void handleGenerate(report.id, 'pdf')}
                disabled={!!generating}
                style={{
                  flex: 1,
                  padding: '9px 16px',
                  background: generating === `${report.id}-pdf` ? 'var(--text-lo)' : 'var(--terra)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  cursor: generating ? 'not-allowed' : 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                {generating === `${report.id}-pdf` ? '⏳ Génération...' : '📄 Télécharger PDF'}
              </button>

              <button
                type="button"
                onClick={() => void handleGenerate(report.id, 'excel')}
                disabled={!!generating}
                style={{
                  flex: 1,
                  padding: '9px 16px',
                  background: generating === `${report.id}-excel` ? 'var(--text-lo)' : 'var(--kola)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  cursor: generating ? 'not-allowed' : 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                {generating === `${report.id}-excel` ? '⏳ Génération...' : '📊 Télécharger Excel'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
