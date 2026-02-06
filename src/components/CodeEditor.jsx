import { useState, useEffect, useRef, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import { getWorkspaceFile, saveWorkspaceFile } from '../api/client.js';
import {
  FileCode, Loader, Save, X, Split, Command,
  Search, ChevronDown, Copy, Check
} from 'lucide-react';

const extToLang = {
  js: 'javascript', mjs: 'javascript', jsx: 'javascript',
  ts: 'typescript', tsx: 'typescript',
  py: 'python', json: 'json', md: 'markdown',
  html: 'html', css: 'css', scss: 'scss',
  sh: 'shell', bash: 'shell',
  yml: 'yaml', yaml: 'yaml',
  xml: 'xml', sql: 'sql', txt: 'plaintext',
  c: 'c', cpp: 'cpp', java: 'java', go: 'go', rs: 'rust',
};

export function CodeEditor({ taskId, file, onFileSelect, fileVersion }) {
  const [tabs, setTabs] = useState([]);
  const [activeTabId, setActiveTabId] = useState(null);
  const [splitView, setSplitView] = useState(false);
  const [secondaryTabId, setSecondaryTabId] = useState(null);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [commandSearch, setCommandSearch] = useState('');
  const [saving, setSaving] = useState(null);
  const [saved, setSaved] = useState({});

  const editorRef = useRef(null);
  const secondaryEditorRef = useRef(null);
  const commandInputRef = useRef(null);
  const prevFileVersionRef = useRef(0);

  // Add file to tabs when selected from FileBrowser
  useEffect(() => {
    if (!file) return;

    console.log('[CodeEditor] Received file prop:', file);
    const existingTab = tabs.find(t => t.path === file.path);
    if (existingTab) {
      console.log('[CodeEditor] File already in tabs, activating:', existingTab.id);
      setActiveTabId(existingTab.id);
    } else {
      console.log('[CodeEditor] Creating new tab for file:', file.path);
      const newTab = {
        id: `${file.path}-${Date.now()}`,
        name: file.name,
        path: file.path,
        content: '',
        originalContent: '',
        loading: true,
        modified: false,
        language: extToLang[file.name.split('.').pop()] || 'plaintext',
      };
      setTabs(prev => [...prev, newTab]);
      setActiveTabId(newTab.id);

      // Load content
      getWorkspaceFile(taskId, file.path)
        .then(data => {
          console.log('[CodeEditor] File loaded successfully:', file.path);
          setTabs(prev => prev.map(t =>
            t.id === newTab.id
              ? { ...t, content: data.content || '', originalContent: data.content || '', loading: false }
              : t
          ));
        })
        .catch((err) => {
          console.error('[CodeEditor] Error loading file:', file.path, err);
          setTabs(prev => prev.map(t =>
            t.id === newTab.id
              ? { ...t, content: '// Error loading file', loading: false }
              : t
          ));
        });
    }
  }, [file, taskId]);

  // Refresh open tabs when fileVersion changes (agent wrote to files)
  useEffect(() => {
    if (!taskId || !fileVersion || fileVersion === prevFileVersionRef.current) return;
    if (tabs.length === 0) return;

    prevFileVersionRef.current = fileVersion;

    // Reload all open tabs that haven't been modified by user
    tabs.forEach(tab => {
      if (!tab.modified && !tab.loading) {
        getWorkspaceFile(taskId, tab.path)
          .then(data => {
            setTabs(prev => prev.map(t =>
              t.id === tab.id && !t.modified
                ? { ...t, content: data.content || '', originalContent: data.content || '' }
                : t
            ));
          })
          .catch(() => {
            // Ignore errors - file might have been deleted
          });
      }
    });
  }, [fileVersion, taskId, tabs]);

  const activeTab = tabs.find(t => t.id === activeTabId);
  const secondaryTab = tabs.find(t => t.id === secondaryTabId);

  const handleEditorChange = useCallback((value, tabId) => {
    setTabs(prev => prev.map(t => {
      if (t.id === tabId) {
        const modified = value !== t.originalContent;
        return { ...t, content: value, modified };
      }
      return t;
    }));
  }, []);

  const handleSave = useCallback(async (tabId) => {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab || !tab.modified) return;

    setSaving(tabId);
    try {
      await saveWorkspaceFile(taskId, tab.path, tab.content);
      setTabs(prev => prev.map(t =>
        t.id === tabId ? { ...t, originalContent: t.content, modified: false } : t
      ));
      setSaved(prev => ({ ...prev, [tabId]: true }));
      setTimeout(() => setSaved(prev => ({ ...prev, [tabId]: false })), 2000);
    } catch (error) {
      console.error('Save failed:', error);
    } finally {
      setSaving(null);
    }
  }, [tabs, taskId]);

  const handleCloseTab = useCallback((tabId, e) => {
    e?.stopPropagation();
    const tabIndex = tabs.findIndex(t => t.id === tabId);
    const newTabs = tabs.filter(t => t.id !== tabId);
    setTabs(newTabs);

    if (activeTabId === tabId) {
      if (newTabs.length > 0) {
        const nextIndex = tabIndex >= newTabs.length ? newTabs.length - 1 : tabIndex;
        setActiveTabId(newTabs[nextIndex].id);
      } else {
        setActiveTabId(null);
      }
    }

    if (secondaryTabId === tabId) {
      setSecondaryTabId(null);
    }
  }, [tabs, activeTabId, secondaryTabId]);

  const handleSplitView = useCallback(() => {
    if (!splitView && tabs.length > 1) {
      const otherTab = tabs.find(t => t.id !== activeTabId);
      if (otherTab) setSecondaryTabId(otherTab.id);
    }
    setSplitView(!splitView);
  }, [splitView, tabs, activeTabId]);

  // Command Palette
  const commands = [
    { id: 'save', label: 'Save File', action: () => activeTab && handleSave(activeTab.id), icon: Save },
    { id: 'close', label: 'Close Tab', action: () => activeTab && handleCloseTab(activeTab.id), icon: X },
    { id: 'close-all', label: 'Close All Tabs', action: () => setTabs([]), icon: X },
    { id: 'split', label: splitView ? 'Exit Split View' : 'Split Editor', action: handleSplitView, icon: Split },
    { id: 'copy', label: 'Copy File Path', action: () => activeTab && navigator.clipboard.writeText(activeTab.path), icon: Copy },
  ];

  const filteredCommands = commands.filter(cmd =>
    cmd.label.toLowerCase().includes(commandSearch.toLowerCase())
  );

  const handleCommandSelect = (command) => {
    command.action();
    setShowCommandPalette(false);
    setCommandSearch('');
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ctrl+S or Cmd+S to save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (activeTab) handleSave(activeTab.id);
      }
      // Ctrl+Shift+P or Cmd+Shift+P for command palette
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        setShowCommandPalette(prev => !prev);
      }
      // Ctrl+W or Cmd+W to close tab
      if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
        e.preventDefault();
        if (activeTab) handleCloseTab(activeTab.id);
      }
      // Ctrl+\ or Cmd+\ to toggle split view
      if ((e.ctrlKey || e.metaKey) && e.key === '\\') {
        e.preventDefault();
        handleSplitView();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, handleSave, handleCloseTab, handleSplitView]);

  // Focus command palette input when opened
  useEffect(() => {
    if (showCommandPalette && commandInputRef.current) {
      commandInputRef.current.focus();
    }
  }, [showCommandPalette]);

  const editorOptions = {
    fontSize: 13,
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
    minimap: { enabled: true },
    scrollBeyondLastLine: false,
    wordWrap: 'on',
    lineNumbers: 'on',
    renderLineHighlight: 'all',
    scrollbar: {
      verticalScrollbarSize: 8,
      horizontalScrollbarSize: 8,
    },
    padding: { top: 12, bottom: 12 },
    suggest: {
      showKeywords: true,
      showSnippets: true,
    },
    quickSuggestions: true,
    parameterHints: { enabled: true },
    formatOnPaste: true,
    formatOnType: true,
    autoClosingBrackets: 'always',
    autoClosingQuotes: 'always',
    tabSize: 2,
    detectIndentation: true,
  };

  const EditorPane = ({ tab, isSecondary = false }) => {
    if (!tab) return null;

    return (
      <div className="editor-pane">
        <div className="editor-pane-header">
          <div className="editor-pane-title">
            <FileCode size={13} />
            <span>{tab.name}</span>
            {tab.modified && <span className="modified-indicator">●</span>}
          </div>
          <div className="editor-pane-actions">
            {tab.modified && (
              <button
                className="editor-action-btn"
                onClick={() => handleSave(tab.id)}
                disabled={saving === tab.id}
                title="Save (Ctrl+S)"
              >
                {saving === tab.id ? (
                  <Loader size={13} className="spinner" />
                ) : saved[tab.id] ? (
                  <Check size={13} className="text-green" />
                ) : (
                  <Save size={13} />
                )}
              </button>
            )}
          </div>
        </div>
        {tab.loading ? (
          <div className="monaco-loading">
            <Loader size={20} className="spinner" />
            <span>Loading...</span>
          </div>
        ) : (
          <Editor
            height="100%"
            language={tab.language}
            value={tab.content}
            theme="vs-dark"
            options={editorOptions}
            onChange={(value) => handleEditorChange(value, tab.id)}
            onMount={(editor) => {
              if (isSecondary) {
                secondaryEditorRef.current = editor;
              } else {
                editorRef.current = editor;
              }
            }}
          />
        )}
      </div>
    );
  };

  if (tabs.length === 0) {
    return (
      <div className="code-editor empty">
        <FileCode size={32} />
        <p>No files open</p>
        <span className="empty-hint">Select a file from the explorer to start editing</span>
      </div>
    );
  }

  return (
    <div className="code-editor">
      {/* Tab Bar */}
      <div className="code-tab-bar">
        <div className="code-tabs">
          {tabs.map(tab => (
            <div
              key={tab.id}
              className={`code-tab ${activeTabId === tab.id ? 'active' : ''} ${tab.modified ? 'modified' : ''}`}
              onClick={() => setActiveTabId(tab.id)}
            >
              <FileCode size={13} />
              <span className="tab-name">{tab.name}</span>
              {tab.modified && <span className="tab-modified">●</span>}
              <button
                className="tab-close"
                onClick={(e) => handleCloseTab(tab.id, e)}
                title="Close (Ctrl+W)"
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
        <div className="code-tab-actions">
          <button
            className={`tab-action-btn ${splitView ? 'active' : ''}`}
            onClick={handleSplitView}
            title="Toggle Split View (Ctrl+\)"
            disabled={tabs.length < 2}
          >
            <Split size={14} />
          </button>
          <button
            className="tab-action-btn"
            onClick={() => setShowCommandPalette(true)}
            title="Command Palette (Ctrl+Shift+P)"
          >
            <Command size={14} />
          </button>
        </div>
      </div>

      {/* Editor Area */}
      <div className={`editor-container ${splitView ? 'split-view' : ''}`}>
        <EditorPane tab={activeTab} />
        {splitView && <EditorPane tab={secondaryTab} isSecondary />}
      </div>

      {/* Command Palette */}
      {showCommandPalette && (
        <div className="command-palette-overlay" onClick={() => setShowCommandPalette(false)}>
          <div className="command-palette" onClick={(e) => e.stopPropagation()}>
            <div className="command-search">
              <Search size={16} />
              <input
                ref={commandInputRef}
                type="text"
                placeholder="Type a command..."
                value={commandSearch}
                onChange={(e) => setCommandSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setShowCommandPalette(false);
                  if (e.key === 'Enter' && filteredCommands.length > 0) {
                    handleCommandSelect(filteredCommands[0]);
                  }
                }}
              />
            </div>
            <div className="command-list">
              {filteredCommands.map(cmd => (
                <div
                  key={cmd.id}
                  className="command-item"
                  onClick={() => handleCommandSelect(cmd)}
                >
                  <cmd.icon size={14} />
                  <span>{cmd.label}</span>
                </div>
              ))}
              {filteredCommands.length === 0 && (
                <div className="command-item empty">No commands found</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
