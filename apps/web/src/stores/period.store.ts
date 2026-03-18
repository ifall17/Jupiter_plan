import { create } from 'zustand';

interface Period {
  id: string;
  label: string;
  status: string;
}

type PeriodMode = 'single' | 'ytd' | 'quarter' | 'custom';

interface PeriodStore {
  currentPeriod: Period | null;
  currentPeriodId: string;
  mode: PeriodMode;
  quarterNumber: number | null;
  customFrom: string | null;
  customTo: string | null;
  setPeriod: (period: Period) => void;
  setYTD: () => void;
  setQuarter: (q: number) => void;
  setCustomRange: (from: string, to: string) => void;
  getLabel: () => string;
}

export const usePeriodStore = create<PeriodStore>((set, get) => ({
  currentPeriod: null,
  currentPeriodId: '',
  mode: 'ytd',
  quarterNumber: null,
  customFrom: null,
  customTo: null,
  setPeriod: (period) =>
    set({
      currentPeriod: period,
      currentPeriodId: period.id,
      mode: 'single',
      quarterNumber: null,
      customFrom: null,
      customTo: null,
    }),
  setYTD: () =>
    set({
      mode: 'ytd',
      quarterNumber: null,
      customFrom: null,
      customTo: null,
    }),
  setQuarter: (q) =>
    set({
      mode: 'quarter',
      quarterNumber: q,
      customFrom: null,
      customTo: null,
    }),
  setCustomRange: (from, to) =>
    set({
      mode: 'custom',
      quarterNumber: null,
      customFrom: from,
      customTo: to,
    }),
  getLabel: () => {
    const { mode, quarterNumber, customFrom, customTo, currentPeriod } = get();
    const month = new Date().toLocaleDateString('fr-FR', { month: 'short' });
    if (mode === 'ytd') return `YTD Jan -> ${month}`;
    if (mode === 'quarter') return `T${quarterNumber}`;
    if (mode === 'custom' && customFrom && customTo) return 'Plage personnalisee';
    return currentPeriod?.label ?? 'Periode';
  },
}));
