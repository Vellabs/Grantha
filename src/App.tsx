import { useState, useEffect } from 'react';
import { Search, X, Microscope, AlertCircle, BookOpen, Loader2, RefreshCw, Clock, Plus, Trash2 } from 'lucide-react';
import { useStore, Node } from './store';
import { KnowledgeGraph } from './KnowledgeGraph';
import { SetupWizard } from './components/SetupWizard';
import './App.css';

function App() {
  const { appView, startResearch, viewHistory, query, visibleNodes, visibleEdges, error, reset, selectedNode, isConfigured, loadSettings } = useStore();

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  if (!isConfigured && appView !== 'settings') {
    // Show splash/loader while checking, or force settings if not configured
    return <SetupWizard />;
  }

  return (
    <div className="app-container">
      {appView === 'settings' && <SetupWizard />}
      {appView === 'search' && (
        <SearchScreen 
          onSearch={(q) => {
             startResearch(q);
          }}
          onHistoryClick={(q) => {
             viewHistory(q);
          }}
          error={error} 
        />
      )}
      {appView === 'researching' && <LoadingScreen query={query} />}
      {appView === 'graph' && (
        <GraphScreen
          nodes={visibleNodes}
          edges={visibleEdges}
          query={query}
          onBack={reset}
        />
      )}
      {appView === 'reader' && selectedNode && (
        <ReaderScreen />
      )}
    </div>
  );
}

