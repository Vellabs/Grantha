import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  Node as FlowNode,
  Edge as FlowEdge,
  MarkerType,
  ReactFlowProvider,
  useReactFlow,
  OnNodesChange,
  applyNodeChanges,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Node, useStore } from './store';
import { ResearchNode } from './ResearchNode';
import dagre from 'dagre';

interface KnowledgeGraphProps {
  nodes: Node[];
  edges: { id: string; source: string; target: string; label?: string }[];
  onNodeClick: (node: Node) => void;
  selectedNodeId?: string | null;
}

const nodeTypes = {
  research: ResearchNode,
};

const NODE_WIDTH = 260;
const NODE_HEIGHT = 100;

const getLayoutedElements = (nodes: FlowNode[], edges: FlowEdge[]) => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  // Left-to-Right layout is better for card-style nodes
  dagreGraph.setGraph({ rankdir: 'LR', nodesep: 100, ranksep: 140 });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - NODE_WIDTH / 2,
        y: nodeWithPosition.y - NODE_HEIGHT / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
};

export function KnowledgeGraph(props: KnowledgeGraphProps) {
  return (
    <ReactFlowProvider>
      <KnowledgeGraphInner {...props} />
    </ReactFlowProvider>
  );
}

function KnowledgeGraphInner({ nodes: rawNodes, edges: rawEdges, onNodeClick, selectedNodeId }: KnowledgeGraphProps) {
  const [layoutNodes, setLayoutNodes] = useState<FlowNode[]>([]);
  const [layoutEdges, setLayoutEdges] = useState<FlowEdge[]>([]);
  const { fitView } = useReactFlow();
  const toggleNodeExpansion = useStore(state => state.toggleNodeExpansion);
  const updateNodePositions = useStore(state => state.updateNodePositions);
  const fullNodes = useStore(state => state.nodes);
  const fullEdges = useStore(state => state.edges);
  const currentQuery = useStore(state => state.query);
  
  const lastQueryRef = useRef<string>('');
  const isFirstRender = useRef(true);

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => {
      setLayoutNodes((nds) => {
        const updatedNodes = applyNodeChanges(changes, nds);
        
        // Sync position changes back to store
        const positionChanges = changes
          .filter(c => c.type === 'position' && c.position)
          .map(c => ({ 
            id: (c as any).id, 
            position: (c as any).position 
          }));
        
        if (positionChanges.length > 0) {
          updateNodePositions(positionChanges);
        }
        
        return updatedNodes;
      });
    },
    [updateNodePositions]
  );

  // Find ancestor and descendant IDs for highlighting
  const { highlightedIds, ghostedIds } = useMemo(() => {
    if (!selectedNodeId) return { highlightedIds: new Set<string>(), ghostedIds: new Set<string>() };

    const highlighted = new Set<string>([selectedNodeId]);
    
    // Build adjacency for BFS
    const childrenMap = new Map<string, string[]>();
    const parentsMap = new Map<string, string[]>();
    (rawEdges as any[]).forEach(e => {
      if (!childrenMap.has(e.source)) childrenMap.set(e.source, []);
      childrenMap.get(e.source)!.push(e.target);
      if (!parentsMap.has(e.target)) parentsMap.set(e.target, []);
      parentsMap.get(e.target)!.push(e.source);
    });

    // BFS for descendants
    const descQueue = [selectedNodeId];
    while (descQueue.length > 0) {
      const curr = descQueue.shift()!;
      (childrenMap.get(curr) || []).forEach(child => {
        if (!highlighted.has(child)) {
          highlighted.add(child);
          descQueue.push(child);
        }
      });
    }

    // BFS for ancestors
    const ancQueue = [selectedNodeId];
    while (ancQueue.length > 0) {
      const curr = ancQueue.shift()!;
      (parentsMap.get(curr) || []).forEach(parent => {
        if (!highlighted.has(parent)) {
          highlighted.add(parent);
          ancQueue.push(parent);
        }
      });
    }

    const ghosted = new Set<string>();
    (rawNodes as Node[]).forEach(n => {
      if (!highlighted.has(n.id)) {
        ghosted.add(n.id);
      }
    });

    return { highlightedIds: highlighted, ghostedIds: ghosted };
  }, [selectedNodeId, rawNodes, rawEdges]);

  // Initial layout calculation when nodes/edges change
  useEffect(() => {
    if (rawNodes.length === 0) {
        setLayoutNodes([]);
        setLayoutEdges([]);
        return;
    }

    const queryChanged = currentQuery !== lastQueryRef.current;
    lastQueryRef.current = currentQuery;

    const connectionCount = (rawNodes as Node[]).reduce((acc, node) => {
      acc[node.id] = (rawEdges as any[]).filter(e => e.source === node.id || e.target === node.id).length;
      return acc;
    }, {} as Record<string, number>);

    // 2. Determine which nodes should be visible
    const visibleIds = new Set(rawNodes.map(n => n.id));
    const initialFlowNodes: FlowNode[] = (rawNodes as Node[]).map((n) => {
      const fullN = fullNodes.find(fn => fn.id === n.id);
      const hasChildren = fullEdges.some(e => e.source === n.id);
      
      return {
        id: n.id,
        type: 'research',
        data: { 
          label: n.label || '',
          description: n.description,
          isSelected: n.id === selectedNodeId,
          isGhosted: false,
          isHighlighted: false,
          connections: connectionCount[n.id] || 0,
          expanded: fullN?.expanded || false,
          hasChildren,
          onToggleExpand: (e: React.MouseEvent) => {
            e.stopPropagation();
            toggleNodeExpansion(n.id);
          }
        },
        position: n.position || fullN?.position || { x: 0, y: 0 },
      };
    });

    const initialFlowEdges: FlowEdge[] = (rawEdges as any[])
      .filter(e => visibleIds.has(e.source) && visibleIds.has(e.target))
      .map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        type: 'bezier',
        markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--accent-primary)', width: 20, height: 20 },
        style: { strokeWidth: 1.5, stroke: 'var(--border-color)' },
      }));

    // Only run dagre layout if we don't have positions for some visible nodes or if query changed
    // We treat {0,0} as "needs layout" unless it's the very first node
    const needsLayout = initialFlowNodes.some((n, i) => i > 0 && (!n.position || (n.position.x === 0 && n.position.y === 0)));
    
    // Check if number of nodes increased - might need a layout adjustment
    const nodeCountIncreased = initialFlowNodes.length > layoutNodes.length && layoutNodes.length > 0;

    if (needsLayout || queryChanged || (nodeCountIncreased && layoutNodes.length < 5)) {
      const { nodes: lNodes, edges: lEdges } = getLayoutedElements(initialFlowNodes, initialFlowEdges);
      setLayoutNodes(lNodes);
      setLayoutEdges(lEdges);
      
      // Update store with these initial positions
      updateNodePositions(lNodes.map(n => ({ id: n.id, position: n.position })));
    } else {
      setLayoutNodes(initialFlowNodes);
      setLayoutEdges(initialFlowEdges);
    }

    if (isFirstRender.current) {
      window.requestAnimationFrame(() => {
        fitView({ duration: 600, padding: 0.2 });
      });
      isFirstRender.current = false;
    }
  }, [rawNodes, rawEdges, fullNodes, fullEdges, toggleNodeExpansion, updateNodePositions, selectedNodeId, fitView, currentQuery]);

  // Apply highlighting/ghosting updates
  useEffect(() => {
    setLayoutNodes((nds) => nds.map((node) => ({
      ...node,
      data: {
        ...node.data,
        isSelected: node.id === selectedNodeId,
        isHighlighted: highlightedIds.has(node.id),
        isGhosted: ghostedIds.has(node.id),
      },
    })));

    setLayoutEdges((eds) => eds.map((edge) => {
      const isHighlighted = highlightedIds.has(edge.source) && highlightedIds.has(edge.target);
      return {
        ...edge,
        animated: isHighlighted,
        style: {
          ...edge.style,
          opacity: ghostedIds.size > 0 && !isHighlighted ? 0.15 : 1,
          stroke: isHighlighted ? 'var(--accent-primary)' : 'var(--border-color)',
          strokeWidth: isHighlighted ? 2.5 : 1.5,
        },
      };
    }));
  }, [selectedNodeId, highlightedIds, ghostedIds]);

  const onNodeClickInternal = useCallback((_e: any, node: FlowNode) => {
    const rawNode = (rawNodes as Node[]).find(n => n.id === node.id);
    if (rawNode) onNodeClick(rawNode);
  }, [rawNodes, onNodeClick]);

  return (
    <div className="graph-container">
      <ReactFlow
        nodes={layoutNodes}
        edges={layoutEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={onNodeClickInternal}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={1.5}
      >
        <Background color="var(--border-color)" gap={20} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
