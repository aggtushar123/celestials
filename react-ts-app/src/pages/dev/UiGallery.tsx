import { useState, type ReactNode } from 'react';
import { Inbox, Loader2, Pencil, Plus, Send } from 'lucide-react';
import {
  Badge,
  Banner,
  BUTTON,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  CardSection,
  CODE,
  DANGER,
  DayChips,
  DetailHeader,
  EmptyState,
  ErrorState,
  FilterChip,
  FilterChipRow,
  HealthBadge,
  ICON_BUTTON,
  INPUT,
  ListCard,
  ListHeaderRow,
  ListRow,
  LoadingState,
  MetaParts,
  NUM,
  OVERLAY,
  PageBody,
  PageHeader,
  PRIMARY,
  QUIET,
  RemovableChip,
  SearchInput,
  SegmentedControl,
  Select,
  SentimentBadge,
  SettingsFrame,
  SettingsNote,
  SettingsRow,
  SettingsSection,
  Switch,
  TABLE,
  Tabs,
  TD,
  TD_NUM,
  TH,
  Tile,
  tileRow,
  Toolbar,
  ToastProvider,
  TYPE,
  useToast,
} from '../../components/ui';

// The dev-only gallery at /__ui (UI foundations spec §1, §9.3): every
// primitive in every state, on the real canvas, in both themes. It is the
// first page screenshotted in every UI PR. Registered only when
// import.meta.env.DEV, so it never ships.

const noop = () => {};
const DAYS = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 0, label: 'Sunday' },
];

function ToastDemo() {
  const toast = useToast();
  return (
    <div className="mt-6">
      <button type="button" className={BUTTON} onClick={() => toast({ message: 'Setting saved.', action: { label: 'Undo', onAction: noop } })}>
        Show toast with undo
      </button>
    </div>
  );
}

const COLUMNS = 'sm:grid-cols-[minmax(12rem,1fr)_6rem_7rem_auto]';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className={TYPE.title}>{title}</h2>
      {children}
    </section>
  );
}

