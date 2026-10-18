import { useEffect, useState } from 'react';
import { X, Info, ChevronDown, Settings, Smile } from 'lucide-react';
import { BUTTON, ICON_BUTTON, INPUT, OVERLAY, PRIMARY, Select, TYPE } from '../../components/ui';
import { LIFECYCLE_LABELS } from '../../features/customers/formatters';
import { FUNCTION_LABELS } from '../../features/auth/authSlice';
import type { UserFunction } from '../../features/auth/authSlice';
import type { LifecycleCategory } from '../../components/organizations/tableData';
import { apiFetch } from '../../lib/apiClient';
import type { AIAttribute } from '../../features/attributes/types';
import { VALUELESS_OPERATORS } from './types';
import type { ConditionOperator, ScenarioNodeData, ScenarioNodeDetail } from './types';

// The fixed, real attribute allowlist services/scenarios/engine.py's
// CONDITION_ATTRIBUTES accepts — see that module's own docstring on why
// it's a small allowlist rather than "any Customer field". The
// organisation's own AI attributes are offered alongside these, read by
// name as `attr:<api_name>`.
const CONDITION_ATTRIBUTES: { value: string; label: string }[] = [
  { value: 'lifecycle_stage', label: 'Lifecycle stage' },
  { value: 'health_score', label: 'Health score' },
  { value: 'nps_score', label: 'NPS score' },
  { value: 'arr', label: 'ARR' },
  { value: 'renewal_days', label: 'Days until renewal' },
  { value: 'open_tickets', label: 'Open tickets' },
  { value: 'owner', label: 'Owner (email)' },
  { value: 'name', label: 'Name' },
];

const CONDITION_OPERATORS: { value: ConditionOperator; label: string }[] = [
  { value: 'equals', label: 'is equal to' },
  { value: 'not_equals', label: 'is not equal to' },
  { value: 'greater_than', label: 'is greater than' },
  { value: 'less_than', label: 'is less than' },
  { value: 'contains', label: 'contains' },
  { value: 'is_one_of', label: 'is one of' },
  { value: 'is_empty', label: 'is empty' },
  { value: 'is_not_empty', label: 'is not empty' },
];

const NOTIFY_TARGETS: { value: NonNullable<ScenarioNodeData['notifyWho']>; label: string }[] = [
  { value: 'owner', label: 'The owner' },
  { value: 'manager', label: "The owner's manager" },
  { value: 'user', label: 'Someone in particular' },
];

interface Colleague {
  id: number;
  name: string;
  function: UserFunction;
}

const FIELD = INPUT;
const LABEL = TYPE.label;
/** A field label in the mockup panels (sentence case, above the control). */
const MOCK_LABEL = `flex items-center ${TYPE.label}`;

const LIFECYCLE_OPTIONS = Object.entries(LIFECYCLE_LABELS) as [LifecycleCategory, string][];

interface EditNodePaneProps {
  node: ScenarioNodeDetail | null;
  isOpen: boolean;
  onClose: () => void;
  /** Only the fields this pane actually collects real values for
   * (label, and Send Email/On Event's own selects — see this
   * component's own docstring) are included; the caller merges them
   * onto the node's existing data rather than replacing it wholesale. */
  onSave: (updates: Partial<ScenarioNodeData>) => void;
}