/* ───────────── Search Screen ───────────── */
function SearchScreen({ onSearch, onHistoryClick, error }: { onSearch: (q: string) => void; onHistoryClick: (q: string) => void; error: string | null }) {
  const [inputValue, setInputValue] = useState('');
  const { history, loadHistory, deleteHistoryItem, setAppView, model } = useStore();

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) onSearch(inputValue);
  };

  return (
    <div className="search-layout">
      {/* ── Left Sidebar (History) ── */}
      <div className="sidebar">
        <div className="sidebar-header">
          <h2 className="sidebar-title">
            <Clock size={16} />
            History
          </h2>
        </div>
        <div className="sidebar-content">
          {history.length === 0 && (
            <p style={{ padding: '2rem 1rem', color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center' }}>
              No research history yet
            </p>
          )}
          {history.map((item) => (
            <div key={item} style={{ display: 'flex', alignItems: 'center', width: '100%', gap: '4px' }}>
              <button
                className="sidebar-item"
                style={{ flex: 1, overflow: 'hidden' }}
                onClick={() => onHistoryClick(item)}
              >
                <BookOpen size={14} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item}
                </span>
              </button>
              <button
                className="icon-button"
                style={{ padding: '0.5rem', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                onClick={(e) => {
                  e.stopPropagation();
                  deleteHistoryItem(item);
                }}
                title="Delete history item"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ── Main Search Area ── */}
      <div className="search-main">
        <div className="search-top-bar">
          <div className="model-badge">
            <Microscope size={14} />
            <span>{model}</span>
          </div>
          <button className="icon-button" onClick={() => setAppView('settings')} title="Settings">
            <RefreshCw size={18} />
          </button>
        </div>
        <div className="search-container">
          <h1 className="search-title">Grantha</h1>
          <p className="search-subtitle">Local Research Knowledge Graph Builder</p>

          <form onSubmit={handleSubmit}>
            <div className="search-input-wrapper">
              <Search className="search-icon" size={22} />
              <input
                type="text"
                className="search-input"
                placeholder="What do you want to learn? (e.g. How to build an LLM?)"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                autoFocus
              />
              <button type="submit" className="search-button" disabled={!inputValue.trim()}>
                Research
              </button>
            </div>
          </form>

          {error && (
            <div className="error-banner">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ───────────── Loading Screen ───────────── */
function LoadingScreen({ query }: { query: string }) {
  return (
    <div className="loader-container">
      <div className="spinner" />
      <h2 style={{ marginBottom: '0.5rem', fontWeight: 600 }}>Researching…</h2>
      <p className="loader-text">Scraping Wikipedia & analyzing with LLM for: "{query}"</p>
      <p style={{ marginTop: '2rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
        This may take 1-2 minutes while the local LLM processes the data.
      </p>
    </div>
  );
}

/* ───────────── Graph Screen (Sidebar + Graph + Overlay Reader) ───────────── */
interface GraphScreenProps {
  nodes: Node[];
  edges: { id: string; source: string; target: string; label?: string }[];
  query: string;
  onBack: () => void;
}

function GraphScreen({ nodes, edges, query, onBack }: GraphScreenProps) {
  const {
    selectedNode, selectNode,
    deepDiveLoading
  } = useStore();

  return (
    <div className="graph-layout">
      {/* ── Graph Pane ── */}
      <div className="graph-pane">
        {/* Navigation Toolbar */}
        <div className="graph-toolbar">
          <button className="toolbar-btn" onClick={onBack}>
            <Plus size={16} />
            New Research
          </button>
          <div className="toolbar-query">
            <Search size={14} />
            {query}
          </div>
          {deepDiveLoading && (
            <div className="toolbar-status">
              <Loader2 size={16} className="animate-spin" />
              Expanding knowledge...
            </div>
          )}
        </div>

        <KnowledgeGraph
          nodes={nodes}
          edges={edges}
          onNodeClick={(node: Node) => selectNode(node)}
          selectedNodeId={selectedNode?.id}
        />
      </div>
    </div>
  );
}

function ReaderScreen() {
  const {
    selectedNode,
    selectNode,
    readerContent,
    readerLoading,
    deepDiveNode,
    deepDiveLoading,
    loadArticle,
    userNotes,
    saveNotes
  } = useStore();

  const [activeTab, setActiveTab] = useState<'article' | 'notes'>('article');

  if (!selectedNode) return null;

  return (
    <div className="graph-layout">
      {/* ── Reader Screen ── */}
      <div className="reader-pane full-view">
        <div className="reader-header">
          <div className="reader-inner" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <button className="toolbar-btn" onClick={() => selectNode(null)}>
                <Plus style={{ transform: 'rotate(45deg)' }} size={16} />
                Back to Graph
              </button>
              <h2 className="reader-title">{selectedNode.label}</h2>
            </div>
            
            <div style={{ display: 'flex', gap: '0.8rem' }}>
              <div className="tab-switcher">
                 <button className={`tab-btn ${activeTab === 'article' ? 'active' : ''}`} onClick={() => setActiveTab('article')}>Article</button>
                 <button className={`tab-btn ${activeTab === 'notes' ? 'active' : ''}`} onClick={() => setActiveTab('notes')}>Notes</button>
              </div>
              <button 
                className="icon-action-button" 
                onClick={() => loadArticle(selectedNode, true)} 
                title="Regenerate Article"
                disabled={readerLoading}
              >
                <RefreshCw size={18} className={readerLoading ? 'animate-spin' : ''} />
              </button>
              <button className="icon-action-button close-btn" onClick={() => selectNode(null)} title="Close Reader">
                <X size={20} />
              </button>
            </div>
          </div>
        </div>

        {/* Node description (short summary) */}
        {selectedNode.description && activeTab === 'article' && (
          <div className="reader-summary">
            <div className="reader-inner">
              <p>{selectedNode.description}</p>
            </div>
          </div>
        )}

        {/* Article content or Notes */}
        <div className="reader-body">
          <div className="reader-inner" style={{ height: '100%' }}>
            {activeTab === 'article' ? (
              readerLoading ? (
                <div className="reader-loading">
                  <Loader2 size={24} className="animate-spin" />
                  <p>Generating thorough article from LLM…</p>
                </div>
              ) : readerContent ? (
                <div className="reader-article">
                  <MarkdownRenderer content={readerContent} />
                </div>
              ) : (
                <p className="reader-empty">Content not found.</p>
              )
            ) : (
              <div className="notes-container" style={{ height: '100%', padding: '1rem 0' }}>
                <textarea
                  className="notes-textarea"
                  placeholder="Write your personal notes for this topic here... (auto-saves)"
                  value={userNotes}
                  onChange={(e) => saveNotes(e.target.value)}
                  style={{ 
                    width: '100%', 
                    height: '100%', 
                    background: 'var(--bg-secondary)', 
                    color: 'var(--text-primary)', 
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    padding: '1.5rem',
                    fontSize: '1rem',
                    lineHeight: '1.6',
                    resize: 'none',
                    outline: 'none'
                  }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Deep Dive button */}
        <div className="reader-footer">
          <div className="reader-inner" style={{ display: 'flex', justifyContent: 'center' }}>
            <button
              className="deep-dive-button"
              disabled={deepDiveLoading}
              onClick={() => {
                if (selectedNode) {
                  deepDiveNode(selectedNode);
                }
              }}
            >
              {deepDiveLoading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Expanding Knowledge...
                </>
              ) : (
                <>
                  <Microscope size={18} />
                  Deep Dive into {selectedNode.label}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───────────── Markdown + LaTeX Renderer ───────────── */
import Markdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

function MarkdownRenderer({ content }: { content: string }) {
  return (
    <div className="markdown-content">
      <Markdown
        remarkPlugins={[remarkMath, remarkGfm]}
        rehypePlugins={[rehypeKatex]}
      >
        {content}
      </Markdown>
    </div>
  );
}

export default App;

