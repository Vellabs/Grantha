import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

export type AppView = 'search' | 'researching' | 'graph' | 'reader';

export interface Node {
  id: string;
  label: string;
  description?: string;
  parentId?: string;
  expanded?: boolean;
  position?: { x: number; y: number };
}

export interface Edge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

interface GranthaStore {
  appView: AppView;
  query: string;
  history: string[];
  nodes: Node[];
  edges: Edge[];
  visibleNodes: Node[];
  visibleEdges: Edge[];
  error: string | null;

  // Reader pane
  selectedNode: Node | null;
  readerContent: string | null;
  readerLoading: boolean;

  // Deep dive loading
  deepDiveLoading: boolean;

  // Actions
  startResearch: (query: string) => Promise<void>;
  viewHistory: (query: string) => Promise<void>;
  deepDiveNode: (node: Node) => Promise<void>;
  toggleNodeExpansion: (nodeId: string, forceState?: boolean) => void;
  selectNode: (node: Node | null) => void;
  loadArticle: (node: Node, refresh?: boolean) => Promise<void>;
  updateNodePositions: (positions: { id: string, position: { x: number, y: number } }[]) => void;
  loadFullGraph: (query: string, preserveVisibility?: boolean) => Promise<void>;
  loadHistory: () => Promise<void>;
  deleteHistoryItem: (query: string) => Promise<void>;
  reset: () => void;
}

// Throttled sync to backend
let syncTimeout: ReturnType<typeof setTimeout> | null = null;
const syncPositionsToBackend = (query: string, positions: { id: string, position: { x: number, y: number } }[]) => {
  if (syncTimeout) clearTimeout(syncTimeout);
  
  syncTimeout = setTimeout(() => {
    const nodesToSync = positions.map(p => ({
      id: p.id,
      label: '', 
      x: p.position.x,
      y: p.position.y
    }));

    invoke('update_node_positions', { query, nodes: nodesToSync }).catch(console.error);
    syncTimeout = null;
  }, 500); // 500ms debounce
};

