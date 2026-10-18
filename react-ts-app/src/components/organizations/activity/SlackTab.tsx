import { useState } from 'react';
import { Plus, MoreHorizontal, CornerDownRight, Hash, Smile, Frown, Meh, X, ChevronDown, ChevronRight, CheckCircle2, Sparkles, Star, Maximize2, Minimize2 } from 'lucide-react';

export interface SlackMessage {
  id: number;
  orgId: number;
  title: string;
  summary: string;
  dateStr: string;
  timeStr: string;
  group: string;
  replies: number;
  tags: string[];
  sentiment: 'positive' | 'negative' | 'neutral';
}

const SLACK_DATA: SlackMessage[] = [
  {
    id: 1,
    orgId: 1,
    group: '21 Jan 2026',
    title: 'SFTP data feed implementation facing technical and timeline challenges',
    summary: 'The team is working on setting up an SFTP data feed with key-based authentication, encountering connection errors and tight leadership expectations. Technical details include support for ED25519 keys, potential PGP encryption, and IP allowlisting.',
    dateStr: 'Jan 21st',
    timeStr: '9:23 AM',
    replies: 3,
    tags: ['Product', 'Integrations', 'Webhooks & APIs'],
    sentiment: 'negative'
  },
  {
    id: 2,
    orgId: 1,
    group: '21 Jan 2026',
    title: 'Developing secure SSO framework and authentication flows',
    summary: 'Engineering has successfully mapped out the preliminary SAML/SSO architecture. Need further clarification on user provisioning and default role assignments before pushing the final spec for review.',
    dateStr: 'Jan 21st',
    timeStr: '9:21 AM',
    replies: 0,
    tags: ['Security', 'Identity'],
    sentiment: 'positive'
  }
];

