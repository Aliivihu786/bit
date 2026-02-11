import { useState, useRef, useEffect, useMemo } from 'react';
import { ChatMessage } from './ChatMessage.jsx';
import { AgentThinking } from './AgentThinking.jsx';
import { ExecutionStatus } from './ExecutionStatus.jsx';
import { listSubagents, createSubagent, listAgentTools, generateSubagentSpec } from '../api/client.js';
import {
  ArrowUp, Loader2, Plus, Settings, Search, Globe, Users,
  Code, FolderOpen,
} from 'lucide-react';

export function ChatPanel({ messages, steps, status, onSend, checkpoints = [] }) {
  const [input, setInput] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [subagentOpen, setSubagentOpen] = useState(false);
  const [subagents, setSubagents] = useState([]);
  const [availableTools, setAvailableTools] = useState([]);
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
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, steps]);

  const handleSubmit = (e) => {
    e?.preventDefault?.();
    const message = input.trim();
    if (!message || status === 'running') return;
    onSend(message);
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
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
      await createSubagent({
        name: subagentForm.name.trim(),
        description: subagentForm.description.trim(),
        system_prompt: subagentForm.systemPrompt.trim(),
        tools: tools.length ? tools : undefined,
        exclude_tools: excludeTools.length ? excludeTools : undefined,
      });
      const data = await listSubagents();
      setSubagents(Array.isArray(data.subagents) ? data.subagents : []);
      setSubagentStatus({ loading: false, error: '', success: 'Subagent created. The main agent can invoke it via the task tool.' });
      setSubagentForm({ name: '', idea: '', description: '', systemPrompt: '', tools: [], excludeTools: '' });
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
          <div className="subagent-list">
            <div className="subagent-section-title">Available</div>
            {subagentStatus.loading && <div className="subagent-empty">Loading...</div>}
            {!subagentStatus.loading && subagents.length === 0 && (
              <div className="subagent-empty">No subagents configured.</div>
            )}
            {subagents.map((agent) => (
              <div key={agent.name} className="subagent-item">
                <div className="subagent-name">
                  {agent.name}
                  <span className={`subagent-kind ${agent.kind || 'dynamic'}`}>
                    {agent.kind || 'dynamic'}
                  </span>
                </div>
                <div className="subagent-desc">{agent.description}</div>
                {(agent.tools?.length || agent.excludeTools?.length) && (
                  <div className="subagent-meta">
                    {agent.tools?.length ? `Tools: ${agent.tools.join(', ')}` : null}
                    {agent.excludeTools?.length ? `Exclude: ${agent.excludeTools.join(', ')}` : null}
                  </div>
                )}
                <div className="subagent-meta">
                  Invoked by the main agent via the task tool.
                </div>
              </div>
            ))}
          </div>
          <div className="subagent-form">
            <div className="subagent-section-title">Create Dynamic Subagent</div>
            <div className="subagent-suggestion">
              Try creating: Code Reviewer, Code Simplifier, Security Reviewer, Tech Lead, or UX Reviewer.
            </div>
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
            <button className="subagent-create" onClick={handleCreateSubagent} disabled={subagentStatus.loading}>
              {subagentStatus.loading ? 'Creating...' : 'Create Subagent'}
            </button>
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
                <div className="welcome-toolbar">
                  <div className="welcome-toolbar-left">
                    <button type="button" className="toolbar-btn" title="Add">
                      <Plus size={18} />
                    </button>
                    <button type="button" className="toolbar-btn" title="Settings">
                      <Settings size={18} />
                    </button>
                    <button type="button" className="toolbar-btn" title="Subagents" onClick={openSubagents}>
                      <Users size={18} />
                    </button>
                  </div>
                  <div className="welcome-toolbar-right">
                    <button
                      type="button"
                      className={`send-btn ${input.trim() ? 'has-content' : ''}`}
                      onClick={handleSubmit}
                      disabled={!input.trim() || status === 'running'}
                    >
                      {status === 'running'
                        ? <Loader2 size={16} className="spinner" />
                        : <ArrowUp size={16} />
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
          <div className="welcome-toolbar">
            <div className="welcome-toolbar-left">
              <button type="button" className="toolbar-btn" title="Add">
                <Plus size={18} />
              </button>
              <button type="button" className="toolbar-btn" title="Settings">
                <Settings size={18} />
              </button>
              <button type="button" className="toolbar-btn" title="Subagents" onClick={openSubagents}>
                <Users size={18} />
              </button>
            </div>
            <div className="welcome-toolbar-right">
              <button
                type="button"
                className={`send-btn ${input.trim() ? 'has-content' : ''}`}
                onClick={handleSubmit}
                disabled={!input.trim() || status === 'running'}
              >
                {status === 'running'
                  ? <Loader2 size={16} className="spinner" />
                  : <ArrowUp size={16} />
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
