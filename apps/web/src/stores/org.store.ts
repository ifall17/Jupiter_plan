import { create } from 'zustand';

interface OrgState {
  orgId: string | null;
  orgName: string | null;
  currency: string;
  currentPeriod: string | null;
  currentPeriodLabel: string | null;
  fiscalYearId: string | null;
  fiscalYearLabel: string | null;
  setOrg: (org: Partial<OrgState>) => void;
  reset: () => void;
}

const initialState = {
  orgId: null,
  orgName: null,
  currency: 'XOF',
  currentPeriod: null,
  currentPeriodLabel: null,
  fiscalYearId: null,
  fiscalYearLabel: null,
};

export const useOrgStore = create<OrgState>((set) => ({
  ...initialState,
  setOrg: (org: Partial<OrgState>) => set((state) => ({ ...state, ...org })),
  reset: () => set(initialState),
}));
