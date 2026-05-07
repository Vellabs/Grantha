import { Handle, Position } from '@xyflow/react';
import { memo } from 'react';
import { ChevronDown, ChevronRight, FileText, Share2 } from 'lucide-react';

interface ResearchNodeProps {
  data: {
    label: string;
    description?: string;
    isSelected: boolean;
    isHighlighted: boolean;
    isGhosted: boolean;
    connections: number;
    expanded?: boolean;
    hasChildren?: boolean;
    onToggleExpand?: (e: React.MouseEvent) => void;
  };
}

export const ResearchNode = memo(({ data }: ResearchNodeProps) => {
  return (
    <div 
      className={`research-card ${data.isSelected ? 'selected' : ''} ${data.isHighlighted ? 'highlighted' : ''} ${data.isGhosted ? 'ghosted' : ''}`}
    >
      <Handle type="target" position={Position.Left} className="card-handle" />
      
      <div className="card-content">
        <div className="card-header">
          <div className="card-icon">
            <FileText size={16} />
          </div>
          <div className="card-title-wrapper">
            <h3 className="card-title">{data.label}</h3>
            {data.description && <p className="card-description">{data.description}</p>}
          </div>
        </div>

        <div className="card-footer">
          <div className="card-meta">
            <span className="connection-badge">
              <Share2 size={10} />
              {data.connections || 0}
            </span>
          </div>
          
          {data.hasChildren && (
            <button 
              onClick={data.onToggleExpand}
              className={`card-expand-btn ${data.expanded ? 'expanded' : ''}`}
            >
              {data.expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <span>{data.expanded ? 'Collapse' : 'Expand'}</span>
            </button>
          )}
        </div>
      </div>
      
      <Handle type="source" position={Position.Right} className="card-handle" />
    </div>
  );
});
