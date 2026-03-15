import { create } from 'zustand';

interface OrgState {
  orgId: string | null;
  orgName: string | null;
  currency: string;
  currentPeriod: string | null;
  fiscalYearId: string | null;
  setOrg: (org: Partial<OrgState>) => void;
  reset: () => void;
}

const initialState = {
  orgId: null,
  orgName: null,
  currency: 'XOF',
  currentPeriod: null,
  fiscalYearId: null,
};

export const useOrgStore = create<OrgState>((set) => ({
  ...initialState,
  setOrg: (org: Partial<OrgState>) => set((state) => ({ ...state, ...org })),
  reset: () => set(initialState),
}));
