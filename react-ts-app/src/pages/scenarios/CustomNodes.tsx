import { memo } from 'react';
import { Handle, Position, useReactFlow } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { Zap, Split, Filter, Mail, Trash2, Edit2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Card, ICON_BUTTON, IconChip, TYPE } from '../../components/ui';
import { sentence } from './BuilderSidebar';
import type { ScenarioNodeData } from './types';

// A label the builder made from the action key ("Send Email", "New Send
// Email") is shown in sentence case like the key; one someone typed is
// shown as typed. Display only: the stored data is unchanged.
const shown = (label = '', action = '') => (label === action || label === `New ${action}` ? sentence(label) : label);

// Common node container: a bordered card on the canvas, every kind alike
// (the header says which kind it is). The floating controls show on hover,
// on focus inside and on touch, so a keyboard or a finger reaches them.
const NodeContainer = ({ header, icon, isSelected, data, onDelete, onEdit }: { header: string, icon: LucideIcon, isSelected: boolean, data: ScenarioNodeData, onDelete?: () => void, onEdit?: () => void }) => {
  const label = shown(data.label, data.action);
  return (
  <Card as="div" pad="none" selected={isSelected} className="group relative min-w-[280px]">
    {/* Floating controls */}
    <div className="absolute -right-12 top-0 flex flex-col gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onEdit?.(); }}
        className={`${ICON_BUTTON} border border-line bg-surface`}
        aria-label={`Edit ${label}`}
      >
        <Edit2 className="h-4 w-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onDelete?.(); }}
        className={`${ICON_BUTTON} border border-line bg-surface`}
        aria-label={`Delete ${label}`}
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>

    {/* Node header */}
    <div className="flex flex-col items-center justify-center border-b border-line-subtle px-3 py-1.5">
      <span className={TYPE.meta}>{header}</span>
    </div>

    {/* Node body */}
    <div className="flex items-center gap-3 px-4 py-3">
      <IconChip icon={icon} />
      <span className={`${TYPE.bodyMuted} font-semibold`}>
        <span className="mr-1 font-normal">{sentence(data.action)}:</span>
        {label}
      </span>
    </div>
  </Card>
  );
};

export const EntryNode = memo(({ id, data, selected }: NodeProps) => {
  const { setNodes, setEdges } = useReactFlow();
  const onDelete = () => {
    setNodes((nds) => nds.filter((n) => n.id !== id));
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
  };
  
  // Custom event to trigger edit pane in parent
  const onEdit = () => {
    const event = new CustomEvent('edit-node', { detail: { id, data, type: 'entry' } });
    window.dispatchEvent(event);
  };
  
  const nodeData = data as ScenarioNodeData;
  
  return (
    <>
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <NodeContainer 
        header="Entry criteria"
        icon={Zap}
        isSelected={!!selected}
        data={nodeData}
        onDelete={onDelete}
        onEdit={onEdit}
      />
      <Handle 
        type="source" 
        position={Position.Bottom} 
        className="!w-4 !h-4 !bg-surface !border-2 !border-line !rounded-full !flex !items-center !justify-center !-bottom-2 !z-50 hover:!border-accent"
      >
        <div className="w-1.5 h-1.5 bg-line-strong rounded-full pointer-events-none" />
      </Handle>
    </>
  );
});

export const OperatorNode = memo(({ id, data, selected }: NodeProps) => {
  const { setNodes, setEdges } = useReactFlow();
  const onDelete = () => {
    setNodes((nds) => nds.filter((n) => n.id !== id));
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
  };
  
  const onEdit = () => {
    const event = new CustomEvent('edit-node', { detail: { id, data, type: 'operator' } });
    window.dispatchEvent(event);
  };

  const nodeData = data as ScenarioNodeData;
  const isCondition = nodeData.action === 'Condition';
  return (
    <>
      <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-[var(--accent)] !-top-1 !z-50" />
      <NodeContainer 
        header="Operator"
        icon={isCondition ? Split : Filter}
        isSelected={!!selected}
        data={nodeData}
        onDelete={onDelete}
        onEdit={onEdit}
      />
      
      {isCondition ? (
        <>
          <div className="absolute -bottom-8 left-[25%] flex flex-col items-center">
            <span className={`mb-1 ${TYPE.meta} font-semibold`}>No</span>
            <Handle 
              type="source" 
              position={Position.Bottom} 
              id="no" 
              className="!w-3 !h-3 !bg-ink-muted !z-50"
            />
          </div>
          <div className="absolute -bottom-8 right-[25%] flex flex-col items-center">
            <span className={`mb-1 ${TYPE.meta} font-semibold`}>Yes</span>
            <Handle 
              type="source" 
              position={Position.Bottom} 
              id="yes" 
              className="!w-3 !h-3 !bg-ink-muted !z-50"
            />
          </div>
        </>
      ) : (
        <Handle 
          type="source" 
          position={Position.Bottom} 
          className="!w-4 !h-4 !bg-surface !border-2 !border-line !rounded-full !flex !items-center !justify-center !-bottom-2 !z-50 hover:!border-accent"
        >
          <div className="w-1.5 h-1.5 bg-line-strong rounded-full pointer-events-none" />
        </Handle>
      )}
    </>
  );
});

export const ActionNode = memo(({ id, data, selected }: NodeProps) => {
  const { setNodes, setEdges } = useReactFlow();
  const onDelete = () => {
    setNodes((nds) => nds.filter((n) => n.id !== id));
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
  };

  const onEdit = () => {
    const event = new CustomEvent('edit-node', { detail: { id, data, type: 'action' } });
    window.dispatchEvent(event);
  };

  const nodeData = data as ScenarioNodeData;

  return (
    <>
      <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-[var(--accent)] !-top-1 !z-50" />
      <NodeContainer 
        header="Action"
        icon={Mail}
        isSelected={!!selected}
        data={nodeData}
        onDelete={onDelete}
        onEdit={onEdit}
      />
      <Handle 
        type="source" 
        position={Position.Bottom} 
        className="!w-4 !h-4 !bg-surface !border-2 !border-line !rounded-full !flex !items-center !justify-center !-bottom-2 !z-50 hover:!border-accent"
      >
        <div className="w-1.5 h-1.5 bg-line-strong rounded-full pointer-events-none" />
      </Handle>
    </>
  );
});
