import { useOrgStore } from './org.store';

describe('org.store', () => {
  it('sets partial org info and keeps existing keys', () => {
    useOrgStore.getState().setOrg({ orgId: 'org-1', orgName: 'Org One' });
    useOrgStore.getState().setOrg({ currency: 'EUR' });

    expect(useOrgStore.getState()).toMatchObject({
      orgId: 'org-1',
      orgName: 'Org One',
      currency: 'EUR',
    });
  });

  it('resets to safe initial defaults', () => {
    useOrgStore.getState().setOrg({
      orgId: 'org-2',
      orgName: 'Org Two',
      currentPeriod: 'p1',
      currentPeriodLabel: 'P01 Janvier',
      fiscalYearId: 'fy-2025',
      fiscalYearLabel: 'FY2025',
    });

    useOrgStore.getState().reset();

    expect(useOrgStore.getState()).toMatchObject({
      orgId: null,
      orgName: null,
      currency: 'XOF',
      currentPeriod: null,
      currentPeriodLabel: null,
      fiscalYearId: null,
      fiscalYearLabel: null,
    });
  });
});
