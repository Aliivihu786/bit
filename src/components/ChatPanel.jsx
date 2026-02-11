import { useState, useRef, useEffect, useMemo } from 'react';
import { ChatMessage } from './ChatMessage.jsx';
import { AgentThinking } from './AgentThinking.jsx';
import { ExecutionStatus } from './ExecutionStatus.jsx';
import { ApprovalBar } from './ApprovalBar.jsx';
import { listSubagents, createSubagent, updateSubagent, deleteSubagent, listAgentTools, generateSubagentSpec } from '../api/client.js';
import { SUBAGENT_TEMPLATES } from '../data/subagentTemplates.js';
import {
  ArrowUp, Loader2, Plus, Search, Globe, Users,
  Code, FolderOpen, Shield, ShieldCheck, ShieldOff, Paperclip, Plug, ListTodo, MousePointerClick,
  Database, Github, Figma, Edit2, Trash2, Sparkles,
} from 'lucide-react';

export function ChatPanel({
  messages, steps, status, onSend, checkpoints = [],
  subagentOpenRequest = 0,
  autoSubagent = null,
  runSubagent = null,
  approvalMode = 'ask', onSetApprovalMode,
  pendingApproval, onApprove, onDeny,
}) {
  const [input, setInput] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [subagentOpen, setSubagentOpen] = useState(false);
  const [subagents, setSubagents] = useState([]);
  const [availableTools, setAvailableTools] = useState([]);
  const [editingSubagent, setEditingSubagent] = useState(null); // null or subagent name being edited
  const [subagentForm, setSubagentForm] = useState({
    name: '',
    idea: '',
    description: '',
    systemPrompt: '',
    tools: [],
    excludeTools: '',
  });
  const [subagentStatus, setSubagentStatus] = useState({ loading: false, error: '', success: '' });
  const [subagentGenerating, setSubagentGenerating] = useState(false);
  const [subagentMenuOpen, setSubagentMenuOpen] = useState(false);
  const [subagentMenuLoading, setSubagentMenuLoading] = useState(false);
  const [manualSubagent, setManualSubagent] = useState(null);
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [plusSubmenu, setPlusSubmenu] = useState(null);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);
  const plusMenuRef = useRef(null);
  const plusButtonRef = useRef(null);
  const subagentMenuRef = useRef(null);
  const subagentButtonRef = useRef(null);
  const hasInput = input.trim().length > 0;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, steps]);

  useEffect(() => {
    if (!plusMenuOpen) return;
    const handleClick = (e) => {
      if (plusMenuRef.current?.contains(e.target)) return;
      if (plusButtonRef.current?.contains(e.target)) return;
      setPlusMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [plusMenuOpen]);

  useEffect(() => {
    if (!subagentMenuOpen) return;
    const handleClick = (e) => {
      if (subagentMenuRef.current?.contains(e.target)) return;
      if (subagentButtonRef.current?.contains(e.target)) return;
      setSubagentMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [subagentMenuOpen]);

  useEffect(() => {
    if (!plusMenuOpen) {
      setPlusSubmenu(null);
    }
  }, [plusMenuOpen]);

  const closePlusMenu = () => {
    setPlusMenuOpen(false);
    setPlusSubmenu(null);
  };


  const handleSubmit = (e) => {
    e?.preventDefault?.();
    const message = input.trim();
    if (!message || status === 'running') return;
    const selectedManual = Array.isArray(manualSubagent)
      ? manualSubagent
      : manualSubagent
        ? [manualSubagent]
        : [];
    onSend(message);
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    if (selectedManual.length > 0 && runSubagent) {
      selectedManual.forEach((sub) => {
        runSubagent({
          subagentName: sub.name,
          description: sub.description,
          prompt: message,
        });
      });
      setManualSubagent(null);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleTextareaInput = (e) => {
    setInput(e.target.value);
    // Auto-resize textarea
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  };

  const cycleApprovalMode = () => {
    if (!onSetApprovalMode) return;
    const modes = ['ask', 'auto', 'yolo'];
    const currentIndex = modes.indexOf(approvalMode);
    const nextMode = modes[(currentIndex + 1) % modes.length];
    onSetApprovalMode(nextMode);
  };

  const getApprovalIcon = () => {
    switch (approvalMode) {
      case 'ask': return <Shield size={18} />;
      case 'auto': return <ShieldCheck size={18} />;
      case 'yolo': return <ShieldOff size={18} />;
      default: return <Shield size={18} />;
    }
  };

  const getApprovalTooltip = () => {
    switch (approvalMode) {
      case 'ask': return 'Approval: Ask (click to enable Auto)';
      case 'auto': return 'Approval: Auto (click to enable YOLO)';
      case 'yolo': return 'Approval: YOLO - All approved! (click to Ask)';
      default: return 'Approval mode';
    }
  };

  const getApprovalClass = () => {
    switch (approvalMode) {
      case 'ask': return 'approval-ask';
      case 'auto': return 'approval-auto';
      case 'yolo': return 'approval-yolo';
      default: return '';
    }
  };

  const autoList = Array.isArray(autoSubagent)
    ? autoSubagent
    : autoSubagent
      ? [autoSubagent]
      : [];
  const autoReason = autoList.find(item => item.reason)?.reason || '';
  const autoIndicator = autoList.length > 0 ? (
    <div
      className="auto-subagent-indicator"
      title={autoReason ? `Matched: ${autoReason}` : 'Auto-selected subagent'}
    >
      <Users size={14} />
      <span className="auto-subagent-label">Auto-selected</span>
      <span className="auto-subagent-name">{autoList.map(item => item.name).join(', ')}</span>
    </div>
  ) : null;

  const manualList = Array.isArray(manualSubagent)
    ? manualSubagent
    : manualSubagent
      ? [manualSubagent]
      : [];
  const manualIndicator = manualList.length > 0 ? (
    <div className="manual-subagent-indicator">
      <Users size={14} />
      <span className="manual-subagent-label">Selected</span>
      <span className="manual-subagent-name">{manualList.map(s => s.name).join(', ')}</span>
      <button
        type="button"
        className="manual-subagent-clear"
        onClick={() => setManualSubagent(null)}
        aria-label="Clear subagent selection"
      >
        ×
      </button>
    </div>
  ) : null;

  const subagentMenu = subagentMenuOpen ? (
    <div ref={subagentMenuRef} className="toolbar-menu" role="menu">
      {subagentMenuLoading && <div className="toolbar-menu-empty">Loading...</div>}
      {!subagentMenuLoading && subagents.length === 0 && (
        <div className="toolbar-menu-empty">No subagents available</div>
      )}
      {!subagentMenuLoading && subagents.map((agent) => {
        const selected = Array.isArray(manualSubagent)
          ? manualSubagent.some(s => s.name === agent.name)
          : manualSubagent?.name === agent.name;
        return (
          <button
            key={agent.name}
            type="button"
            className={`toolbar-menu-item subagent-menu-item ${selected ? 'selected' : ''}`}
            role="menuitem"
            onClick={() => handleManualSubagentSelect(agent)}
          >
            <span className="subagent-menu-name">{agent.name}</span>
            {selected && <span className="toolbar-menu-check">✓</span>}
          </button>
        );
      })}
    </div>
  ) : null;

  const openSubagents = async () => {
    setSubagentStatus({ loading: true, error: '', success: '' });
    setSubagentOpen(true);
    try {
      const data = await listSubagents();
      const list = Array.isArray(data.subagents) ? data.subagents : [];
      setSubagents(list);
      const toolData = await listAgentTools();
      setAvailableTools(Array.isArray(toolData.tools) ? toolData.tools : []);
      setSelectedCategory('all');
      setSubagentStatus({ loading: false, error: '', success: '' });
    } catch (err) {
      setSubagentStatus({ loading: false, error: err.message, success: '' });
    }
  };

  const openSubagentMenu = async () => {
    setSubagentMenuOpen(true);
    if (subagents.length > 0) return;
    setSubagentMenuLoading(true);
    try {
      const data = await listSubagents();
      const list = Array.isArray(data.subagents) ? data.subagents : [];
      setSubagents(list);
    } catch (err) {
      console.error('Failed to load subagents:', err);
    } finally {
      setSubagentMenuLoading(false);
    }
  };

  const MAX_MANUAL_SUBAGENTS = 5;
  const handleManualSubagentSelect = (agent) => {
    if (status === 'running' && runSubagent) {
      const lastUser = [...messages].reverse().find(msg => msg.role === 'user');
      const lastPrompt = lastUser?.content?.trim();
      if (lastPrompt) {
        runSubagent({
          subagentName: agent.name,
          description: agent.description || '',
          prompt: lastPrompt,
          deferUntilComplete: true,
        });
        setSubagentMenuOpen(false);
        return;
      }
    }
    setManualSubagent((prev) => {
      const current = Array.isArray(prev) ? prev : prev ? [prev] : [];
      const exists = current.find(s => s.name === agent.name);
      if (exists) {
        return current.filter(s => s.name !== agent.name);
      }
      if (current.length >= MAX_MANUAL_SUBAGENTS) {
        setSubagentStatus({ loading: false, error: `You can select up to ${MAX_MANUAL_SUBAGENTS} subagents.`, success: '' });
        return current;
      }
      return [...current, { name: agent.name, description: agent.description || '' }];
    });
    setSubagentMenuOpen(false);
  };

  useEffect(() => {
    if (!subagentOpenRequest) return;
    openSubagents();
  }, [subagentOpenRequest]);

  const handleSubagentChange = (field) => (e) => {
    const value = e.target.value;
    setSubagentForm(prev => ({ ...prev, [field]: value }));
  };

  const handleIdeaChange = (e) => {
    const value = e.target.value;
    setSubagentForm(prev => ({ ...prev, idea: value }));
  };

  const toolCategories = useMemo(() => {
    const all = availableTools;
    const readOnly = all.filter(t => ['web_search', 'web_browser'].includes(t));
    const execution = all.filter(t => ['code_executor'].includes(t));
    const edit = all.filter(t => ['file_manager', 'canvas', 'project_scaffold'].includes(t));
    const mcp = all.filter(t => t.startsWith('mcp_'));
    const other = all.filter(t => !new Set([...readOnly, ...execution, ...edit, ...mcp]).has(t));
    return {
      all,
      readOnly,
      edit,
      execution,
      mcp,
      other,
    };
  }, [availableTools]);

  useEffect(() => {
    const map = toolCategories;
    const next = map[selectedCategory] || [];
    setSubagentForm(prev => ({ ...prev, tools: next }));
  }, [selectedCategory, toolCategories]);

  const handleGenerateSubagent = async () => {
    const idea = subagentForm.idea.trim();
    const name = subagentForm.name.trim();
    if (!idea && !name) {
      setSubagentStatus({ loading: false, error: 'Provide a name or idea to generate.', success: '' });
      return;
    }
    setSubagentGenerating(true);
    setSubagentStatus({ loading: false, error: '', success: '' });
    try {
      const data = await generateSubagentSpec({ idea, name });
      setSubagentForm(prev => ({
        ...prev,
        description: data.description || prev.description,
        systemPrompt: data.system_prompt || prev.systemPrompt,
      }));
    } catch (err) {
      setSubagentStatus({ loading: false, error: err.message, success: '' });
    } finally {
      setSubagentGenerating(false);
    }
  };

  const handleCreateSubagent = async () => {
    if (!subagentForm.name.trim() || !subagentForm.systemPrompt.trim()) {
      setSubagentStatus({ loading: false, error: 'Name and system prompt are required.', success: '' });
      return;
    }
    setSubagentStatus({ loading: true, error: '', success: '' });
    const tools = Array.isArray(subagentForm.tools) ? subagentForm.tools : [];
    const excludeTools = subagentForm.excludeTools
      .split(',')
      .map(v => v.trim())
      .filter(Boolean);
    try {
      let result;
      if (editingSubagent) {
        // Update existing
        result = await updateSubagent(editingSubagent, {
          name: subagentForm.name.trim(),
          description: subagentForm.description.trim(),
          system_prompt: subagentForm.systemPrompt.trim(),
          tools: tools.length ? tools : undefined,
          exclude_tools: excludeTools.length ? excludeTools : undefined,
        });
        const updated = result?.subagent;
        if (updated) {
          setSubagents(prev => {
            const filtered = prev.filter(agent => agent.name !== editingSubagent);
            return [...filtered, {
              ...updated,
              kind: updated.kind || 'dynamic',
            }];
          });
        }
        setSubagentStatus({ loading: false, error: '', success: 'Subagent updated successfully!' });
      } else {
        // Create new
        result = await createSubagent({
          name: subagentForm.name.trim(),
          description: subagentForm.description.trim(),
          system_prompt: subagentForm.systemPrompt.trim(),
          tools: tools.length ? tools : undefined,
          exclude_tools: excludeTools.length ? excludeTools : undefined,
        });
        const created = result?.subagent;
        if (created) {
          setSubagents(prev => {
            if (prev.some(agent => agent.name === created.name)) return prev;
            return [...prev, {
              ...created,
              kind: created.kind || 'dynamic',
            }];
          });
        }
        setSubagentStatus({ loading: false, error: '', success: 'Subagent created. The main agent can invoke it via the task tool.' });
      }
      setSubagentForm({ name: '', idea: '', description: '', systemPrompt: '', tools: [], excludeTools: '' });
      setEditingSubagent(null);
    } catch (err) {
      setSubagentStatus({ loading: false, error: err.message, success: '' });
    }
  };

  const handleEditSubagent = (agent) => {
    setEditingSubagent(agent.name);
    setSubagentForm({
      name: agent.name,
      idea: '',
      description: agent.description,
      systemPrompt: agent.systemPrompt,
      tools: agent.tools || [],
      excludeTools: (agent.excludeTools || []).join(', '),
    });
    setSubagentStatus({ loading: false, error: '', success: '' });
  };

  const handleDeleteSubagent = async (name) => {
    if (!confirm(`Delete subagent "${name}"? This cannot be undone.`)) return;
    setSubagentStatus({ loading: true, error: '', success: '' });
    try {
      await deleteSubagent(name);
      setSubagents(prev => prev.filter(agent => agent.name !== name));
      setSubagentStatus({ loading: false, error: '', success: `Subagent "${name}" deleted.` });
      if (editingSubagent === name) {
        setEditingSubagent(null);
        setSubagentForm({ name: '', idea: '', description: '', systemPrompt: '', tools: [], excludeTools: '' });
      }
    } catch (err) {
      setSubagentStatus({ loading: false, error: err.message, success: '' });
    }
  };

  const handleCancelEdit = () => {
    setEditingSubagent(null);
    setSubagentForm({ name: '', idea: '', description: '', systemPrompt: '', tools: [], excludeTools: '' });
    setSubagentStatus({ loading: false, error: '', success: '' });
  };

  const handleCreateFromTemplate = async (template) => {
    setSubagentStatus({ loading: true, error: '', success: '' });
    try {
      const result = await createSubagent({
        name: template.name,
        description: template.description,
        system_prompt: template.systemPrompt,
        tools: template.tools,
        exclude_tools: template.excludeTools,
      });
      const created = result?.subagent;
      if (created) {
        setSubagents(prev => {
          if (prev.some(agent => agent.name === created.name)) return prev;
          return [...prev, {
            ...created,
            kind: created.kind || 'dynamic',
          }];
        });
      }
      setSubagentStatus({ loading: false, error: '', success: `${template.displayName} created successfully!` });
    } catch (err) {
      setSubagentStatus({ loading: false, error: err.message, success: '' });
    }
  };

  const subagentModal = subagentOpen ? (
    <div className="subagent-modal-overlay" onClick={() => setSubagentOpen(false)}>
      <div className="subagent-modal" onClick={(e) => e.stopPropagation()}>
        <div className="subagent-modal-header">
          <h3>Subagents</h3>
          <button className="subagent-close" onClick={() => setSubagentOpen(false)}>×</button>
        </div>
        <div className="subagent-modal-body">
          {/* Templates Section */}
          <div className="subagent-templates">
            <div className="subagent-section-title">
              <Sparkles size={16} style={{ marginRight: '6px' }} />
              Quick Templates
            </div>
            <div className="subagent-templates-grid">
              {SUBAGENT_TEMPLATES.map((template) => {
                const exists = subagents.some(a => a.name === template.name);
                return (
                  <button
                    key={template.id}
                    className="subagent-template-card"
                    onClick={() => handleCreateFromTemplate(template)}
                    disabled={exists || subagentStatus.loading}
                  >
                    <div className="template-icon">{template.icon}</div>
                    <div className="template-name">{template.displayName}</div>
                    <div className="template-desc">{template.description.slice(0, 80)}...</div>
                    {exists && <div className="template-exists">✓ Added</div>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Existing Subagents List */}
          <div className="subagent-list">
            <div className="subagent-section-title">Your Subagents</div>
            {subagentStatus.loading && <div className="subagent-empty">Loading...</div>}
            {!subagentStatus.loading && subagents.length === 0 && (
              <div className="subagent-empty">No subagents configured. Try a template above!</div>
            )}
            {subagents.map((agent) => (
              <div key={agent.name} className="subagent-item">
                <div className="subagent-item-header">
                  <div className="subagent-name">
                    {agent.name}
                    <span className={`subagent-kind ${agent.kind || 'dynamic'}`}>
                      {agent.kind || 'dynamic'}
                    </span>
                  </div>
                  {agent.kind === 'dynamic' && (
                    <div className="subagent-actions">
                      <button
                        className="subagent-action-btn"
                        onClick={() => handleEditSubagent(agent)}
                        title="Edit"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        className="subagent-action-btn delete"
                        onClick={() => handleDeleteSubagent(agent.name)}
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
                <div className="subagent-desc">{agent.description}</div>
                {(agent.tools?.length || agent.excludeTools?.length) && (
                  <div className="subagent-meta">
                    {agent.tools?.length ? `Tools: ${agent.tools.join(', ')}` : null}
                    {agent.excludeTools?.length ? `Exclude: ${agent.excludeTools.join(', ')}` : null}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="subagent-form">
            <div className="subagent-section-title">
              {editingSubagent ? 'Edit Subagent' : 'Create Custom Subagent'}
            </div>
            {editingSubagent && (
              <div className="subagent-edit-notice">
                Editing: <strong>{editingSubagent}</strong>
                <button className="subagent-cancel-edit" onClick={handleCancelEdit}>Cancel</button>
              </div>
            )}
            <label>
              Name
              <input value={subagentForm.name} onChange={handleSubagentChange('name')} placeholder="e.g. reviewer" />
            </label>
            <label>
              Idea
              <textarea
                value={subagentForm.idea}
                onChange={handleIdeaChange}
                rows={2}
                placeholder="Describe what you want this subagent to handle"
              />
              <span className="subagent-hint">Click Generate to fill Description and System Prompt.</span>
              <button
                type="button"
                className="subagent-generate"
                onClick={handleGenerateSubagent}
                disabled={subagentGenerating}
              >
                {subagentGenerating ? 'Generating...' : 'Generate'}
              </button>
            </label>
            <label>
              Description
              <input
                value={subagentForm.description}
                onChange={handleSubagentChange('description')}
                placeholder="Optional short description"
              />
            </label>
            <label>
              System Prompt
              <textarea
                value={subagentForm.systemPrompt}
                onChange={handleSubagentChange('systemPrompt')}
                rows={4}
                placeholder="Describe what this agent should do and when it should be used (be comprehensive for best results)."
              />
            </label>
            <div className="subagent-toolbox">
              <div className="subagent-section-title">Select tools</div>
              <label>
                Category
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                >
                  <option value="all">All tools</option>
                  <option value="readOnly">Read-only tools</option>
                  <option value="edit">Edit tools</option>
                  <option value="execution">Execution tools</option>
                  <option value="mcp">MCP tools</option>
                  <option value="other">Other tools</option>
                </select>
              </label>
              <div className="subagent-hint">
                Selected: {subagentForm.tools.length ? subagentForm.tools.join(', ') : 'None'}
              </div>
            </div>
            <label>
              Exclude Tools (comma-separated)
              <input value={subagentForm.excludeTools} onChange={handleSubagentChange('excludeTools')} placeholder="web_search" />
            </label>
            {subagentStatus.error && <div className="subagent-error">{subagentStatus.error}</div>}
            {subagentStatus.success && <div className="subagent-success">{subagentStatus.success}</div>}
            <div className="subagent-form-buttons">
              <button className="subagent-create" onClick={handleCreateSubagent} disabled={subagentStatus.loading}>
                {subagentStatus.loading ? (editingSubagent ? 'Updating...' : 'Creating...') : (editingSubagent ? 'Update Subagent' : 'Create Subagent')}
              </button>
              {editingSubagent && (
                <button className="subagent-cancel" onClick={handleCancelEdit}>Cancel</button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  const hasMessages = messages.length > 0 || steps.length > 0;

  // Build a combined timeline
  const timeline = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    timeline.push({ type: 'message', data: msg, key: `msg-${i}` });

    const isLastUserMsg = msg.role === 'user' &&
      (i === messages.length - 1 || messages[i + 1]?.role === 'assistant');

    if (isLastUserMsg && steps.length > 0) {
      timeline.push({ type: 'steps', data: steps, key: `steps-${i}` });
    }
  }

  if (messages.length === 0 && steps.length > 0) {
    timeline.push({ type: 'steps', data: steps, key: 'steps-init' });
  }

  // Welcome screen (no messages yet)
  if (!hasMessages) {
    return (
      <div className="chat-panel">
        <div className="messages-list">
          <div className="welcome-screen">
            <h1 className="welcome-heading">How can Bolt help you today?</h1>

            <div className="welcome-input-wrapper">
              {/* Approval bar for ask mode - shown above input */}
              {approvalMode === 'ask' && pendingApproval && (
                <>
                  <div className="approval-note">
                    Approvals are tied to the main task (not the subagent task), so “Ask” mode works for subagents too.
                  </div>
                  <ApprovalBar
                    approval={pendingApproval}
                    onApprove={onApprove}
                    onDeny={onDeny}
                  />
                </>
              )}
              <div className="welcome-input-box">
                <textarea
                  ref={textareaRef}
                  className="welcome-textarea"
                  value={input}
                  onChange={handleTextareaInput}
                  onKeyDown={handleKeyDown}
                  placeholder="How can Bolt help you today? (or /command)"
                  rows={1}
                  disabled={status === 'running'}
                />
                {manualIndicator}
                {autoIndicator}
                <div className="welcome-toolbar">
                  <div className="welcome-toolbar-left">
                    <div className="toolbar-menu-wrap">
                      <button
                        ref={plusButtonRef}
                        type="button"
                        className={`toolbar-btn ${plusMenuOpen ? 'active' : ''}`}
                        title="Add"
                        onClick={() => setPlusMenuOpen((open) => !open)}
                        aria-expanded={plusMenuOpen}
                        aria-haspopup="menu"
                      >
                        <Plus size={18} />
                      </button>
                      {plusMenuOpen && (
                        <div ref={plusMenuRef} className="toolbar-menu" role="menu">
                          <button
                            type="button"
                            className="toolbar-menu-item"
                            role="menuitem"
                            onClick={closePlusMenu}
                          >
                            <Paperclip size={14} />
                            Attachments
                          </button>
                          <button
                            type="button"
                            className={`toolbar-menu-item has-sub ${plusSubmenu === 'connectors' ? 'active' : ''}`}
                            role="menuitem"
                            onClick={() => setPlusSubmenu(plusSubmenu === 'connectors' ? null : 'connectors')}
                            onMouseEnter={() => setPlusSubmenu('connectors')}
                            aria-haspopup="menu"
                            aria-expanded={plusSubmenu === 'connectors'}
                          >
                            <Plug size={14} />
                            Connectors
                          </button>
                          {plusSubmenu === 'connectors' && (
                            <div className="toolbar-submenu" role="menu">
                              <div className="toolbar-menu-title">Connectors</div>
                              <button
                                type="button"
                                className="toolbar-menu-item"
                                role="menuitem"
                                onClick={closePlusMenu}
                              >
                                <Database size={14} />
                                Supabase
                              </button>
                              <button
                                type="button"
                                className="toolbar-menu-item"
                                role="menuitem"
                                onClick={closePlusMenu}
                              >
                                <Github size={14} />
                                GitHub
                              </button>
                              <button
                                type="button"
                                className="toolbar-menu-item"
                                role="menuitem"
                                onClick={closePlusMenu}
                              >
                                <Figma size={14} />
                                Figma
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      className={`toolbar-btn approval-btn ${getApprovalClass()}`}
                      title={getApprovalTooltip()}
                      onClick={cycleApprovalMode}
                    >
                      {getApprovalIcon()}
                    </button>
                    <div className="toolbar-menu-wrap">
                      <button
                        ref={subagentButtonRef}
                        type="button"
                        className={`toolbar-btn subagent-btn ${subagentMenuOpen ? 'active' : ''}`}
                        title="Subagents"
                        onClick={() => (subagentMenuOpen ? setSubagentMenuOpen(false) : openSubagentMenu())}
                        aria-expanded={subagentMenuOpen}
                        aria-haspopup="menu"
                      >
                        <Users size={18} />
                        <span className="subagent-btn-label">Subagents</span>
                      </button>
                      {subagentMenu}
                    </div>
                  </div>
                  <div className="welcome-toolbar-right">
                    <button type="button" className="toolbar-btn labeled-btn" title="Plan">
                      <ListTodo size={16} />
                      <span className="btn-label">Plan</span>
                    </button>
                    <button type="button" className="toolbar-btn labeled-btn" title="Select">
                      <MousePointerClick size={16} />
                      <span className="btn-label">Select</span>
                    </button>
                    <button
                      type="button"
                      className={`send-btn ${hasInput ? 'has-content' : ''}`}
                      onClick={handleSubmit}
                      disabled={!hasInput || status === 'running'}
                    >
                      {status === 'running'
                        ? <Loader2 size={16} className="spinner" />
                        : hasInput
                          ? <ArrowUp size={16} />
                          : (
                            <span className="voice-wave-icon" aria-hidden="true">
                              <span />
                              <span />
                              <span />
                            </span>
                          )
                      }
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="action-pills">
              <button
                className="action-pill"
                onClick={() => onSend('Search the web for the latest AI news and write a summary')}
              >
                <Search size={16} />
                Search the web
              </button>
              <button
                className="action-pill"
                onClick={() => onSend('Create a Python script that generates random passwords and save it to generator.py')}
              >
                <Code size={16} />
                Write code
              </button>
              <button
                className="action-pill"
                onClick={() => onSend('Browse Wikipedia and find information about artificial intelligence')}
              >
                <Globe size={16} />
                Browse sites
              </button>
              <button
                className="action-pill"
                onClick={() => onSend('Create a project structure with index.html, style.css, and app.js for a todo app')}
              >
                <FolderOpen size={16} />
                Manage files
              </button>
            </div>
          </div>
        </div>
        {subagentModal}
      </div>
    );
  }

  // Chat view (messages exist)
  return (
    <div className="chat-panel">
      <div className="messages-list">
        {timeline.map((item) => {
          if (item.type === 'message') {
            return <ChatMessage key={item.key} message={item.data} />;
          }
          if (item.type === 'steps') {
            return <AgentThinking key={item.key} steps={item.data} inline />;
          }
          return null;
        })}
        <div ref={bottomRef} />
      </div>

      {/* Live execution status - above input */}
      <ExecutionStatus steps={steps} status={status} />

      {checkpoints.length > 0 && (
        <div className="checkpoint-indicator">
          <div className="checkpoint-label">Checkpoints</div>
          <div className="checkpoint-list">
            {checkpoints.slice(-6).map(cp => (
              <span key={cp.id} className="checkpoint-pill">#{cp.id}</span>
            ))}
          </div>
        </div>
      )}

      <div className="chat-input-bar">
        {/* Approval bar for ask mode - shown above input */}
        {approvalMode === 'ask' && pendingApproval && (
          <>
            <div className="approval-note">
              Approvals are tied to the main task (not the subagent task), so “Ask” mode works for subagents too.
            </div>
            <ApprovalBar
              approval={pendingApproval}
              onApprove={onApprove}
              onDeny={onDeny}
            />
          </>
        )}
        <div className="welcome-input-box">
          <textarea
            ref={textareaRef}
            className="welcome-textarea"
            value={input}
            onChange={handleTextareaInput}
            onKeyDown={handleKeyDown}
            placeholder="How can Bolt help you today? (or /command)"
            rows={1}
            disabled={status === 'running'}
          />
          {manualIndicator}
          {autoIndicator}
          <div className="welcome-toolbar">
            <div className="welcome-toolbar-left">
              <div className="toolbar-menu-wrap">
                <button
                  ref={plusButtonRef}
                  type="button"
                  className={`toolbar-btn ${plusMenuOpen ? 'active' : ''}`}
                  title="Add"
                  onClick={() => setPlusMenuOpen((open) => !open)}
                  aria-expanded={plusMenuOpen}
                  aria-haspopup="menu"
                >
                  <Plus size={18} />
                </button>
                {plusMenuOpen && (
                  <div ref={plusMenuRef} className="toolbar-menu" role="menu">
                    <button
                      type="button"
                      className="toolbar-menu-item"
                      role="menuitem"
                      onClick={closePlusMenu}
                    >
                      <Paperclip size={14} />
                      Attachments
                    </button>
                      <button
                        type="button"
                        className={`toolbar-menu-item has-sub ${plusSubmenu === 'connectors' ? 'active' : ''}`}
                        role="menuitem"
                        onClick={() => setPlusSubmenu(plusSubmenu === 'connectors' ? null : 'connectors')}
                        onMouseEnter={() => setPlusSubmenu('connectors')}
                        aria-haspopup="menu"
                        aria-expanded={plusSubmenu === 'connectors'}
                      >
                        <Plug size={14} />
                        Connectors
                    </button>
                    {plusSubmenu === 'connectors' && (
                      <div className="toolbar-submenu" role="menu">
                        <div className="toolbar-menu-title">Connectors</div>
                        <button
                          type="button"
                          className="toolbar-menu-item"
                          role="menuitem"
                          onClick={closePlusMenu}
                        >
                          <Database size={14} />
                          Supabase
                        </button>
                        <button
                          type="button"
                          className="toolbar-menu-item"
                          role="menuitem"
                          onClick={closePlusMenu}
                        >
                          <Github size={14} />
                          GitHub
                        </button>
                        <button
                          type="button"
                          className="toolbar-menu-item"
                          role="menuitem"
                          onClick={closePlusMenu}
                        >
                          <Figma size={14} />
                          Figma
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <button
                type="button"
                className={`toolbar-btn approval-btn ${getApprovalClass()}`}
                title={getApprovalTooltip()}
                onClick={cycleApprovalMode}
              >
                {getApprovalIcon()}
              </button>
              <div className="toolbar-menu-wrap">
                <button
                  ref={subagentButtonRef}
                  type="button"
                  className={`toolbar-btn subagent-btn ${subagentMenuOpen ? 'active' : ''}`}
                  title="Subagents"
                  onClick={() => (subagentMenuOpen ? setSubagentMenuOpen(false) : openSubagentMenu())}
                  aria-expanded={subagentMenuOpen}
                  aria-haspopup="menu"
                >
                  <Users size={18} />
                  <span className="subagent-btn-label">Subagents</span>
                </button>
                {subagentMenu}
              </div>
            </div>
            <div className="welcome-toolbar-right">
              <button type="button" className="toolbar-btn labeled-btn" title="Plan">
                <ListTodo size={16} />
                <span className="btn-label">Plan</span>
              </button>
              <button type="button" className="toolbar-btn labeled-btn" title="Select">
                <MousePointerClick size={16} />
                <span className="btn-label">Select</span>
              </button>
              <button
                type="button"
                className={`send-btn ${hasInput ? 'has-content' : ''}`}
                onClick={handleSubmit}
                disabled={!hasInput || status === 'running'}
              >
                {status === 'running'
                  ? <Loader2 size={16} className="spinner" />
                  : hasInput
                    ? <ArrowUp size={16} />
                    : (
                      <span className="voice-wave-icon" aria-hidden="true">
                        <span />
                        <span />
                        <span />
                      </span>
                    )
                }
              </button>
            </div>
          </div>
        </div>
      </div>
      {subagentModal}
    </div>
  );
}
