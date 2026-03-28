import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import apiClient, { unwrapApiData } from '../../api/client';
import { usePeriodStore } from '../../stores/period.store';
import { formatFCFA } from '../../utils/currency';
import { emitAppError, emitAppNotification } from '../../utils/notifications';

// Clés agrégats SYSCOHADA — déjà affichées via les totaux, à exclure des lignes
const ACTIF_AGGREGAT_REFS = new Set(['AZ', 'BK', 'BT', 'BZ']);
const PASSIF_AGGREGAT_REFS = new Set(['CP', 'DF', 'DG', 'EK', 'TT', 'BZ_P']);

// Labels lisibles pour les refs SYSCOHADA Bilan
const BILAN_LABELS: Record<string, string> = {
  // Actif immobilisé
  AE: 'Frais de développement', AF: 'Brevets, licences, logiciels',
  AG: 'Fonds commercial', AH: 'Autres immo. incorporelles',
  AJ: 'Terrains', AK: 'Bâtiments', AL: 'Aménagements, agencements',
  AM: 'Matériel, mobilier', AN: 'Matériel de transport',
  AP: 'Avances sur immo.', AR: 'Titres de participation',
  AS: 'Autres immo. financières',
  // Actif circulant
  BB: 'Stocks et encours', BH: 'Fournisseurs, avances versées',
  BI: 'Clients', BJ: 'Autres créances',
  // Trésorerie actif
  BQ: 'Titres de placement', BR: 'Valeurs à encaisser', BS: 'Banques / Caisse',
  // Passif — Capitaux propres
  CA: 'Capital social', CB: 'Apporteurs non appelés',
  CD: 'Primes liées au capital', CE: 'Écarts de réévaluation',
  CF: 'Réserves indisponibles', CG: 'Réserves libres',
  CH: 'Report à nouveau', CI: 'Résultat net',
  CJ: "Subventions d'investissement", CK: 'Provisions réglementées',
  // Dettes financières
  DA: 'Emprunts et dettes fin.', DB: 'Dettes de location', DC: 'Provisions risques',
  // Passif circulant
  EB: 'Clients, avances reçues', EC: "Fournisseurs d'exploitation",
  ED: 'Dettes fiscales et sociales', EE: 'Autres dettes', EF: 'Provisions court terme',
  // Trésorerie passif
  TB_P: 'Banques, crédits escompte', TC_P: 'Banques, crédits trésorerie',
};

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

const reportRequestSchema = z.object({
  report_type: z.enum(['pl', 'balance_sheet', 'cash_flow', 'budget_variance', 'transactions', 'kpis']),
  format: z.enum(['pdf', 'excel']),
});

type ReportRequestValues = z.infer<typeof reportRequestSchema>;

type FinancialStatementsResponse = {
  is_data?: {
    lines: Record<string, string>;
    net_result: string;
    ebitda: string;
    revenue: string;
  };
  bs_data?: {
    actif: Record<string, string>;
    passif: Record<string, string>;
    is_balanced: boolean;
    balance_diff: string;
    total_actif: string;
    total_passif: string;
  };
  cf_data?: {
    lines: Record<string, string>;
    net_cash: string;
    cafg: string;
  };
};