export function SlackTab({ entityId }: { entityId: number | string }) {
  const items = SLACK_DATA.filter(t => t.orgId == entityId);
  const [selectedItem, setSelectedItem] = useState<SlackMessage | null>(null);

  const grouped = items.reduce<Record<string, SlackMessage[]>>((acc, item) => {
    if (!acc[item.group]) acc[item.group] = [];
    acc[item.group].push(item);
    return acc;
  }, {});

  const sortedGroups = Object.entries(grouped);

  return (
    <div className="flex-1 flex bg-surface overflow-hidden font-sans">
      <div className="flex-1 flex flex-col min-w-0">
      
      {/* Search Header / Filter Pill */}
      <div className="px-6 py-4 border-b border-line-subtle flex items-center gap-1.5 shrink-0 bg-surface z-10 w-full relative">
        <div className="relative group/channel">
          <button className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-dim/80 text-accent hover:bg-accent-dim/80 rounded-[6px] transition-colors font-bold">
            <span className="text-[13px] tracking-tight">All-Trialenvonboarding</span>
            <MoreHorizontal className="w-[15px] h-[15px] ml-1 opacity-90 stroke-[2.5px]" />
          </button>
          {/* Remove Channel Tooltip/Dropdown */}
          <div className="absolute top-[38px] left-[70%] opacity-0 invisible group-hover/channel:visible group-hover/channel:opacity-100 transition-all z-20 shadow-[0_4px_12px_rgba(0,0,0,0.1)] bg-surface border border-line-subtle rounded-md py-[7px] px-3 min-w-[130px] w-auto whitespace-nowrap text-[12.5px] font-bold text-ink-muted pointer-events-none hover:bg-subtle cursor-pointer">
            Remove channel
          </div>
        </div>
        
        <div className="relative group/add flex items-center justify-center ml-2">
          <button className="w-[22px] h-[22px] rounded-full bg-accent hover:bg-accent text-white flex items-center justify-center transition-colors shadow-sm">
            <Plus className="w-[13px] h-[13px] stroke-[3px]" />
          </button>
          {/* Add Channel Tooltip */}
          <div className="absolute -top-[36px] left-1/2 -translate-x-1/2 opacity-0 invisible group-hover/add:visible group-hover/add:opacity-100 transition-all z-20 bg-[#2C2C2C] text-gray-100 tracking-tight text-[11.5px] font-bold whitespace-nowrap px-3 py-[5px] rounded-md shadow-lg pointer-events-none">
            Add a slack channel
            <div className="absolute -bottom-[4px] left-1/2 -translate-x-1/2 border-l-[6px] border-r-[6px] border-t-[5px] border-l-transparent border-r-transparent border-t-[#2C2C2C] w-0 h-0"></div>
          </div>
        </div>
      </div>

      {/* Main Content Scroll Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-6 md:px-8 py-6 relative">
        
        {/* Timeline Area */}
        <div className="relative">
          {/* Global Timeline Vertical Line */}
          {items.length > 0 && <div className="absolute left-[11px] top-8 bottom-0 w-[2px] bg-accent-dim z-0 rounded-full"></div>}

          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 opacity-40">
              <Hash className="w-10 h-10 text-ink-faint mb-2" />
              <span className="text-sm font-semibold text-ink-faint">No Slack threads found</span>
            </div>
          ) : (
            sortedGroups.map(([group, groupItems]) => (
              <div key={group} className="relative z-10 mb-8 pl-0">
                {/* Group Date Pill */}
                <div className="mb-6 inline-block bg-subtle rounded-full px-3.5 py-1 text-[11px] font-extrabold text-ink-muted shadow-[0_1px_2px_rgba(0,0,0,0.02)] relative z-10 ml-[2px]">
                  {group}
                </div>
                
                <div className="flex flex-col gap-6">
                  {groupItems.map((item) => (
                    <SlackCard key={item.id} item={item} isSelected={selectedItem?.id === item.id} onClick={() => setSelectedItem(item)} />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

      </div>
      </div>

      {/* Slide-in Thread Summary Panel */}
      {selectedItem && (
        <div
          className="w-[380px] shrink-0 bg-surface h-full shadow-[-4px_0_24px_rgba(0,0,0,0.06)] z-20 border-l border-line-subtle flex flex-col"
          style={{ animation: 'slideInRight 0.3s cubic-bezier(0.4,0,0.2,1)' }}
        >
          <SlackPanel item={selectedItem} onClose={() => setSelectedItem(null)} />
        </div>
      )}

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);   opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function SlackCard({ item, isSelected, onClick }: { item: SlackMessage; isSelected: boolean; onClick: () => void }) {
  const getSentimentIcon = () => {
    switch(item.sentiment) {
      case 'negative': return <Frown className="w-4 h-4 text-danger" strokeWidth={2.5} />;
      case 'positive': return <Smile className="w-4 h-4 text-success" strokeWidth={2.5} />;
      case 'neutral': return <Meh className="w-4 h-4 text-warning" strokeWidth={2.5} />;
      default: return null;
    }
  };

  return (
    <div
      className={`relative flex items-start gap-4 z-10 group cursor-pointer`}
      onClick={onClick}
    >
      {/* Timeline Icon */}
      <div className={`w-[24px] h-[24px] rounded-full bg-surface border-2 flex items-center justify-center shrink-0 mt-3 relative z-10 shadow-sm transition-colors ${isSelected ? 'border-accent text-accent' : 'border-accent/50 text-ink-faint'}`}>
        <Hash className="w-3.5 h-3.5 opacity-90" strokeWidth={2.5} />
      </div>

      {/* Main card content */}
      <div className={`flex-1 bg-surface border rounded-xl p-[18px] shadow-sm hover:shadow-md transition-all duration-200 flex flex-col gap-2.5 ${isSelected ? 'border-accent/50 bg-accent-dim/30 ring-1 ring-accent/20' : 'border-line/80 group-hover:border-accent/30'}`}>
        
        {/* Card Header */}
        <div className="flex items-start justify-between gap-4">
          <h4 className="text-[14px] font-bold text-ink leading-snug flex-1">
            {item.title}
          </h4>
          <div className="flex items-center gap-2.5 shrink-0 pt-0.5">
            {getSentimentIcon()}
            <span className="text-[12px] font-semibold text-ink-muted">{item.dateStr} {item.timeStr}</span>
            <button className="p-0.5 rounded text-ink-faint hover:text-ink-muted transition-colors">
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Card Body */}
        <p className="text-[13px] text-ink-muted/90 leading-relaxed font-medium">
          {item.summary}
        </p>

        {/* Card Footer */}
        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
          {/* Replies */}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-line bg-subtle/50 text-ink-muted">
            <CornerDownRight className="w-3.5 h-3.5 opacity-70" />
            <span className="text-[12px] font-bold">{item.replies}</span>
          </div>

          {/* Tags */}
          {item.tags.map(tag => (
            <div key={tag} className="px-2 py-1 rounded bg-accent-dim/60 text-accent text-[11px] font-bold tracking-tight">
              {tag}
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}

function UserAvatar({ name, color = 'orange' }: { name: string; color?: 'orange' | 'blue' | 'green' }) {
  const colorMap = { orange: 'bg-warning', blue: 'bg-info', green: 'bg-success' };
  return (
    <div className={`w-7 h-7 rounded-full ${colorMap[color]} flex items-center justify-center text-white text-[12px] font-bold shrink-0`}>
      {name[0].toUpperCase()}
    </div>
  );
}

function SlackPanel({ item, onClose }: { item: SlackMessage; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<'details' | 'ai'>('details');
  const [isExpanded, setIsExpanded] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    summary: true, actions: true, completedActions: true, participants: true
  });
  const toggle = (key: string) => setOpenSections(p => ({ ...p, [key]: !p[key] }));

  const getSentimentEmoji = () => {
    switch (item.sentiment) {
      case 'positive': return <Smile className="w-5 h-5 text-success" strokeWidth={2} />;
      case 'negative': return <Frown className="w-5 h-5 text-danger" strokeWidth={2} />;
      default: return <Meh className="w-5 h-5 text-warning" strokeWidth={2} />;
    }
  };

  const panelContent = (
    <div className="flex flex-col h-full bg-surface">
      {/* Tab Header — matches CallSense pattern exactly */}
      <div className="px-4 pt-3 pb-0 border-b border-line-subtle flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab('details')}
            className={`px-3 pb-3 text-[13px] font-bold border-b-2 transition-colors relative top-[1px] ${
              activeTab === 'details' ? 'text-ink border-accent' : 'text-ink-faint border-transparent hover:text-ink-muted'
            }`}
          >
            Activity Details
          </button>
          <button
            onClick={() => setActiveTab('ai')}
            className={`px-3 pb-3 text-[13px] font-bold border-b-2 transition-colors relative top-[1px] flex items-center gap-1.5 ${
              activeTab === 'ai' ? 'text-ink border-accent' : 'text-ink-faint border-transparent hover:text-ink-muted'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            AI items
          </button>
        </div>
        <div className="flex items-center gap-1 pb-2 text-ink-faint">
          <button onClick={() => setIsExpanded(e => !e)} className="p-1.5 hover:bg-subtle rounded-lg transition-colors">
            {isExpanded ? <Minimize2 className="w-[15px] h-[15px]" /> : <Maximize2 className="w-[15px] h-[15px]" />}
          </button>
          <button className="p-1.5 hover:bg-subtle rounded-lg transition-colors"><Star className="w-[15px] h-[15px]" /></button>
          <button onClick={onClose} className="p-1.5 hover:bg-danger-dim hover:text-danger rounded-lg transition-colors"><X className="w-4 h-4" /></button>
        </div>
      </div>

      {/* Thread meta row */}
      <div className="px-4 py-3 border-b border-line-subtle flex items-center gap-3 shrink-0 bg-subtle/40">
        <h4 className="text-[13px] font-extrabold text-ink flex-1 truncate">{item.title}</h4>
        {getSentimentEmoji()}
        <span className="text-[12px] font-semibold text-ink-muted shrink-0">{item.dateStr} {item.timeStr}</span>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {activeTab === 'details' ? (
          <div className="p-4 flex flex-col gap-4 text-[12.5px]">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-[11px] font-bold text-ink-faint uppercase tracking-widest mb-1">Channel</div>
                <div className="font-bold text-ink-muted">All-Trialenvonboarding</div>
              </div>
              <div>
                <div className="text-[11px] font-bold text-ink-faint uppercase tracking-widest mb-1">Sentiment</div>
                <div className="font-bold text-ink-muted capitalize">{item.sentiment}</div>
              </div>
              <div>
                <div className="text-[11px] font-bold text-ink-faint uppercase tracking-widest mb-1">Date</div>
                <div className="font-bold text-ink-muted">{item.dateStr}</div>
              </div>
              <div>
                <div className="text-[11px] font-bold text-ink-faint uppercase tracking-widest mb-1">Time</div>
                <div className="font-bold text-ink-muted">{item.timeStr}</div>
              </div>
              <div>
                <div className="text-[11px] font-bold text-ink-faint uppercase tracking-widest mb-1">Replies</div>
                <div className="font-bold text-ink-muted">{item.replies}</div>
              </div>
            </div>
            <div>
              <div className="text-[11px] font-bold text-ink-faint uppercase tracking-widest mb-2">Tags</div>
              <div className="flex flex-wrap gap-2">
                {item.tags.map(tag => (
                  <span key={tag} className="px-2.5 py-1 rounded-md bg-accent-dim text-accent text-[11.5px] font-bold">{tag}</span>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-bold text-ink-faint uppercase tracking-widest mb-2">Summary</div>
              <p className="leading-[1.7] text-ink-muted font-medium">{item.summary}</p>
            </div>
          </div>
        ) : (
          <div className="p-4 flex flex-col gap-3">

            {/* Summary */}
            <div className="border border-line rounded-lg overflow-hidden bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
              <div onClick={() => toggle('summary')} className={`px-4 py-3 flex items-center gap-2 cursor-pointer hover:bg-subtle/50 transition-colors ${openSections.summary ? 'bg-subtle/50 border-b border-line' : ''}`}>
                {openSections.summary ? <ChevronDown className="w-3.5 h-3.5 text-accent" strokeWidth={3} /> : <ChevronRight className="w-3.5 h-3.5 text-accent" strokeWidth={3} />}
                <span className="text-[13px] font-bold text-accent select-none">Summary</span>
              </div>
              {openSections.summary && (
                <div className="p-4">
                  <p className="text-[12.5px] leading-[1.7] text-ink-muted font-medium">{item.summary}</p>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="border border-line rounded-lg overflow-hidden bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
              <div onClick={() => toggle('actions')} className={`px-4 py-3 flex items-center gap-2 cursor-pointer hover:bg-subtle/50 transition-colors ${openSections.actions ? 'bg-subtle/50 border-b border-line' : ''}`}>
                {openSections.actions ? <ChevronDown className="w-3.5 h-3.5 text-accent" strokeWidth={3} /> : <ChevronRight className="w-3.5 h-3.5 text-accent" strokeWidth={3} />}
                <span className="text-[13px] font-bold text-accent select-none">Actions</span>
              </div>
              {openSections.actions && (
                <div className="p-3 flex flex-col gap-2.5">
                  <div className="flex items-center justify-between gap-3 bg-surface border border-line-subtle rounded-lg p-3 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full border-2 border-line-strong flex items-center justify-center text-[11px] font-bold text-ink-muted shrink-0">1</div>
                      <span className="text-[12.5px] font-semibold text-ink-muted">Define pilot cohort and adoption KPIs</span>
                    </div>
                    <UserAvatar name="aaron.daniel" color="orange" />
                  </div>
                  <div className="flex items-center justify-between gap-3 bg-surface border border-line-subtle rounded-lg p-3 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full border-2 border-line-strong flex items-center justify-center text-[11px] font-bold text-ink-muted shrink-0">2</div>
                      <span className="text-[12.5px] font-semibold text-ink-muted">Align on product "go-live" definition</span>
                    </div>
                    <UserAvatar name="aaron.daniel" color="orange" />
                  </div>
                </div>
              )}
            </div>

            {/* Completed Actions */}
            <div className="border border-line rounded-lg overflow-hidden bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
              <div onClick={() => toggle('completedActions')} className={`px-4 py-3 flex items-center gap-2 cursor-pointer hover:bg-subtle/50 transition-colors ${openSections.completedActions ? 'bg-subtle/50 border-b border-line' : ''}`}>
                {openSections.completedActions ? <ChevronDown className="w-3.5 h-3.5 text-accent" strokeWidth={3} /> : <ChevronRight className="w-3.5 h-3.5 text-accent" strokeWidth={3} />}
                <span className="text-[13px] font-bold text-accent select-none">Completed Actions</span>
              </div>
              {openSections.completedActions && (
                <div className="p-3">
                  <div className="flex items-center justify-between gap-3 bg-surface border border-line-subtle rounded-lg p-3 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="w-6 h-6 text-success shrink-0" strokeWidth={2.5} />
                      <span className="text-[12.5px] font-semibold text-ink-muted">Finalize onboarding plan template</span>
                    </div>
                    <UserAvatar name="aaron.daniel" color="orange" />
                  </div>
                </div>
              )}
            </div>

            {/* Participants */}
            <div className="border border-line rounded-lg overflow-hidden bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
              <div onClick={() => toggle('participants')} className={`px-4 py-3 flex items-center gap-2 cursor-pointer hover:bg-subtle/50 transition-colors ${openSections.participants ? 'bg-subtle/50 border-b border-line' : ''}`}>
                {openSections.participants ? <ChevronDown className="w-3.5 h-3.5 text-accent" strokeWidth={3} /> : <ChevronRight className="w-3.5 h-3.5 text-accent" strokeWidth={3} />}
                <span className="text-[13px] font-bold text-accent select-none">Participants</span>
              </div>
              {openSections.participants && (
                <div className="p-4 flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[12.5px] text-ink-muted font-semibold">Assignee</span>
                    <div className="flex items-center gap-2">
                      <UserAvatar name="aaron.daniel" color="orange" />
                      <span className="text-[12.5px] font-semibold text-ink-muted">aaron.daniel</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[12.5px] text-ink-muted font-semibold">Reporter</span>
                    <div className="flex items-center gap-2">
                      <UserAvatar name="Ridma" color="blue" />
                      <span className="text-[12.5px] font-semibold text-ink-muted">Ridma</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  );

  if (isExpanded) {
    return (
      <div
        className="fixed inset-0 z-[100] bg-gray-900/60 flex items-center justify-center p-6 sm:p-12 backdrop-blur-sm"
        onClick={() => setIsExpanded(false)}
        style={{ animation: 'fadeIn 0.2s ease-out' }}
      >
        <div
          className="bg-surface rounded-xl shadow-2xl w-full max-w-[900px] h-[85vh] max-h-[800px] flex flex-col overflow-hidden"
          onClick={e => e.stopPropagation()}
          style={{ animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)' }}
        >
          {panelContent}
        </div>
        <style>{`
          @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
          @keyframes slideUp { from { transform: translateY(20px) scale(0.98); opacity: 0; } to { transform: translateY(0) scale(1); opacity: 1; } }
        `}</style>
      </div>
    );
  }

  return panelContent;
}
