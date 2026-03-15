import { useOrgStore } from '../stores/org.store';

export function useOrg() {
  const orgId = useOrgStore((state) => state.orgId);
  const orgName = useOrgStore((state) => state.orgName);
  const currency = useOrgStore((state) => state.currency);
  const currentPeriod = useOrgStore((state) => state.currentPeriod);
  const fiscalYearId = useOrgStore((state) => state.fiscalYearId);
  const setOrg = useOrgStore((state) => state.setOrg);
  const reset = useOrgStore((state) => state.reset);

  return {
    orgId,
    orgName,
    currency,
    currentPeriod,
    fiscalYearId,
    setOrg,
    reset,
  };
}