export default function ReportsPage() {
  const { mode, currentPeriodId, quarterNumber, customFrom, customTo } = usePeriodStore();
  const [activeTab, setActiveTab] = useState<'reports' | 'preview-is' | 'preview-bs'>('reports');
  const [generating, setGenerating] = useState<string | null>(null);
  const [fsData, setFsData] = useState<FinancialStatementsResponse | null>(null);
  const [loadingFs, setLoadingFs] = useState(false);
  const [fsError, setFsError] = useState<string | null>(null);
  const { handleSubmit, setValue } = useForm<ReportRequestValues>({
    resolver: zodResolver(reportRequestSchema),
    defaultValues: {
      report_type: 'pl',
      format: 'pdf',
    },
  });

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

  const submitGenerate = handleSubmit(async (values) => {
    setGenerating(`${values.report_type}-${values.format}`);
    try {
      const res = await apiClient.post(
        '/reports/generate',
        { report_type: values.report_type, format: values.format, ...getPeriodParams() },
        { responseType: 'blob' },
      );

      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute(
        'download',
        `${values.report_type}_${new Date().toISOString().slice(0, 10)}.${values.format === 'pdf' ? 'pdf' : 'xlsx'}`,
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      emitAppNotification({ message: 'Rapport généré avec succès', severity: 'INFO' });
    } catch (err) {
      emitAppError('Erreur lors de la génération du rapport');
    } finally {
      setGenerating(null);
    }
  });

  function handleGenerate(type: string, format: 'pdf' | 'excel') {
    setValue('report_type', type as ReportRequestValues['report_type']);
    setValue('format', format);
    void submitGenerate();
  }

  useEffect(() => {
    if (activeTab === 'reports') {
      return;
    }

    // En mode single, une période doit être sélectionnée
    if (mode === 'single' && !currentPeriodId) {
      setFsData(null);
      setFsError('Sélectionnez une période pour afficher les états financiers.');
      return;
    }

    let cancelled = false;

    async function loadFinancialStatements() {
      setLoadingFs(true);
      setFsError(null);
      try {
        const response = await apiClient.get<FinancialStatementsResponse>('/dashboard/financial-statements', {
          params: getPeriodParams(),
        });
        if (!cancelled) {
          setFsData(unwrapApiData(response));
        }
      } catch (_error) {
        if (!cancelled) {
          setFsError('Impossible de charger les états financiers pour cette période.');
        }
      } finally {
        if (!cancelled) {
          setLoadingFs(false);
        }
      }
    }

    void loadFinancialStatements();

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, mode, currentPeriodId, quarterNumber, customFrom, customTo]);

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
          display: 'flex',
          gap: 10,
          marginBottom: 20,
          flexWrap: 'wrap',
        }}
      >
        {[
          { id: 'reports', label: 'Rapports' },
          { id: 'preview-is', label: 'Aperçu IS' },
          { id: 'preview-bs', label: 'Aperçu Bilan' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id as 'reports' | 'preview-is' | 'preview-bs')}
            style={{
              padding: '8px 14px',
              borderRadius: 999,
              border: '1px solid var(--border)',
              background: activeTab === tab.id ? 'var(--ink)' : 'var(--surface)',
              color: activeTab === tab.id ? 'white' : 'var(--text-hi)',
              fontWeight: 600,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'reports' && (
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
                  onClick={() => handleGenerate(report.id, 'pdf')}
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
                  onClick={() => handleGenerate(report.id, 'excel')}
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
      )}

      {activeTab !== 'reports' && (
        <div>
          {loadingFs && <p style={{ color: 'var(--text-md)' }}>Chargement des états financiers...</p>}
          {fsError && <p style={{ color: 'var(--terra)', fontWeight: 600 }}>{fsError}</p>}

          {!loadingFs && !fsError && activeTab === 'preview-is' && fsData?.is_data && (
            <div>
              <div
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 14,
                  padding: '24px',
                }}
              >
                <p
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: 'var(--text-lo)',
                    marginBottom: 16,
                  }}
                >
                  COMPTE DE RESULTAT SYSCOHADA
                </p>
                {[
                  { ref: 'XB', label: "Chiffre d'Affaires", color: 'var(--kola)' },
                  { ref: 'XC', label: 'Valeur Ajoutee', color: 'var(--indigo)' },
                  { ref: 'XD', label: 'EBE', color: 'var(--gold)' },
                  { ref: 'XE', label: "Resultat d'Exploitation", color: 'var(--terra)' },
                  { ref: 'XI', label: 'Resultat Net', color: 'var(--ink)', bold: true },
                ].map((item) => (
                  <div
                    key={item.ref}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '12px 0',
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: item.bold ? 700 : 500,
                        color: 'var(--text-hi)',
                      }}
                    >
                      <span
                        style={{
                          fontSize: 10,
                          color: 'var(--text-lo)',
                          marginRight: 8,
                          fontFamily: 'monospace',
                        }}
                      >
                        {item.ref}
                      </span>
                      {item.label}
                    </span>
                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: item.color,
                      }}
                    >
                      {formatFCFA(fsData.is_data?.lines?.[item.ref] ?? '0')}
                    </span>
                  </div>
                ))}
              </div>

              {fsData.bs_data && (
                <div
                  style={{
                    marginTop: 16,
                    padding: '12px 16px',
                    borderRadius: 10,
                    background: fsData.bs_data.is_balanced ? 'var(--kola-lt)' : 'var(--terra-lt)',
                    border: `1px solid ${fsData.bs_data.is_balanced ? 'var(--kola)' : 'var(--terra)'}`,
                    fontSize: 13,
                    fontWeight: 600,
                    color: fsData.bs_data.is_balanced ? 'var(--kola)' : 'var(--terra)',
                  }}
                >
                  {fsData.bs_data.is_balanced
                    ? 'Bilan equilibre - Actif = Passif'
                    : `Ecart bilan : ${formatFCFA(fsData.bs_data.balance_diff)}`}
                </div>
              )}
            </div>
          )}

          {!loadingFs && !fsError && activeTab === 'preview-bs' && fsData?.bs_data && (
            <div
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 14,
                padding: '24px',
              }}
            >
              <p
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: 'var(--text-lo)',
                  marginBottom: 16,
                }}
              >
                APERCU BILAN
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
                  <p style={{ fontWeight: 700, marginBottom: 10, color: 'var(--indigo)' }}>Actif</p>
                  {(() => {
                    const lines = Object.entries(fsData.bs_data.actif)
                      .filter(([ref, v]) => !ACTIF_AGGREGAT_REFS.has(ref) && Number(v) !== 0);
                    return lines.length === 0
                      ? <p style={{ fontSize: 12, color: 'var(--text-lo)', marginTop: 8 }}>Aucune immobilisation ni créance pour cette période.</p>
                      : lines.map(([ref, value]) => (
                          <div key={`a-${ref}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                            <span style={{ fontSize: 12, color: 'var(--text-md)' }}>
                              <span style={{ fontFamily: 'monospace', fontSize: 10, marginRight: 6 }}>{ref}</span>
                              {BILAN_LABELS[ref] ?? ''}
                            </span>
                            <span style={{ fontSize: 12, fontWeight: 600 }}>{formatFCFA(value)}</span>
                          </div>
                        ));
                  })()}
                </div>
                <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
                  <p style={{ fontWeight: 700, marginBottom: 10, color: 'var(--terra)' }}>Passif</p>
                  {(() => {
                    const lines = Object.entries(fsData.bs_data.passif)
                      .filter(([ref, v]) => !PASSIF_AGGREGAT_REFS.has(ref) && Number(v) !== 0);
                    return lines.length === 0
                      ? <p style={{ fontSize: 12, color: 'var(--text-lo)', marginTop: 8 }}>Aucune dette ni capitaux propres pour cette période.</p>
                      : lines.map(([ref, value]) => (
                          <div key={`p-${ref}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                            <span style={{ fontSize: 12, color: 'var(--text-md)' }}>
                              <span style={{ fontFamily: 'monospace', fontSize: 10, marginRight: 6 }}>{ref}</span>
                              {BILAN_LABELS[ref] ?? ''}
                            </span>
                            <span style={{ fontSize: 12, fontWeight: 600 }}>{formatFCFA(value)}</span>
                          </div>
                        ));
                  })()}
                </div>
              </div>

              <div style={{ marginTop: 16, display: 'flex', gap: 16 }}>
                <div style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--sand)' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-md)' }}>Total Actif: </span>
                  <span style={{ fontWeight: 700 }}>{formatFCFA(fsData.bs_data.total_actif)}</span>
                </div>
                <div style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--sand)' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-md)' }}>Total Passif: </span>
                  <span style={{ fontWeight: 700 }}>{formatFCFA(fsData.bs_data.total_passif)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
