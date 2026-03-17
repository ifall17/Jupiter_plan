import { create } from 'zustand';

interface Period {
  id: string;
  label: string;
  status: string;
}

interface PeriodStore {
  currentPeriod: Period | null;
  currentPeriodId: string;
  isYTD: boolean;
  setPeriod: (period: Period) => void;
  setYTD: (value: boolean) => void;
}

export const usePeriodStore = create<PeriodStore>((set) => ({
  currentPeriod: null,
  currentPeriodId: '',
  isYTD: false,
  setPeriod: (period) =>
    set({
      currentPeriod: period,
      currentPeriodId: period.id,
      isYTD: false,
    }),
  setYTD: (value) => set({ isYTD: value }),
}));
