import React, { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { AlertCircle, Bell, Calendar, CheckSquare, ChevronDown, ChevronRight, Clock, FileText, Filter, Hourglass, List, Mail, MessageCircle, Play, Settings, Share2, Split, UserCheck, Users, Zap } from 'lucide-react';
import { FOCUS, IconChip, TYPE } from '../../components/ui';

interface SidebarItemProps {
  type: string;
  label: string;
  icon: LucideIcon;
}

// The label is also the stored action key (EditNodePane and the engine read
// it), so only what is shown is put in sentence case (here and on a node).
// eslint-disable-next-line react-refresh/only-export-components
export const sentence = (label = '') => {
  if (label === 'MS Teams') return label;
  const [first, ...rest] = label.split(' ');
  return [first, ...rest.map((word) => word.toLowerCase())].join(' ');
};

const SidebarItem = ({ type, label, icon }: SidebarItemProps) => {
  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.setData('application/reactflow/label', label);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div
      className="flex min-h-11 cursor-grab items-center gap-3 rounded-lg border border-line px-3 py-2 hover:bg-subtle active:cursor-grabbing"
      onDragStart={(event) => onDragStart(event, type)}
      draggable
    >
      <IconChip icon={icon} />
      <span className={TYPE.body}>{sentence(label)}</span>
    </div>
  );
};

const Section = ({ title, children, defaultOpen = true }: { title: string, children: React.ReactNode, defaultOpen?: boolean }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className={`flex min-h-11 sm:min-h-9 items-center gap-2 px-1 ${TYPE.label} ${FOCUS}`}
      >
        {isOpen ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
        {title}
      </button>
      {isOpen && (
        <div className="flex flex-col gap-2 pl-1 mb-4">
          {children}
        </div>
      )}
    </div>
  );
};

export function BuilderSidebar() {
  return (
    <div className="w-[280px] h-full bg-surface border-r border-line-subtle flex flex-col p-4 overflow-y-auto">
      <h2 className={`mb-6 ${TYPE.title}`}>Builder</h2>

      <Section title="Triggers">
        <SidebarItem type="entry" label="Run Now" icon={Play} />
        <SidebarItem type="entry" label="Schedule" icon={Calendar} />
        <SidebarItem type="entry" label="On Event" icon={Zap} />
      </Section>

      <Section title="Operators">
        <SidebarItem type="operator" label="Wait" icon={Clock} />
        <SidebarItem type="operator" label="Conditional Wait" icon={Hourglass} />
        <SidebarItem type="operator" label="Condition" icon={Split} />
        <SidebarItem type="operator" label="Filter" icon={Filter} />
        <SidebarItem type="operator" label="End" icon={List} />
      </Section>

      <Section title="Actions">
        <SidebarItem type="action" label="Assign Playbook" icon={FileText} />
        <SidebarItem type="action" label="Create Task" icon={CheckSquare} />
        <SidebarItem type="action" label="Set Attribute" icon={Settings} />
        <SidebarItem type="action" label="Send Email" icon={Mail} />
        <SidebarItem type="action" label="Slack Message" icon={MessageCircle} />
        <SidebarItem type="action" label="Create Pipeline" icon={Share2} />
        <SidebarItem type="action" label="MS Teams" icon={Users} />
        <SidebarItem type="action" label="Send Survey" icon={List} />
        <SidebarItem type="action" label="Assign Owner" icon={UserCheck} />
        <SidebarItem type="action" label="Notify" icon={Bell} />
        <SidebarItem type="action" label="Churn Entity" icon={AlertCircle} />
      </Section>
    </div>
  );
}