export function UiGallery() {
  const [view, setView] = useState<'all' | 'lists' | 'controls'>('all');
  const [scope, setScope] = useState<'me' | 'team' | 'company'>('me');
  const [windowDays, setWindowDays] = useState<'30d' | '90d'>('30d');
  const [open, setOpen] = useState(true);
  const [closed, setClosed] = useState(false);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'name' | 'arr'>('name');
  const [digest, setDigest] = useState(true);
  const [days, setDays] = useState<number[]>([1, 3, 5]);
  const [filter, setFilter] = useState<'all' | 'risk'>('all');
  const [selected, setSelected] = useState('uber');

  return (
    <div className="min-h-[100dvh] rv-canvas">
      <PageHeader
        title="UI primitives"
        tabs={
          <Tabs
            label="Gallery views"
            value={view}
            onChange={setView}
            items={[
              { key: 'all', label: 'All', count: 13 },
              { key: 'lists', label: 'Lists' },
              { key: 'controls', label: 'Controls' },
            ]}
          />
        }
        actions={{
          primary: (
            <button type="button" className={PRIMARY}>
              New item
            </button>
          ),
          secondary: [
            { key: 'export', label: 'Export', onSelect: noop },
            { key: 'import', label: 'Import', onSelect: noop },
            { key: 'archive', label: 'Archive', onSelect: noop, danger: true },
          ],
        }}
      />
      <main>
        <PageBody>
          <Section title="Type and figures">
            <Card>
              <p className={TYPE.display}>Display, 22px</p>
              <p className={TYPE.title}>Title, 15px</p>
              <p className={TYPE.body}>
                Body, 13px. Closes in <span className={NUM}>17d</span>, worth <span className={NUM}>$175K</span>.
              </p>
              <p className={TYPE.bodyMuted}>Muted body, for intros and descriptions.</p>
              <p className={TYPE.meta}>Meta, 11px · Carl CSM · Renewal</p>
              <p className={TYPE.eyebrow}>Eyebrow, tile labels only</p>
              <p className={TYPE.label}>Label, above a field</p>
              <p className={TYPE.body}>
                API key <span className={CODE}>rv_live_4f2a9c</span>
              </p>
              <p className={`${TYPE.body} ${NUM}`}>$1,111 and $8,888 line up.</p>
            </Card>
          </Section>

          <Section title="Buttons">
            <Card>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className={PRIMARY}>
                  Save
                </button>
                <button type="button" className={BUTTON}>
                  Export
                </button>
                <button type="button" className={QUIET}>
                  Show more
                </button>
                <button type="button" className={DANGER}>
                  Delete
                </button>
                <button type="button" aria-label="Edit" className={ICON_BUTTON}>
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                </button>
                <button type="button" disabled aria-busy="true" className={PRIMARY}>
                  <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
                  Saving
                </button>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button type="button" disabled className={PRIMARY}>
                  Save
                </button>
                <button type="button" disabled className={BUTTON}>
                  Export
                </button>
                <button type="button" disabled className={QUIET}>
                  Show more
                </button>
                <button type="button" disabled className={DANGER}>
                  Delete
                </button>
                <button type="button" disabled aria-label="Edit, disabled" className={ICON_BUTTON}>
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </Card>
          </Section>

          <Section title="Card">
            <div className="grid items-start gap-4 lg:grid-cols-2">
              <Card pad="none">
                <CardHeader
                  title="Renewals"
                  meta="4 · $245K"
                  action={
                    <button type="button" aria-label="Edit renewals" className={ICON_BUTTON}>
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </button>
                  }
                />
                <CardBody>
                  <p className={TYPE.body}>A card body. Group inside with sections, never a second card.</p>
                </CardBody>
                <CardSection>
                  <p className={TYPE.bodyMuted}>A divided section in the same card.</p>
                </CardSection>
                <CardFooter>
                  <button type="button" className={BUTTON}>
                    Cancel
                  </button>
                  <button type="button" className={PRIMARY}>
                    Save
                  </button>
                </CardFooter>
              </Card>
              <div className={`${OVERLAY} p-4`}>
                <p className={TYPE.title}>Overlay</p>
                <p className={TYPE.bodyMuted}>Menus, popovers, sheets and modals: the only shadow.</p>
              </div>
            </div>
          </Section>

          <Section title="Lists">
            <ListCard label="Organizations" header={<CardHeader title="Average health" meta="3 · $245K" />}>
              <ListRow
                title="Uber"
                meta="Carl CSM · Renewal in 17d"
                href="/__ui"
                selected={selected === 'uber'}
                trailing={<HealthBadge band="poor">Risk 55</HealthBadge>}
                actions={
                  <button type="button" className={QUIET} onClick={() => setSelected('uber')}>
                    Ask about this
                  </button>
                }
              />
              <ListRow title="Stripe" meta="Alice Admin · Expansion" onSelect={() => setSelected('stripe')} selected={selected === 'stripe'} trailing={<Badge>Shared</Badge>} />
              <ListRow title="A very long organisation name that has to truncate before it pushes the badge out of the row" meta="Read only, opens nothing" />
            </ListCard>
            <ListCard label="Compact" header={<CardHeader title="Compact density" />}>
              <ListRow title="Plan kickoff" meta="Due 3 Oct" density="compact" onSelect={noop} />
              <ListRow title="Exec sponsor call" meta="Due 5 Oct" density="compact" onSelect={noop} />
            </ListCard>
            <ListCard label="Opportunities" header={<ListHeaderRow columns={COLUMNS} labels={['Name', 'MRR', 'Stage', '']} />}>
              {[
                ['Expansion', '$2.0K', 'Proposal'],
                ['Upsell', '$12.5K', 'Discovery'],
              ].map(([name, mrr, stage]) => (
                <ListRow
                  key={name}
                  title={name}
                  meta="Pizza Hut"
                  columns={COLUMNS}
                  onSelect={noop}
                  cells={[
                    <span key="mrr" className={`${TYPE.body} ${NUM}`}>
                      {mrr}
                    </span>,
                    <span key="stage" className={TYPE.bodyMuted}>
                      {stage}
                    </span>,
                  ]}
                />
              ))}
            </ListCard>
            <div className="@container">
              <ListCard label="Grid from a breakpoint" header={<CardHeader title="Grid from a breakpoint" />}>
                {[
                  ['Seat expansion', '$5.1K', 'Discovery', true],
                  ['Renewal', '$12.5K', 'Proposal', false],
                ].map(([name, mrr, stage, strong]) => (
                  <ListRow
                    key={String(name)}
                    title={String(name)}
                    strong={Boolean(strong)}
                    meta={<span className="@min-[40rem]:hidden">{`${mrr} · ${stage}`}</span>}
                    columns="@min-[40rem]:grid-cols-[minmax(12rem,1fr)_6rem_8rem]"
                    gridAt={{ row: '@min-[40rem]:grid', cell: '@min-[40rem]:block' }}
                    onSelect={noop}
                    cells={[
                      <span key="mrr" className={`block text-right ${TYPE.body} ${NUM}`}>
                        {String(mrr)}
                      </span>,
                      <Badge key="stage">{String(stage)}</Badge>,
                    ]}
                  />
                ))}
              </ListCard>
            </div>
            <div className="grid items-start gap-4 lg:grid-cols-3">
              <ListCard label="Loading" header={<CardHeader title="Loading" />} state={<LoadingState label="Loading organizations" />} />
              <ListCard
                label="Empty"
                header={<CardHeader title="Empty" />}
                state={<EmptyState title="No organizations yet" detail="Add one, or import a CSV." icon={Inbox} action={<button type="button" className={BUTTON}>Add organization</button>} />}
              />
              <ListCard label="Error" header={<CardHeader title="Error" />} state={<ErrorState message="Could not load organizations." onRetry={noop} />} />
            </div>
            <Card pad="none">
              <EmptyState title="No open plans." size="inline" />
            </Card>
          </Section>

          <Section title="List footer">
            <ListCard label="With a footer" header={<CardHeader title="With a footer" />} footer={<button type="button" className={QUIET}>Show more</button>}>
              <ListRow title="Onboarding" meta="Pizza Hut" onSelect={noop} />
              <ListRow title="Renewal" meta="Uber" onSelect={noop} />
            </ListCard>
          </Section>

          <Section title="Table">
            <Card pad="none" className="overflow-x-auto">
              <table className={TABLE}>
                <thead>
                  <tr className="border-b border-line-subtle">
                    <th className={TH}>Member</th>
                    <th className={TH}>Role</th>
                    <th className={`${TH} text-right`}>Seats</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-subtle">
                  <tr>
                    <td className={TD}>Alice Admin</td>
                    <td className={TD}>Admin</td>
                    <td className={TD_NUM}>3</td>
                  </tr>
                  <tr>
                    <td className={TD}>Carl CSM</td>
                    <td className={TD}>CSM</td>
                    <td className={TD_NUM}>12</td>
                  </tr>
                </tbody>
              </table>
            </Card>
          </Section>

          <Section title="Tiles">
            <div className={tileRow(4)}>
              <Tile label="Accounts" value="128" meta="$4.2M ARR" />
              <Tile label="Health" value="72" meta="Average across the book">
                <span className={`flex justify-between ${TYPE.meta}`}>
                  Good <span className={NUM}>40</span>
                </span>
                <span className={`flex justify-between ${TYPE.meta}`}>
                  Poor <span className={NUM}>8</span>
                </span>
              </Tile>
              <Tile label="All" value="47" pressed={filter === 'all'} onPress={() => setFilter('all')} />
              <Tile label="At risk" value="9" meta="Risk at or above 50" pressed={filter === 'risk'} onPress={() => setFilter('risk')} />
            </div>
            <div className={tileRow(3)}>
              <Tile
                label="Window"
                value="$688.6K"
                action={
                  <SegmentedControl
                    label="Window"
                    size="sm"
                    value={windowDays}
                    onChange={setWindowDays}
                    options={[
                      { value: '30d', label: '30d' },
                      { value: '90d', label: '90d' },
                    ]}
                  />
                }
              />
              <Tile label="No meta" value="3" />
              <Tile label="Open plans" value="2" meta="1 at risk" to="/__ui?section=plans" current buttonLabel="Open plans: 2, 1 at risk" />
            </div>
          </Section>

          <Section title="Badges">
            <Card>
              <div className="flex flex-wrap items-center gap-2">
                <Badge>Neutral</Badge>
                <Badge tone="success">Success</Badge>
                <Badge tone="warning">Warning</Badge>
                <Badge tone="danger">Danger</Badge>
                <Badge tone="info">Info</Badge>
                <Badge tone="danger" dot>
                  Overdue
                </Badge>
                <HealthBadge band="good" />
                <HealthBadge band="average" />
                <HealthBadge band="poor" />
                <SentimentBadge value="positive" />
                <SentimentBadge value="neutral" />
                <SentimentBadge value="negative" />
              </div>
            </Card>
          </Section>

          <Section title="Controls">
            <Card className="flex flex-col gap-4">
              <Tabs
                label="Record views"
                value="list"
                items={[
                  { key: 'list', label: 'List', to: '/__ui' },
                  { key: 'board', label: 'Board', to: '/__ui' },
                ]}
              />
              <div className="flex flex-wrap items-center gap-3">
                <SegmentedControl
                  label="Scope"
                  value={scope}
                  onChange={setScope}
                  options={[
                    { value: 'me', label: 'Me' },
                    { value: 'team', label: 'My team' },
                    { value: 'company', label: 'Company' },
                  ]}
                />
                <Switch checked={digest} onChange={setDigest}>
                  Email digest
                </Switch>
                <Switch checked={false} onChange={noop} disabled>
                  Disabled switch
                </Switch>
              </div>
              <FilterChipRow label="Status">
                <FilterChip label="Open" pressed={open} onToggle={() => setOpen((value) => !value)} />
                <FilterChip label="Closed" pressed={closed} onToggle={() => setClosed((value) => !value)} />
                <RemovableChip label="Owner: Carl" onRemove={noop} />
              </FilterChipRow>
              <SearchInput label="Search organizations by name or owner" placeholder="Search organizations" value={query} onChange={setQuery} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Select
                  label="Sort by"
                  value={sort}
                  onChange={setSort}
                  options={[
                    { value: 'name', label: 'Name' },
                    { value: 'arr', label: 'ARR' },
                  ]}
                />
                <Select
                  label="Sort by"
                  labelPosition="inline"
                  value={sort}
                  onChange={setSort}
                  options={[
                    { value: 'name', label: 'Name' },
                    { value: 'arr', label: 'ARR' },
                  ]}
                />
                <Select label="Owner" labelPosition="hidden" value="carl" onChange={noop} options={[{ value: 'carl', label: 'Carl CSM' }]} />
                <Select label="Disabled select" value="carl" onChange={noop} disabled options={[{ value: 'carl', label: 'Carl CSM' }]} />
                <Select
                  label="Invalid select"
                  value="on_track"
                  onChange={noop}
                  invalid
                  describedBy="gallery-status-error"
                  options={[
                    { value: 'on_track', label: 'On track' },
                    { value: 'done', label: 'Done', disabled: true },
                  ]}
                />
                <p id="gallery-status-error" className={TYPE.bodyMuted}>
                  Not every milestone is done.
                </p>
                <label className="flex flex-col gap-1.5">
                  <span className={TYPE.label}>Name</span>
                  <input className={INPUT} placeholder="Acme Inc" />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className={TYPE.label}>Disabled input</span>
                  <input className={INPUT} disabled value="Locked" readOnly />
                </label>
              </div>
            </Card>
          </Section>

          <Section title="Toolbar">
            <Toolbar
              lead={
                <SegmentedControl
                  label="Kind"
                  value="opportunities"
                  onChange={noop}
                  options={[
                    { value: 'opportunities', label: 'Opportunities' },
                    { value: 'risks', label: 'Risks' },
                  ]}
                />
              }
              search={<SearchInput label="Search opportunities" placeholder="Search opportunities" value={query} onChange={setQuery} />}
              filters={<FilterChip label="Mine" pressed={open} onToggle={() => setOpen((value) => !value)} />}
              actions={{
                primary: (
                  <button type="button" className={PRIMARY}>
                    New opportunity
                  </button>
                ),
                secondary: [
                  { key: 'export', label: 'Export', onSelect: noop },
                  { key: 'columns', label: 'Columns', onSelect: noop },
                  { key: 'import', label: 'Import', onSelect: noop },
                ],
              }}
              count="14 opportunities"
            />
          </Section>

          <Section title="Toolbar without a search">
            <Toolbar
              lead={
                <SegmentedControl
                  label="Campaign scope"
                  value="mine"
                  onChange={noop}
                  options={[
                    { value: 'mine', label: 'Mine' },
                    { value: 'shared', label: 'Shared with me' },
                  ]}
                />
              }
              count="4 campaigns"
              actions={{
                primary: (
                  <button type="button" className={PRIMARY}>
                    New campaign
                  </button>
                ),
              }}
            />
          </Section>

          <Section title="Detail header">
            <DetailHeader
              title="Renewal risk"
              description="Organisations renewing within 90 days."
              actions={[
                { key: 'edit', label: 'Edit', icon: Pencil, to: '/__ui' },
                { key: 'survey', label: 'Survey these', icon: Send, to: '/__ui' },
              ]}
              menu={[
                { key: 'duplicate', label: 'Duplicate', onSelect: noop },
                { key: 'delete', label: 'Delete', onSelect: noop, danger: true },
              ]}
              meta={
                <>
                  Yours · Private · <span className={NUM}>41</span> members
                </>
              }
              status="Paused: its owner is inactive."
            />
          </Section>

          <Section title="States">
            <div className="grid items-start gap-4 lg:grid-cols-2">
              <Card pad="none">
                <LoadingState label="Loading the brief" variant="block" />
              </Card>
              <Card pad="none">
                <LoadingState label="Loading tiles" variant="tiles" count={4} />
              </Card>
            </div>
          </Section>

          <Section title="Settings frame">
            <SettingsFrame
              title="General"
              intro="The workspace's name and owner."
              note={<SettingsNote icon="lock">Only admins can change these.</SettingsNote>}
              action={<button type="button" className={BUTTON}>Transfer ownership</button>}
            >
              <SettingsSection title="Workspace" description="What everyone in the workspace sees.">
                <SettingsRow label="Name" hint="Shown in the sidebar." htmlFor="ui-gallery-name">
                  <input id="ui-gallery-name" className={INPUT} defaultValue="Acme Inc" />
                </SettingsRow>
                <SettingsRow label="Slug">
                  <span className={`${TYPE.body} ${CODE}`}>acme-inc</span>
                </SettingsRow>
              </SettingsSection>
              <SettingsSection
                title="Catalogue"
                list="Products"
                action={
                  <button type="button" className={BUTTON}>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Add product
                  </button>
                }
              >
                <ListRow title="Product A" meta={<MetaParts parts={['5 customers', 'Visible in pickers']} />} />
                <ListRow title="Legacy suite" trailing={<Badge>Retired</Badge>} />
              </SettingsSection>
              <SettingsSection title="Currency">
                <SettingsRow label="Base currency" htmlFor="ui-gallery-currency">
                  <Select
                    label="Base currency"
                    labelPosition="external"
                    id="ui-gallery-currency"
                    value="usd"
                    onChange={noop}
                    options={[
                      { value: 'usd', label: 'USD' },
                      { value: 'inr', label: 'INR' },
                    ]}
                  />
                </SettingsRow>
              </SettingsSection>
              <SettingsSection title="Quiet hours" description="Two columns: the title and note, then the controls.">
                <SettingsRow label="Weekly digest">
                  <Switch checked={digest} onChange={setDigest}>
                    Send on Mondays
                  </Switch>
                </SettingsRow>
                <SettingsRow label="Reminder after" htmlFor="ui-gallery-days">
                  <input id="ui-gallery-days" type="number" className={`${INPUT} ${NUM}`} defaultValue={3} />
                </SettingsRow>
                <SettingsRow label="Days">
                  <DayChips label="Send on" days={DAYS} value={days} onChange={setDays} />
                </SettingsRow>
              </SettingsSection>
              <SettingsSection title="Delete workspace" variant="danger" description="This cannot be undone.">
                <SettingsRow label="Delete">
                  <button type="button" className={DANGER}>Delete workspace</button>
                </SettingsRow>
              </SettingsSection>
              <SettingsSection title="Exchange rates" state={<LoadingState label="Loading exchange rates" variant="rows" count={2} />} />
            </SettingsFrame>
            <div className="mt-6 flex flex-col gap-3">
              <Banner>Imports run overnight, so new rows appear tomorrow.</Banner>
              <Banner tone="warning" action={<button type="button" className={BUTTON}>Fix</button>}>
                Slack is disconnected, so briefs are not being sent.
              </Banner>
            </div>
            <ToastProvider>
              <ToastDemo />
            </ToastProvider>
          </Section>
        </PageBody>
      </main>
    </div>
  );
}