// Every per-action content block below (Filter/Condition/Assign
// Playbook/Create Pipeline/Slack Message) is still an illustrative
// mockup — none of them read from or write to real data, since there's
// no real Playbook/Slack/email-integration/attribute-picker concept
// backing any of this yet (see CreateScenario.tsx's own docstring on
// why: no backend at all). Only `label` (every node type) and Send
// Email/On Event's own selects are real, persisted state — this pane
// re-syncs them from `node.data` whenever a different node is opened,
// rather than leaking the previous node's own selections into it.
export function EditNodePane({ node, isOpen, onClose, onSave }: EditNodePaneProps) {
  const [label, setLabel] = useState('');
  const [isEmailDropdownOpen, setIsEmailDropdownOpen] = useState(false);
  const [selectedEmailService, setSelectedEmailService] = useState<string>('');
  const [selectedEventTrigger, setSelectedEventTrigger] = useState<string>('');
  const [selectedOrgEnters, setSelectedOrgEnters] = useState<string>('');
  const [isToDropdownOpen, setIsToDropdownOpen] = useState(false);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [attributeValue, setAttributeValue] = useState('');
  const [conditionKind, setConditionKind] = useState<'field' | 'semantic'>('field');
  const [conditionAttribute, setConditionAttribute] = useState('lifecycle_stage');
  const [conditionOperator, setConditionOperator] = useState<ConditionOperator>('equals');
  const [conditionValue, setConditionValue] = useState('');
  const [conditionPhrase, setConditionPhrase] = useState('');
  const [conditionThreshold, setConditionThreshold] = useState('0.6');
  const [aiAttributes, setAiAttributes] = useState<AIAttribute[]>([]);
  const [colleagues, setColleagues] = useState<Colleague[]>([]);
  const [assignRule, setAssignRule] = useState<'' | 'least_loaded'>('');
  const [assignTo, setAssignTo] = useState('');
  const [assignFunction, setAssignFunction] = useState('cs');
  const [notifyWho, setNotifyWho] = useState<NonNullable<ScenarioNodeData['notifyWho']>>('owner');
  const [notifyUser, setNotifyUser] = useState('');
  const [notifyMessage, setNotifyMessage] = useState('');

  useEffect(() => {
    if (!node) return;
    setLabel(node.data.label ?? '');
    setSelectedEmailService(node.data.emailService ?? '');
    setSelectedEventTrigger(node.data.eventTrigger ?? '');
    setSelectedOrgEnters(node.data.orgEnters ?? '');
    setEmailSubject(node.data.emailSubject ?? '');
    setEmailBody(node.data.emailBody ?? '');
    setTaskTitle(node.data.taskTitle ?? '');
    setAttributeValue(node.data.attributeValue ?? '');
    setConditionKind(node.data.conditionKind ?? (node.data.conditionPhrase ? 'semantic' : 'field'));
    setConditionAttribute(node.data.conditionAttribute ?? 'lifecycle_stage');
    setConditionOperator(node.data.conditionOperator ?? 'equals');
    setConditionValue(node.data.conditionValue ?? '');
    setConditionPhrase(node.data.conditionPhrase ?? '');
    setConditionThreshold(node.data.conditionThreshold ?? '0.6');
    setAssignRule(node.data.assignRule ?? '');
    setAssignTo(node.data.assignTo ? String(node.data.assignTo) : '');
    setAssignFunction(node.data.assignFunction ?? 'cs');
    setNotifyWho(node.data.notifyWho ?? 'owner');
    setNotifyUser(node.data.notifyUser ? String(node.data.notifyUser) : '');
    setNotifyMessage(node.data.notifyMessage ?? '');
    setIsEmailDropdownOpen(false);
    setIsToDropdownOpen(false);
    // Re-sync whenever a *different* node is opened for editing — not
    // on every keystroke, which would fight the fields above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node?.id]);

  const openAction = node?.data?.action ?? '';
  const needsAttributes = openAction === 'Condition' || openAction === 'Filter';
  const needsColleagues = openAction === 'Assign Owner' || openAction === 'Notify';

  useEffect(() => {
    if (!isOpen || !needsAttributes) return;
    let cancelled = false;
    // A failed list simply means no AI attributes to pick: the fixed
    // allowlist above is still there, so this never blocks the pane.
    apiFetch<AIAttribute[]>('/attributes/definitions/')
      .then((rows) => {
        if (!cancelled && Array.isArray(rows)) setAiAttributes(rows.filter((row) => row.applies_to_customer));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isOpen, needsAttributes]);

  useEffect(() => {
    if (!isOpen || !needsColleagues) return;
    let cancelled = false;
    apiFetch<{ results: Colleague[] } | Colleague[]>('/auth/users/')
      .then((data) => {
        const rows = Array.isArray(data) ? data : (data?.results ?? []);
        if (!cancelled) setColleagues(rows);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isOpen, needsColleagues]);

  if (!isOpen || !node) return null;

  const action = node.data?.action || '';

  function handleSave() {
    const updates: Partial<ScenarioNodeData> = { label: label.trim() || node!.data.label };
    if (action === 'Send Email') {
      updates.emailService = selectedEmailService;
      updates.emailSubject = emailSubject;
      updates.emailBody = emailBody;
    }
    if (action === 'On Event') {
      updates.eventTrigger = selectedEventTrigger;
      updates.orgEnters = selectedOrgEnters;
    }
    if (action === 'Condition' || action === 'Filter') {
      updates.conditionKind = conditionKind;
      if (conditionKind === 'semantic') {
        updates.conditionPhrase = conditionPhrase.trim();
        updates.conditionThreshold = conditionThreshold;
      } else {
        updates.conditionAttribute = conditionAttribute;
        updates.conditionOperator = conditionOperator;
        updates.conditionValue = VALUELESS_OPERATORS.includes(conditionOperator) ? '' : conditionValue;
      }
    }
    if (action === 'Assign Owner') {
      updates.assignRule = assignRule;
      updates.assignFunction = assignRule === 'least_loaded' ? assignFunction : '';
      updates.assignTo = assignRule === 'least_loaded' ? undefined : Number(assignTo) || undefined;
    }
    if (action === 'Notify') {
      updates.notifyWho = notifyWho;
      updates.notifyUser = notifyWho === 'user' ? Number(notifyUser) || undefined : undefined;
      updates.notifyMessage = notifyMessage.trim();
    }
    if (action === 'Create Task') updates.taskTitle = taskTitle;
    if (action === 'Set Attribute') updates.attributeValue = attributeValue;
    onSave(updates);
  }

  let title = `Edit ${action.toLowerCase()} node`;
  let subtitle = '';
  
  if (action === 'Filter') {
    title = 'Edit filter operator node';
    subtitle = 'Add conditions below to filter out the flow';
  } else if (action === 'Condition') {
    title = 'Edit condition operator node';
    subtitle = 'Split the flow based on the below conditions';
  } else if (action === 'Assign Playbook') {
    title = 'Edit playbook action node';
    subtitle = 'Choose the playbook to apply on the organization:';
  } else if (action === 'Create Pipeline') {
    title = 'Edit create pipeline action node';
  } else if (action === 'Slack Message') {
    title = 'Edit send Slack message action node';
  } else if (action === 'Send Email') {
    title = 'Edit send email action node';
  } else if (action === 'On Event') {
    title = 'Edit on event trigger node';
  } else if (action === 'Create Task') {
    title = 'Edit create task action node';
  } else if (action === 'Set Attribute') {
    title = 'Edit set attribute action node';
  } else if (action === 'Churn Entity') {
    title = 'Edit churn entity action node';
  } else if (action === 'Assign Owner') {
    title = 'Edit assign owner action node';
  } else if (action === 'Notify') {
    title = 'Edit notify action node';
  }

  const renderFilterContent = () => (
    <>
      <p className="text-[13px] text-ink-muted mb-4">{subtitle}</p>
      {renderConditionClause('Stops the flow here for any organization that does not match:')}
    </>
  );

  const renderConditionContent = () => (
    <>
      <p className="text-[13px] text-ink-muted mb-6">{subtitle}</p>

      <div className="flex flex-col gap-6">
        <div>
          <h3 className="text-[13px] font-semibold text-ink mb-3">"Yes" Flow:</h3>
          <p className="text-[13px] font-semibold text-ink-muted mb-4">Organizations that match the following condition:</p>
          {renderConditionClause()}
        </div>

        <div className="pt-2">
          <h3 className="text-[13px] font-semibold text-ink mb-3">"No" Flow:</h3>
          <p className="text-[13px] text-ink-muted">All remaining organizations.</p>
        </div>

        <div className="mt-2 flex gap-3 rounded-lg border border-line-subtle bg-subtle p-4 text-[13px] leading-5 text-ink-muted">
          <Info className="w-5 h-5 shrink-0 mt-0.5" />
          <p>
            <strong>Note:</strong> Wire up the "Yes"/"No" edges out of this node by opening each one and setting its
            label, see the canvas's own edge "Set label" pill. This clause is checked for real when the scenario runs.
          </p>
        </div>
      </div>
    </>
  );

  // Condition/Filter's real clause. Two kinds, exactly what
  // services/scenarios/engine.py evaluates: one fact about the customer,
  // or a phrase matched against what they have recently said.
  function renderConditionClause(introText?: string) {
    const valueless = VALUELESS_OPERATORS.includes(conditionOperator);
    const attributeId = `cond-attr-${node!.id}`;
    const operatorId = `cond-op-${node!.id}`;
    const valueId = `cond-val-${node!.id}`;
    const phraseId = `cond-phrase-${node!.id}`;
    const thresholdId = `cond-threshold-${node!.id}`;

    return (
      <div className="flex flex-col gap-3 border-t border-line-subtle pt-4">
        {introText && <p className="text-[13px] text-ink-muted">{introText}</p>}

        <div className="flex flex-col gap-1.5">
          {[
            { value: 'field' as const, label: 'A fact about the organization' },
            { value: 'semantic' as const, label: 'What they have been saying' },
          ].map((option) => (
            <label key={option.value} className="flex items-center gap-2 text-[13px] text-ink-muted cursor-pointer">
              <input
                type="radio"
                name={`cond-kind-${node!.id}`}
                checked={conditionKind === option.value}
                onChange={() => setConditionKind(option.value)}
                className="w-[14px] h-[14px] text-accent focus:ring-accent border-line-strong"
              />
              {option.label}
            </label>
          ))}
        </div>

        {conditionKind === 'semantic' ? (
          <>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={phraseId} className={LABEL}>Phrase</label>
              <input
                id={phraseId}
                type="text"
                value={conditionPhrase}
                onChange={(e) => setConditionPhrase(e.target.value)}
                placeholder="asking about pricing"
                className={FIELD}
              />
              <p className="text-[11px] text-ink-muted">
                Matched against the organization's recent emails, tickets and calls. Written the way you would say it, not as
                keywords.
              </p>
            </div>
            <div className="flex flex-col gap-1.5 max-w-[200px]">
              <label htmlFor={thresholdId} className={LABEL}>Match strength</label>
              <input
                id={thresholdId}
                type="number"
                step="0.05"
                min="0"
                max="1"
                value={conditionThreshold}
                onChange={(e) => setConditionThreshold(e.target.value)}
                className={FIELD}
              />
              <p className="text-[11px] text-ink-muted">Higher is stricter. 0.6 suits most phrases.</p>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-end gap-2">
              <div className="flex-1 flex flex-col gap-1.5">
                <label htmlFor={attributeId} className={LABEL}>Attribute</label>
                <Select
                  id={attributeId}
                  label="Attribute"
                  labelPosition="external"
                  value={conditionAttribute}
                  onChange={setConditionAttribute}
                  options={[
                    ...CONDITION_ATTRIBUTES,
                    ...aiAttributes.map((attr) => ({ value: `attr:${attr.api_name}`, label: `${attr.name} (AI)` })),
                  ]}
                />
              </div>
              <div className="flex-1 flex flex-col gap-1.5">
                <label htmlFor={operatorId} className={LABEL}>Operator</label>
                <Select
                  id={operatorId}
                  label="Operator"
                  labelPosition="external"
                  value={conditionOperator}
                  onChange={setConditionOperator}
                  options={CONDITION_OPERATORS}
                />
              </div>
            </div>

            {!valueless && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor={valueId} className={LABEL}>Value</label>
                {conditionAttribute === 'lifecycle_stage' && conditionOperator !== 'is_one_of' ? (
                  <Select
                    id={valueId}
                    label="Value"
                    labelPosition="external"
                    value={conditionValue}
                    onChange={setConditionValue}
                    options={[{ value: '', label: 'Choose…' }, ...LIFECYCLE_OPTIONS.map(([value, label]) => ({ value, label }))]}
                  />
                ) : (
                  <input
                    id={valueId}
                    type="text"
                    value={conditionValue}
                    onChange={(e) => setConditionValue(e.target.value)}
                    placeholder={conditionOperator === 'is_one_of' ? 'live, onboarding' : ''}
                    className={FIELD}
                  />
                )}
                {conditionOperator === 'is_one_of' && (
                  <p className="text-[11px] text-ink-muted">Comma separated. Any one of them counts as a match.</p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  const renderAssignOwnerContent = () => {
    const personId = `assign-person-${node!.id}`;
    const functionId = `assign-function-${node!.id}`;
    return (
      <div className="flex flex-col gap-4">
        <p className="text-[13px] text-ink-muted">Hand the organization to someone, and tell them it is theirs.</p>
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-[13px] text-ink-muted cursor-pointer">
            <input
              type="radio"
              name={`assign-rule-${node!.id}`}
              checked={assignRule === ''}
              onChange={() => setAssignRule('')}
              className="w-[14px] h-[14px] text-accent focus:ring-accent border-line-strong"
            />
            A specific person
          </label>
          {assignRule === '' && (
            <div className="flex flex-col gap-1.5 pl-6">
              <label htmlFor={personId} className={LABEL}>Person</label>
              <Select
                id={personId}
                label="Person"
                labelPosition="external"
                value={assignTo}
                onChange={setAssignTo}
                options={[{ value: '', label: 'Choose…' }, ...colleagues.map((person) => ({ value: String(person.id), label: person.name }))]}
              />
            </div>
          )}
          <label className="flex items-center gap-2 text-[13px] text-ink-muted cursor-pointer">
            <input
              type="radio"
              name={`assign-rule-${node!.id}`}
              checked={assignRule === 'least_loaded'}
              onChange={() => setAssignRule('least_loaded')}
              className="w-[14px] h-[14px] text-accent focus:ring-accent border-line-strong"
            />
            Whoever has the fewest organizations
          </label>
          {assignRule === 'least_loaded' && (
            <div className="flex flex-col gap-1.5 pl-6">
              <label htmlFor={functionId} className={LABEL}>Function</label>
              <Select
                id={functionId}
                label="Function"
                labelPosition="external"
                value={assignFunction}
                onChange={setAssignFunction}
                options={(Object.keys(FUNCTION_LABELS) as UserFunction[]).map((value) => ({ value, label: FUNCTION_LABELS[value] }))}
              />
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderNotifyContent = () => {
    const whoId = `notify-who-${node!.id}`;
    const personId = `notify-person-${node!.id}`;
    const messageId = `notify-message-${node!.id}`;
    return (
      <div className="flex flex-col gap-4">
        <p className="text-[13px] text-ink-muted">Put this organization in front of someone.</p>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={whoId} className={LABEL}>Who</label>
          <Select
            id={whoId}
            label="Who"
            labelPosition="external"
            value={notifyWho}
            onChange={setNotifyWho}
            options={NOTIFY_TARGETS}
          />
        </div>
        {notifyWho === 'user' && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={personId} className={LABEL}>Person</label>
            <Select
              id={personId}
              label="Person"
              labelPosition="external"
              value={notifyUser}
              onChange={setNotifyUser}
              options={[{ value: '', label: 'Choose…' }, ...colleagues.map((person) => ({ value: String(person.id), label: person.name }))]}
            />
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <label htmlFor={messageId} className={LABEL}>Message</label>
          <textarea
            id={messageId}
            rows={3}
            value={notifyMessage}
            onChange={(e) => setNotifyMessage(e.target.value)}
            placeholder="Health dropped and the renewal is close."
            className={`${FIELD} resize-y`}
          />
        </div>
      </div>
    );
  };

  const renderAssignPlaybookContent = () => (
    <>
      <p className="text-[13px] text-ink mb-3">{subtitle}</p>
      
      <div className="flex flex-col gap-1.5 mb-6">
        <label className={MOCK_LABEL}>
          Select playbook <span className="ml-1 text-danger-ink">*</span>
        </label>
        <div className="flex-1 min-h-9 px-3 py-2.5 bg-surface border border-line rounded-lg flex items-center justify-between cursor-pointer hover:border-line-strong">
          <span className="text-[13px] text-ink-muted">Select a playbook template</span>
          <ChevronDown className="w-4 h-4 text-ink-faint" />
        </div>
      </div>

      <div className="rounded-lg border border-line-subtle bg-subtle p-4 text-[13px] leading-5 text-ink-muted">
        <strong>Note:</strong> The system will not apply duplicate playbook instances on an entity. If the playbook is currently active on an entity, the entity will proceed to the next node in the flow.
      </div>
    </>
  );

  const renderCreatePipelineContent = () => (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <label className={MOCK_LABEL}>
          Pipeline type <span className="ml-1 text-danger-ink">*</span>
        </label>
        <div className="flex-1 min-h-9 px-3 py-2 bg-surface border border-line rounded-lg flex items-center justify-between cursor-pointer hover:border-line-strong">
          <span className="text-[13px] text-ink-muted">Opportunity</span>
          <ChevronDown className="w-4 h-4 text-ink-faint" />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className={MOCK_LABEL}>
          Title <span className="ml-1 text-danger-ink">*</span>
        </label>
        <div className="relative">
          <input 
            type="text" 
            placeholder="Give your pipeline a title" 
            className={`${INPUT} pr-24`}
          />
          <div className="absolute right-2 top-1.5 flex items-center gap-1 cursor-pointer text-ink-muted text-[11px] px-2 py-0.5 bg-subtle rounded border border-line">
            Add attribute <ChevronDown className="w-3 h-3" />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 w-1/2">
        <label className={MOCK_LABEL}>
          Status <span className="ml-1 text-danger-ink">*</span>
        </label>
        <div className="flex-1 min-h-9 px-3 py-2 bg-surface border border-line rounded-lg flex items-center justify-between cursor-pointer hover:border-line-strong">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-ink-muted" />
            <span className="text-[13px] font-semibold text-ink">Open</span>
          </div>
          <ChevronDown className="w-4 h-4 text-ink-faint" />
        </div>
      </div>
    </div>
  );

  const renderSlackMessageContent = () => (
    <div className="flex flex-col h-full -mx-6">
      <div className="flex items-center gap-8 border-b border-line px-6 pt-2 h-[42px] shrink-0 bg-surface">
        <button className="text-[13px] font-semibold text-accent border-b-[2.5px] border-accent h-full">
          Node configuration
        </button>
        <button className="text-[13px] font-semibold text-ink-muted border-b-[2.5px] border-transparent h-full">
          Execution controls
        </button>
      </div>

      <div className="p-6 flex flex-col gap-6 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-3">
          <label className={MOCK_LABEL}>
            Recipient type <span className="ml-1 text-danger-ink">*</span>
          </label>
          <div className="flex flex-col gap-2.5">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input type="radio" name="recipient" defaultChecked className="w-[15px] h-[15px] text-accent focus:ring-accent border-line-strong" />
              <span className="text-[13px] font-semibold text-ink-muted">Static channel</span>
            </label>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input type="radio" name="recipient" className="w-[15px] h-[15px] text-accent focus:ring-accent border-line-strong" />
              <span className="text-[13px] font-semibold text-ink-muted">User</span>
            </label>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input type="radio" name="recipient" className="w-[15px] h-[15px] text-accent focus:ring-accent border-line-strong" />
              <span className="text-[13px] font-semibold text-ink-muted">Dynamic channel</span>
            </label>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={MOCK_LABEL}>
            Channel <span className="ml-1 text-danger-ink">*</span>
          </label>
          <div className="flex-1 min-h-9 px-3 py-2 bg-surface border border-line rounded-lg flex items-center justify-between cursor-pointer hover:border-line-strong">
            <span className="text-[13px] text-ink-muted">Select channel</span>
            <ChevronDown className="w-4 h-4 text-ink-faint" />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={MOCK_LABEL}>
            Message <span className="ml-1 text-danger-ink">*</span>
          </label>
          <div className="flex flex-col border border-line rounded-lg overflow-hidden focus-within:border-accent focus-within:ring-1 focus-within:ring-accent bg-surface">
            <textarea 
              rows={5}
              placeholder="Enter message" 
              className="w-full p-3 text-[13px] resize-none focus:outline-none placeholder-ink-faint text-ink-muted"
            />
            <div className="border-t border-line-subtle bg-subtle/50 p-2 flex items-center justify-between">
              <div className="flex items-center gap-1 text-ink-muted">
                <button className="w-7 h-7 flex items-center justify-center hover:bg-subtle rounded"><span className="text-[15px] leading-none font-serif rotate-180 inline-block align-middle transform -scale-y-100">↺</span></button>
                <button className="w-7 h-7 flex items-center justify-center hover:bg-subtle rounded"><span className="text-[15px] leading-none font-serif">↻</span></button>
                <div className="w-px h-4 bg-line-strong mx-1" />
                <button className="w-7 h-7 flex items-center justify-center hover:bg-subtle rounded font-serif">B</button>
                <button className="w-7 h-7 flex items-center justify-center hover:bg-subtle rounded italic font-serif">I</button>
                <button className="w-7 h-7 flex items-center justify-center hover:bg-subtle rounded flex gap-0.5">
                  <span className="block w-3 h-0.5 bg-current mt-1 shadow-[0_3px_0_currentColor,0_6px_0_currentColor]"></span>
                  <ChevronDown className="w-2.5 h-2.5 ml-0.5 mt-0.5" />
                </button>
                <div className="w-px h-4 bg-line-strong mx-1" />
                <button className="w-7 h-7 flex items-center justify-center hover:bg-subtle rounded font-mono text-[11px]">99</button>
                <button className="w-7 h-7 flex items-center justify-center hover:bg-subtle rounded font-serif text-[15px]">Aa</button>
                <button aria-label="Emoji" className="w-7 h-7 flex items-center justify-center hover:bg-subtle rounded"><Smile className="h-4 w-4" aria-hidden="true" /></button>
                <button className="w-7 h-7 flex items-center justify-center hover:bg-subtle rounded font-serif line-through decoration-ink-faint">S</button>
              </div>
            </div>
          </div>
          <button className="mt-2 self-start flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-accent/40 text-accent hover:bg-accent-dim text-[11px] font-semibold">
            <span className="text-[13px] leading-none mb-0.5">+</span> {'{{attribute}}'}
          </button>
        </div>
      </div>
    </div>
  );

  const renderSendEmailContent = () => (
    <div className="flex flex-col h-full -mx-6">
      <div className="flex items-center gap-8 border-b border-line px-6 pt-2 h-[42px] shrink-0 bg-surface">
        <button className="text-[13px] font-semibold text-accent border-b-[2.5px] border-accent h-full">
          Node configuration
        </button>
        <button className="text-[13px] font-semibold text-ink-muted border-b-[2.5px] border-transparent h-full">
          Execution controls
        </button>
      </div>

      <div className="p-6 flex flex-col gap-6 flex-1 overflow-y-auto bg-subtle/30" onClick={() => isEmailDropdownOpen && setIsEmailDropdownOpen(false)}>
        <div onClick={(e) => e.stopPropagation()} className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="scenario-email-subject" className={MOCK_LABEL}>
              Subject <span className="ml-1 text-danger-ink">*</span>
            </label>
            <input
              id="scenario-email-subject"
              type="text"
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value)}
              placeholder="e.g. Checking in on your onboarding"
              className={INPUT}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="scenario-email-body" className={MOCK_LABEL}>
              Body <span className="ml-1 text-danger-ink">*</span>
            </label>
            <textarea
              id="scenario-email-body"
              rows={5}
              value={emailBody}
              onChange={(e) => setEmailBody(e.target.value)}
              placeholder="Enter message"
              className={`${INPUT} resize-none py-2`}
            />
          </div>

          <p className="text-[13px] text-ink-muted">Select the service you want to use to send the email</p>

          <div className="flex flex-col gap-1.5 relative group">
            <label className={MOCK_LABEL}>
              Email service type <span className="ml-1 text-danger-ink">*</span>
            </label>
            <div 
              onClick={() => setIsEmailDropdownOpen(!isEmailDropdownOpen)}
              className={`flex-1 min-h-9 px-3 py-2 bg-surface rounded-lg flex items-center justify-between cursor-pointer z-10 ${
                isEmailDropdownOpen ? 'border border-accent ring-1 ring-accent/20' : 'border border-line hover:border-line-strong'
              }`}
            >
              <span className={`text-[13px] ${selectedEmailService ? 'text-ink' : 'text-ink-muted'}`}>
                {selectedEmailService || 'Select service type'}
              </span>
              <ChevronDown className={`w-4 h-4 transition-transform ${isEmailDropdownOpen ? 'text-accent rotate-180' : 'text-ink-faint'}`} />
            </div>

            {/* Dropdown list */}
            {isEmailDropdownOpen && (
              <div className={`absolute top-[60px] left-0 right-0 z-50 flex flex-col py-1.5 ${OVERLAY}`}>
                <button 
                  onClick={() => {
                    setSelectedEmailService('Via integrated email client');
                    setIsEmailDropdownOpen(false);
                  }}
                  className="flex items-center justify-between px-3 py-2 hover:bg-subtle bg-surface w-full text-left"
                >
                  <span className="text-[13px] text-ink flex items-center gap-2">
                    Via integrated email client <Info className="w-3.5 h-3.5 text-ink-faint hover:text-ink fill-ink-faint/80" />
                  </span>
                </button>
                <button 
                  onClick={() => {
                    setSelectedEmailService('Bulk email service');
                    setIsEmailDropdownOpen(false);
                  }}
                  className="flex items-center justify-between px-3 py-2 hover:bg-subtle bg-surface w-full text-left"
                >
                  <span className="text-[13px] text-ink flex items-center gap-2">
                    Bulk email service <Info className="w-3.5 h-3.5 text-ink-faint hover:text-ink fill-ink-faint/80" />
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const renderOnEventContent = () => (
    <div className="flex flex-col h-full -mx-6">
      <div className="flex items-center justify-around border-b border-line px-6 pt-2 h-[42px] shrink-0 bg-surface">
        <button className="flex-1 text-[13px] font-semibold text-accent border-b-[2.5px] border-accent h-full px-4">
          Trigger setup
        </button>
        <button className="flex-1 text-[13px] font-semibold text-ink-muted border-b-[2.5px] border-transparent h-full px-4">
          Re-entry criteria
        </button>
      </div>

      <div className="p-6 flex flex-col gap-6 flex-1 overflow-y-auto bg-surface">
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-ink-muted tracking-tight mt-1 mb-1">Choose the event that prompts entities to enter the scenario.</p>
          <div className="flex flex-col gap-2.5">
            <label className="flex items-center gap-2.5 cursor-pointer">
               <input type="radio" name="event_trigger" checked={selectedEventTrigger === 'new_entity'} onChange={() => setSelectedEventTrigger('new_entity')} className="w-[14px] h-[14px] text-accent focus:ring-accent border-line-strong" />
               <span className="text-[13px] text-ink-muted">Creation of new entity</span>
            </label>

            <label className="flex items-center gap-2.5 cursor-pointer">
               <input type="radio" name="event_trigger" checked={selectedEventTrigger === 'interaction_classified'} onChange={() => setSelectedEventTrigger('interaction_classified')} className="w-[14px] h-[14px] text-accent focus:ring-accent border-line-strong" />
               <span className="text-[13px] text-ink-muted">An email, ticket or call is classified</span>
            </label>
            
            <div className="flex flex-col gap-3">
              <label className="flex items-center gap-2.5 cursor-pointer">
                 <input type="radio" name="event_trigger" checked={selectedEventTrigger === 'attribute'} onChange={() => setSelectedEventTrigger('attribute')} className="w-[14px] h-[14px] text-accent focus:ring-accent border-line-strong" />
                 <span className="text-[13px] text-ink-muted">Change of attribute value</span>
              </label>
              
              {selectedEventTrigger === 'attribute' && (
                 <div className="pl-[27px] flex flex-col gap-3.5 mt-1 pb-2">
                   <p className="text-[11px] text-ink-muted leading-relaxed max-w-[95%]">
                     The organization will be streamed into the flow, based on a change in the selected attribute.
                   </p>
                   
                   <div className="flex flex-col gap-1.5 w-full">
                     <label className={MOCK_LABEL}>
                       Attribute name
                     </label>
                     <div className="w-full px-3 py-[7px] bg-surface border border-line-strong rounded flex items-center justify-between cursor-pointer hover:border-line-strong">
                       <span className="text-[13px] text-ink-muted">Select attribute to track</span>
                       <ChevronDown className="w-3.5 h-3.5 text-ink-faint" />
                     </div>
                   </div>

                   <div className="flex flex-col gap-2.5 mt-1.5">
                     <label className={`${MOCK_LABEL} mb-0.5`}>
                       Organization enters
                     </label>
                     <div className="flex flex-col gap-2">
                       <label className="flex items-center gap-2.5 cursor-pointer">
                         <input type="radio" name="org_enters" checked={selectedOrgEnters === 'value_change'} onChange={() => setSelectedOrgEnters('value_change')} className="w-[13px] h-[13px] text-ink-muted focus:ring-accent border-line-strong" />
                         <span className={`text-[13px] ${selectedOrgEnters === 'value_change' ? 'text-ink' : 'text-ink-muted'}`}>On value change</span>
                       </label>
                       
                       <label className="flex items-center gap-2.5 cursor-pointer">
                         <input type="radio" name="org_enters" checked={selectedOrgEnters === 'specified_change'} onChange={() => setSelectedOrgEnters('specified_change')} className="w-[13px] h-[13px] text-ink-muted focus:ring-accent border-line-strong" />
                         <span className={`text-[13px] ${selectedOrgEnters === 'specified_change' ? 'text-ink' : 'text-ink-muted'}`}>Based on specified value change</span>
                       </label>
                       
                       {selectedOrgEnters === 'specified_change' && (
                         <div className="pl-[25px] flex flex-col gap-4 mt-1.5 pb-2">
                           <div className="flex flex-col gap-1.5">
                             <label className={TYPE.label}>If value changes from</label>
                             <div className="w-[320px] px-3 py-2 bg-surface border border-line rounded flex gap-1.5 items-center cursor-pointer hover:border-line-strong relative">
                                <div className="flex items-center gap-1.5 bg-subtle border border-line rounded px-1.5 py-0.5">
                                   <div className="w-[7px] h-[7px] bg-success rounded-sm" />
                                   <span className={TYPE.label}>Good</span>
                                   <X className="w-3 h-3 text-ink-faint hover:text-ink-muted ml-0.5" />
                                </div>
                                <ChevronDown className="w-4 h-4 text-ink-faint absolute right-3" />
                             </div>
                           </div>
                           
                           <div className="flex flex-col gap-1.5 relative z-10">
                             <label className={TYPE.label}>to</label>
                             <div 
                               onClick={() => setIsToDropdownOpen(!isToDropdownOpen)}
                               className={`w-[320px] px-3 py-2 bg-surface rounded flex gap-1.5 items-center cursor-pointer relative ${
                                 isToDropdownOpen ? 'border border-accent ring-1 ring-accent/20' : 'border border-line hover:border-line-strong'
                               }`}
                             >
                                <div className="flex items-center gap-1.5 bg-warning-dim border border-warning/30 rounded px-1.5 py-0.5">
                                   <div className="w-[7px] h-[7px] bg-warning rounded-sm" />
                                   <span className={TYPE.label}>Average</span>
                                   <X className="w-3 h-3 text-ink-faint hover:text-ink-muted ml-0.5" />
                                </div>
                                <div className="flex items-center gap-1.5 bg-danger-dim border border-danger/30 rounded px-1.5 py-0.5">
                                   <div className="w-[7px] h-[7px] bg-danger rounded-sm" />
                                   <span className={TYPE.label}>Poor</span>
                                   <X className="w-3 h-3 text-ink-faint hover:text-ink-muted ml-0.5" />
                                </div>
                                <ChevronDown className={`w-4 h-4 absolute right-3 transition-transform ${isToDropdownOpen ? 'text-accent rotate-180' : 'text-ink-faint'}`} />

                                {/* Mock Open Dropdown Menu */}
                                {isToDropdownOpen && (
                                  <div 
                                    className={`absolute top-[110%] left-0 right-0 z-[100] flex flex-col py-1.5 ${OVERLAY}`}
                                    onClick={e => e.stopPropagation()}
                                  >
                                     <div className="flex items-center justify-between px-3 py-2 hover:bg-subtle/80 group cursor-pointer">
                                        <div className="flex items-center gap-2.5">
                                           <div className="w-2 h-2 bg-danger rounded-sm" />
                                           <span className="text-[13px] font-semibold text-ink-muted">Poor</span>
                                        </div>
                                        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-none stroke-[var(--accent)] stroke-[3px] opacity-80"><path d="M5 13l4 4L19 7" /></svg>
                                     </div>
                                     <div className="flex items-center justify-between px-3 py-2 hover:bg-subtle/80 group cursor-pointer">
                                        <div className="flex items-center gap-2.5">
                                           <div className="w-2 h-2 bg-warning rounded-sm" />
                                           <span className="text-[13px] font-semibold text-ink-muted">Average</span>
                                        </div>
                                        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-none stroke-[var(--accent)] stroke-[3px] opacity-80"><path d="M5 13l4 4L19 7" /></svg>
                                     </div>
                                     <div className="flex items-center justify-between px-3 py-2 hover:bg-subtle/80 group cursor-pointer mb-1">
                                        <div className="flex items-center gap-2.5">
                                           <div className="w-2 h-2 bg-success rounded-sm" />
                                           <span className="text-[13px] font-semibold text-ink-muted">Good</span>
                                        </div>
                                     </div>
                                     <div className="px-3 pb-1 border-t border-line-subtle pt-2.5">
                                        <button 
                                          onClick={() => setIsToDropdownOpen(false)}
                                          className={PRIMARY}
                                        >
                                           Done
                                        </button>
                                     </div>
                                  </div>
                                )}
                             </div>
                           </div>
                         </div>
                       )}

                       <label className="flex items-center gap-2.5 cursor-pointer">
                         <input type="radio" name="org_enters" checked={selectedOrgEnters === 'percent_change'} onChange={() => setSelectedOrgEnters('percent_change')} className="w-[13px] h-[13px] text-ink-muted focus:ring-accent border-line-strong" />
                         <span className={`text-[13px] ${selectedOrgEnters === 'percent_change' ? 'text-ink' : 'text-ink-muted'}`}>% change of value</span>
                       </label>
                     </div>
                   </div>
                 </div>
              )}
            </div>

            <label className="flex items-center gap-2.5 cursor-pointer">
               <input type="radio" name="event_trigger" checked={selectedEventTrigger === 'status'} onChange={() => setSelectedEventTrigger('status')} className="w-[14px] h-[14px] text-accent focus:ring-accent border-line-strong" />
               <span className="text-[13px] text-ink-muted">Change of entity status</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );

  const renderCreateTaskContent = () => (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="scenario-task-title" className={MOCK_LABEL}>
        Task title <span className="ml-1 text-danger-ink">*</span>
      </label>
      <input
        id="scenario-task-title"
        type="text"
        value={taskTitle}
        onChange={(e) => setTaskTitle(e.target.value)}
        placeholder="e.g. Follow up on onboarding"
        className={INPUT}
      />
      <p className="text-[11px] text-ink-muted mt-1">
        Created with a due date of today, medium priority, assigned to "Scenario Automation".
      </p>
    </div>
  );

  const renderSetAttributeContent = () => (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="scenario-attribute-value" className={MOCK_LABEL}>
        Set lifecycle stage to <span className="ml-1 text-danger-ink">*</span>
      </label>
      <Select
        id="scenario-attribute-value"
        label="Set lifecycle stage to"
        labelPosition="external"
        value={attributeValue}
        onChange={setAttributeValue}
        options={[{ value: '', label: 'Select a value', disabled: true }, ...LIFECYCLE_OPTIONS.map(([value, lbl]) => ({ value, label: lbl }))]}
      />
      <p className="text-[11px] text-ink-muted mt-1">
        Only lifecycle stage is settable from a scenario today.
      </p>
    </div>
  );

  const renderChurnEntityContent = () => (
    <div className="rounded-lg border border-line-subtle bg-danger-dim p-4 text-[13px] leading-5 text-danger-ink">
      <strong>No further configuration needed.</strong> When this node runs, the organization's
      lifecycle stage is set to Churned.
    </div>
  );

  return (
    <div
      role="dialog"
      aria-label={title}
      className="fixed inset-y-0 right-0 z-[100] flex w-[550px] max-w-full flex-col border-l border-line bg-elevated shadow-lg"
    >
      {/* Header */}
      <div className="px-6 py-4 border-b border-line-subtle flex items-center justify-between bg-surface shrink-0">
        <h2 className={TYPE.title}>{title}</h2>
        <button type="button" onClick={onClose} aria-label="Close" className={ICON_BUTTON}>
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 flex flex-col">
        {/* Label — the one field every node type actually has and
            saves, shown on the canvas node itself (see CustomNodes.tsx). */}
        <div className="flex flex-col gap-1.5 mb-5">
          <label htmlFor="scenario-node-label" className={TYPE.label}>
            Node label
          </label>
          <input
            id="scenario-node-label"
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={`New ${action}`}
            className={INPUT}
          />
        </div>

        {action === 'Filter' && renderFilterContent()}
        {action === 'Condition' && renderConditionContent()}
        {action === 'Assign Playbook' && renderAssignPlaybookContent()}
        {action === 'Create Pipeline' && renderCreatePipelineContent()}
        {action === 'Slack Message' && renderSlackMessageContent()}
        {action === 'Send Email' && renderSendEmailContent()}
        {action === 'On Event' && renderOnEventContent()}
        {action === 'Create Task' && renderCreateTaskContent()}
        {action === 'Set Attribute' && renderSetAttributeContent()}
        {action === 'Churn Entity' && renderChurnEntityContent()}
        {action === 'Assign Owner' && renderAssignOwnerContent()}
        {action === 'Notify' && renderNotifyContent()}

        {/* Fallback for unhandled nodes */}
        {!['Filter', 'Condition', 'Assign Playbook', 'Create Pipeline', 'Slack Message', 'Send Email', 'On Event', 'Create Task', 'Set Attribute', 'Churn Entity'].includes(action) && (
           <div className="flex flex-col items-center justify-center py-12 text-ink-muted">
             <Settings className="w-12 h-12 mb-4 opacity-20" />
             <p className="text-[13px]">Edit pane for {action} coming soon.</p>
           </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-6 py-5 border-t border-line-subtle flex items-center justify-end gap-3 bg-surface shrink-0">
        <button type="button" onClick={onClose} className={BUTTON}>
          Cancel
        </button>
        <button type="button" onClick={handleSave} className={PRIMARY}>
          Save and close
        </button>
      </div>
    </div>
  );
}
