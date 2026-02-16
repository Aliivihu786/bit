import { useState, useRef, useEffect } from 'react';
import { ChatMessage } from './ChatMessage.jsx';
import { AgentThinking } from './AgentThinking.jsx';
import { ExecutionStatus } from './ExecutionStatus.jsx';
import {
  ArrowUp, Loader2, Plus, Search, Globe,
  Code, FolderOpen, Paperclip, Plug, ListTodo, MousePointerClick,
  Database, Github, Figma,
} from 'lucide-react';

export function ChatPanel({
  messages,
  steps,
  status,
  onSend,
  checkpoints = [],
}) {
  const [input, setInput] = useState('');
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [plusSubmenu, setPlusSubmenu] = useState(null);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);
  const plusMenuRef = useRef(null);
  const plusButtonRef = useRef(null);
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

  const closePlusMenu = () => {
    setPlusMenuOpen(false);
    setPlusSubmenu(null);
  };

  const togglePlusMenu = () => {
    setPlusMenuOpen((open) => {
      const nextOpen = !open;
      if (!nextOpen) setPlusSubmenu(null);
      return nextOpen;
    });
  };

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
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  const hasMessages = messages.length > 0 || steps.length > 0;

  const timeline = [];
  for (let i = 0; i < messages.length; i += 1) {
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

  const renderComposer = () => (
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
          <div className="toolbar-menu-wrap">
            <button
              ref={plusButtonRef}
              type="button"
              className={`toolbar-btn ${plusMenuOpen ? 'active' : ''}`}
              title="Add"
              onClick={togglePlusMenu}
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
                )}
          </button>
        </div>
      </div>
    </div>
  );

  if (!hasMessages) {
    return (
      <div className="chat-panel">
        <div className="messages-list">
          <div className="welcome-screen">
            <h1 className="welcome-heading">How can Bolt help you today?</h1>

            <div className="welcome-input-wrapper">
              {renderComposer()}
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
      </div>
    );
  }

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

      <ExecutionStatus steps={steps} status={status} />

      {checkpoints.length > 0 && (
        <div className="checkpoint-indicator">
          <div className="checkpoint-label">Checkpoints</div>
          <div className="checkpoint-list">
            {checkpoints.slice(-6).map((cp) => (
              <span key={cp.id} className="checkpoint-pill">#{cp.id}</span>
            ))}
          </div>
        </div>
      )}

      <div className="chat-input-bar">
        {renderComposer()}
      </div>
    </div>
  );
}