export const useStore = create<GranthaStore>((set, get) => ({
  appView: 'search',
  query: '',
  history: [],
  nodes: [],
  edges: [],
  visibleNodes: [],
  visibleEdges: [],
  error: null,
  selectedNode: null,
  readerContent: null,
  readerLoading: false,
  deepDiveLoading: false,

  loadFullGraph: async (query: string, preserveVisibility: boolean = false) => {
    try {
      const data: { nodes: (Node & { x?: number, y?: number })[]; edges: Edge[] } = await invoke('load_full_graph', { query });
      if (!data || !data.nodes) {
        console.warn('Backend returned empty graph data');
        return;
      }

      if (data.nodes.length > 0) {
        const { nodes: currentNodes, visibleNodes: currentVisibleNodes } = get();
        
        // 1. Map existing expanded state and positions
        const nodeStateMap = new Map((currentNodes || []).map(n => [n.id, { expanded: !!n.expanded, position: n.position }]));
        const updatedNodes: Node[] = data.nodes.map(n => {
          const state = nodeStateMap.get(n.id);
          
          // Prioritize store position, then DB position, then undefined
          let position = state?.position;
          if (!position && n.x !== undefined && n.y !== undefined && n.x !== null && n.y !== null) {
            position = { x: n.x, y: n.y };
          }

          return {
            id: n.id,
            label: n.label,
            description: n.description,
            expanded: state?.expanded || false,
            position: position
          };
        });

        // 2. Determine which nodes should be visible
        let visibleNodeIds = new Set<string>();

        if (preserveVisibility && currentVisibleNodes.length > 0) {
          // Keep whatever was visible (if it still exists in the DB)
          currentVisibleNodes.forEach(vn => visibleNodeIds.add(vn.id));
        } else {
          // Default: only show roots
          const childIds = new Set(data.edges.map(e => e.target));
          const roots = data.nodes.filter(n => !childIds.has(n.id));
          roots.forEach(r => visibleNodeIds.add(r.id));
        }

        set({
          nodes: updatedNodes,
          edges: data.edges,
          visibleNodes: updatedNodes.filter(n => visibleNodeIds.has(n.id)),
          visibleEdges: data.edges.filter(e => 
            visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target)
          ),
        });
      }
    } catch (err) {
      console.error('Failed to load initial graph:', err);
    }
  },

  updateNodePositions: (positions) => {
    const { nodes, visibleNodes, query } = get();
    const posMap = new Map(positions.map(p => [p.id, p.position]));
    
    let hasChanged = false;
    const updatedNodes = nodes.map(n => {
      const newPos = posMap.get(n.id);
      if (newPos) {
        // Only update if change is > 0.5px to avoid jitter/loops
        const dx = Math.abs((n.position?.x || 0) - newPos.x);
        const dy = Math.abs((n.position?.y || 0) - newPos.y);
        if (dx > 0.5 || dy > 0.5) {
          hasChanged = true;
          return { ...n, position: newPos };
        }
      }
      return n;
    });

    if (!hasChanged) return;

    const updatedVisibleNodes = visibleNodes.map(n => {
      const newPos = posMap.get(n.id);
      if (newPos) {
        return { ...n, position: newPos };
      }
      return n;
    });

    set({
      nodes: updatedNodes,
      visibleNodes: updatedVisibleNodes
    });

    syncPositionsToBackend(query, positions);
  },

  toggleNodeExpansion: (nodeId: string, forceState?: boolean) => {
    const { nodes, edges, visibleNodes } = get();
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;

    const isExpanding = forceState !== undefined ? forceState : !node.expanded;
    
    // Update expanded state in full node list
    const updatedNodes = nodes.map(n => 
      n.id === nodeId ? { ...n, expanded: isExpanding } : n
    );

    if (isExpanding) {
      // Find direct children
      const childEdges = edges.filter(e => e.source === nodeId);
      const childIds = new Set(childEdges.map(e => e.target));
      const childrenNodes = nodes.filter(n => childIds.has(n.id));

      // Update visible nodes and edges
      const newVisibleNodes = [...visibleNodes];
      childrenNodes.forEach((child, index) => {
        if (!newVisibleNodes.find(vn => vn.id === child.id)) {
          // If child has no position, place it in a fan-out pattern to the right
          const childWithPos = { ...child, expanded: false };
          if (!child.position && node.position) {
            // Space out children vertically, place them to the right (LR layout)
            const verticalOffset = (index - (childrenNodes.length - 1) / 2) * 150;
            childWithPos.position = { 
              x: node.position.x + 300, 
              y: node.position.y + verticalOffset
            };
          }
          newVisibleNodes.push(childWithPos);
        }
      });

      const newVisibleEdges = edges.filter(e => 
        newVisibleNodes.some(vn => vn.id === e.source) && 
        newVisibleNodes.some(vn => vn.id === e.target)
      );

      set({ 
        nodes: updatedNodes,
        visibleNodes: newVisibleNodes,
        visibleEdges: newVisibleEdges 
      });
    } else {
      // Logic for collapsing could be complex (recursively hiding children)
      // For now, just mark as unexpanded, keep them visible. 
      // User said "cluttered", so maybe we SHOULD collapse?
      // Let's implement recursive collapse:
      
      const getAllDescendants = (id: string, allEdges: Edge[]): Set<string> => {
        const descendants = new Set<string>();
        const queue = [id];
        while (queue.length > 0) {
          const curr = queue.shift()!;
          allEdges.filter(e => e.source === curr).forEach(e => {
            if (!descendants.has(e.target)) {
              descendants.add(e.target);
              queue.push(e.target);
            }
          });
        }
        return descendants;
      };

      const toRemove = getAllDescendants(nodeId, edges);
      const newVisibleNodes = visibleNodes.filter(vn => !toRemove.has(vn.id));
      const newVisibleEdges = edges.filter(e => 
        newVisibleNodes.some(vn => vn.id === e.source) && 
        newVisibleNodes.some(vn => vn.id === e.target)
      );

      set({ 
        nodes: updatedNodes.map(n => toRemove.has(n.id) ? { ...n, expanded: false } : n),
        visibleNodes: newVisibleNodes,
        visibleEdges: newVisibleEdges
      });
    }
  },

  loadHistory: async () => {
    try {
      const history: string[] = await invoke('get_search_history');
      set({ history });
    } catch (err) {
      console.error('Failed to load history:', err);
    }
  },

  deleteHistoryItem: async (query) => {
    try {
      await invoke('delete_search_history', { query });
      await get().loadHistory();
    } catch (err) {
      console.error('Failed to delete history item:', err);
    }
  },

  startResearch: async (query) => {
    set({ query, appView: 'researching', error: null, selectedNode: null, readerContent: null });
    try {
      await invoke('perform_research', { query });
      await get().loadFullGraph(query, false);
      set({ appView: 'graph' });
    } catch (err) {
      console.error('Research failed:', err);
      set({ error: String(err), appView: 'search' });
    }
  },

  viewHistory: async (query) => {
    set({ query, appView: 'graph', error: null, selectedNode: null, readerContent: null });
    await get().loadFullGraph(query, false);
  },

  deepDiveNode: async (node) => {
    const currentQuery = get().query;
    // Close reader immediately and switch to graph view
    set({ deepDiveLoading: true, selectedNode: null, appView: 'graph' }); 
    try {
      await invoke('deep_dive_node', {
        topic: node.label,
        context: node.description || '',
        query: currentQuery,
        parentId: node.id,
      });

      // Reload graph to get new nodes/edges from DB while preserving visibility
      await get().loadFullGraph(currentQuery, true);
      
      // Force expansion of the node we dived into so new children appear
      get().toggleNodeExpansion(node.id, true);
      
      set({ deepDiveLoading: false });
    } catch (err) {
      console.error('Deep dive failed:', err);
      set({ deepDiveLoading: false });
    }
  },

  selectNode: (node) => {
    if (node) {
      set({ selectedNode: node, readerContent: null, appView: 'reader' });
      get().loadArticle(node, false);
    } else {
      set({ selectedNode: null, readerContent: null, appView: 'graph' });
    }
  },

  loadArticle: async (node, refresh = false) => {
    set({ readerLoading: true, readerContent: null });
    try {
      const article: string = await invoke('generate_article', {
        id: node.id,
        topic: node.label,
        description: node.description || '',
        parentId: node.parentId,
        refresh,
      });
      set({ readerContent: article, readerLoading: false });
    } catch (err) {
      console.error('Article generation failed:', err);
      set({ readerContent: `Failed to generate article: ${err}`, readerLoading: false });
    }
  },

  reset: () => set({
    appView: 'search', query: '', 
    error: null, selectedNode: null, readerContent: null, readerLoading: false,
  }),
}));
