import { formatFCFA } from '../../../utils/currency';

interface VarianceItem {
  line_label: string;
  budgeted: number;
  actual: number;
  variance_pct: number;
}

interface VarianceTableProps {
  variance_pct: Array<VarianceItem>;
}

export default function VarianceTable({ variance_pct }: VarianceTableProps) {
  if (!Array.isArray(variance_pct) || variance_pct.length === 0) {
    return (
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '14px',
          padding: '20px 22px',
          marginBottom: '24px',
          color: 'var(--text-md)',
          fontSize: '13px',
        }}
      >
        Variance vs Budget de référence indisponible pour cette période.
      </div>
    );
  }

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '14px',
        padding: '20px 22px',
        marginBottom: '24px',
      }}
    >
      <h3
        style={{
          fontSize: '13px',
          fontWeight: 600,
          marginTop: 0,
          marginBottom: '16px',
          color: 'var(--text-hi)',
        }}
      >
        Variance vs Budget de référence
      </h3>
      <div
        style={{
          overflowX: 'auto',
        }}
      >
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '13px',
          }}
        >
          <thead>
            <tr
              style={{
                borderBottom: '1px solid var(--border)',
              }}
            >
              <th
                style={{
                  textAlign: 'left',
                  padding: '8px 0',
                  color: 'var(--text-lo)',
                  fontWeight: 600,
                  fontSize: '11px',
                }}
              >
                Ligne
              </th>
              <th
                style={{
                  textAlign: 'right',
                  padding: '8px 0',
                  color: 'var(--text-lo)',
                  fontWeight: 600,
                  fontSize: '11px',
                }}
              >
                Budgété
              </th>
              <th
                style={{
                  textAlign: 'right',
                  padding: '8px 0',
                  color: 'var(--text-lo)',
                  fontWeight: 600,
                  fontSize: '11px',
                }}
              >
                Réalisé
              </th>
              <th
                style={{
                  textAlign: 'right',
                  padding: '8px 0',
                  color: 'var(--text-lo)',
                  fontWeight: 600,
                  fontSize: '11px',
                }}
              >
                Variance
              </th>
            </tr>
          </thead>
          <tbody>
            {variance_pct.map((item, idx) => (
              <tr
                key={idx}
                style={{
                  borderBottom:
                    idx < variance_pct.length - 1
                      ? '1px solid var(--border)'
                      : 'none',
                }}
              >
                <td
                  style={{
                    padding: '10px 0',
                    color: 'var(--text-hi)',
                  }}
                >
                  {item.line_label}
                </td>
                <td
                  style={{
                    textAlign: 'right',
                    padding: '10px 0',
                    color: 'var(--text-md)',
                  }}
                >
                  {formatFCFA(item.budgeted)}
                </td>
                <td
                  style={{
                    textAlign: 'right',
                    padding: '10px 0',
                    color: 'var(--text-md)',
                  }}
                >
                  {formatFCFA(item.actual)}
                </td>
                <td
                  style={{
                    textAlign: 'right',
                    padding: '10px 0',
                    fontWeight: 600,
                    color:
                      item.variance_pct > 0
                        ? 'var(--terra)'
                        : 'var(--kola)',
                  }}
                >
                  {item.variance_pct > 0 ? '+' : ''}
                  {item.variance_pct.toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
