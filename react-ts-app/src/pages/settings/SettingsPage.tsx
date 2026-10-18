import { useMemo, useState } from 'react';
import { AttributesTabContent } from './AttributesTabContent';
import { CustomObjectsPage } from './CustomObjectsPage';
import { GlobalConfigSection } from './GlobalConfigSection';
import { ORGANIZATION_ATTRIBUTES } from './organizationAttributes';
import { ACCOUNT_ATTRIBUTES } from './accountAttributes';
import { CONTACT_ATTRIBUTES } from './contactAttributes';
import { OPPORTUNITY_ATTRIBUTES, RISK_ATTRIBUTES } from './pipelineAttributes';
import { apiFetch, fetchAllPages } from '../../lib/apiClient';
import { useAllEntities } from '../../hooks/useAllEntities';
import { SegmentedControl, SettingsFrame, Tabs, tabId, tabPanelId } from '../../components/ui';
import { settingsTitle } from './workspaceSettingsNav';
import type { AttributeDef } from './attributeConfig';
import type { Customer, Account, Contact, Opportunity, Risk } from '../../features/customers/customersSlice';

function filterAttributes<T>(attributes: AttributeDef<T>[], query: string): AttributeDef<T>[] {
  const q = query.trim().toLowerCase();
  if (!q) return attributes;
  return attributes.filter(
    (a) => a.displayName.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)
  );
}

type AttributeTab = 'organization' | 'account' | 'contact' | 'pipeline' | 'objects';
const TABS: { key: AttributeTab; label: string }[] = [
  { key: 'organization', label: 'Organization' },
  { key: 'account', label: 'Account' },
  { key: 'contact', label: 'Contact' },
  { key: 'pipeline', label: 'Pipeline' },
  { key: 'objects', label: 'Custom objects' },
];
const PIPELINE = [
  { value: 'Opportunities', label: 'Opportunities' },
  { value: 'Risks', label: 'Risks' },
] as const;
const ID = 'attributes';

export function SettingsPage() {
  const [activeSubTab, setActiveSubTab] = useState<AttributeTab>('organization');
  const [pipelineEntity, setPipelineEntity] = useState<'Opportunities' | 'Risks'>('Opportunities');
  const [searchQuery, setSearchQuery] = useState('');

  const { entities: organizations, isLoading: orgLoading, error: orgError } =
    useAllEntities<Customer>(() => fetchAllPages('/customers/'), 'organization', activeSubTab === 'organization');
  const { entities: accounts, isLoading: accountLoading, error: accountError } =
    useAllEntities<Account>(() => fetchAllPages('/accounts/'), 'account', activeSubTab === 'account');
  const { entities: contacts, isLoading: contactLoading, error: contactError } =
    useAllEntities<Contact>(() => fetchAllPages('/contacts/'), 'contact', activeSubTab === 'contact');
  const { entities: opportunities, isLoading: opportunityLoading, error: opportunityError } =
    useAllEntities<Opportunity>(
      () => apiFetch<Opportunity[]>('/opportunities/'),
      'opportunity',
      activeSubTab === 'pipeline' && pipelineEntity === 'Opportunities'
    );
  const { entities: risks, isLoading: riskLoading, error: riskError } =
    useAllEntities<Risk>(
      () => apiFetch<Risk[]>('/risks/'),
      'risk',
      activeSubTab === 'pipeline' && pipelineEntity === 'Risks'
    );

  const filteredOrgAttributes = useMemo(
    () => filterAttributes(ORGANIZATION_ATTRIBUTES, searchQuery),
    [searchQuery]
  );
  const filteredAccountAttributes = useMemo(
    () => filterAttributes(ACCOUNT_ATTRIBUTES, searchQuery),
    [searchQuery]
  );
  const filteredContactAttributes = useMemo(
    () => filterAttributes(CONTACT_ATTRIBUTES, searchQuery),
    [searchQuery]
  );
  const filteredOpportunityAttributes = useMemo(
    () => filterAttributes(OPPORTUNITY_ATTRIBUTES, searchQuery),
    [searchQuery]
  );
  const filteredRiskAttributes = useMemo(
    () => filterAttributes(RISK_ATTRIBUTES, searchQuery),
    [searchQuery]
  );

  const pipelineSwitch = (
    <SegmentedControl label="Pipeline records" options={PIPELINE} value={pipelineEntity} onChange={setPipelineEntity} />
  );
  return (
    <SettingsFrame
      title={settingsTitle('/settings/data')}
      intro="The fields every organization, account, contact and pipeline record carries, and how full each one is."
    >
      <div className="h-11 border-b border-line-subtle">
        <Tabs label="Attribute sets" idBase={ID} items={TABS} value={activeSubTab} onChange={setActiveSubTab} />
      </div>
      <div role="tabpanel" id={tabPanelId(ID, activeSubTab)} aria-labelledby={tabId(ID, activeSubTab)} className="flex flex-col gap-6">
        {activeSubTab === 'organization' ? (
          <AttributesTabContent
            key="organization"
            entityLabel="organization"
            attributes={filteredOrgAttributes}
            allAttributes={ORGANIZATION_ATTRIBUTES}
            entities={organizations}
            isLoading={orgLoading}
            error={orgError}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
          />
        ) : activeSubTab === 'account' ? (
          <AttributesTabContent
            key="account"
            entityLabel="account"
            attributes={filteredAccountAttributes}
            allAttributes={ACCOUNT_ATTRIBUTES}
            entities={accounts}
            isLoading={accountLoading}
            error={accountError}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
          />
        ) : activeSubTab === 'contact' ? (
          <AttributesTabContent
            key="contact"
            entityLabel="contact"
            attributes={filteredContactAttributes}
            allAttributes={CONTACT_ATTRIBUTES}
            entities={contacts}
            isLoading={contactLoading}
            error={contactError}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
          />
        ) : activeSubTab === 'pipeline' ? (
          // Opportunities and Risks: the Pipelines book's own two kinds, one at a time (their field names collide), switched in the toolbar (spec §5.2: never two tab rows).
          pipelineEntity === 'Opportunities' ? (
            <AttributesTabContent
              key="opportunity"
              lead={pipelineSwitch}
              entityLabel="opportunity"
              pluralLabel="opportunities"
              attributes={filteredOpportunityAttributes}
              allAttributes={OPPORTUNITY_ATTRIBUTES}
              entities={opportunities}
              isLoading={opportunityLoading}
              error={opportunityError}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
            />
          ) : (
            <AttributesTabContent
              key="risk"
              lead={pipelineSwitch}
              entityLabel="risk"
              attributes={filteredRiskAttributes}
              allAttributes={RISK_ATTRIBUTES}
              entities={risks}
              isLoading={riskLoading}
              error={riskError}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
            />
          )
        ) : (
          <CustomObjectsPage />
        )}
      </div>
      <GlobalConfigSection />
    </SettingsFrame>
  );
}
