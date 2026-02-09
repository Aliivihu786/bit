import { useState, useRef, useEffect } from 'react';
import { ChatMessage } from './ChatMessage.jsx';
import { AgentThinking } from './AgentThinking.jsx';
import { ExecutionStatus } from './ExecutionStatus.jsx';
import {
  ArrowUp, Loader2, Plus, Settings, Search, Globe,
  Code, FolderOpen,
} from 'lucide-react';

export function ChatPanel({ messages, steps, status, onSend }) {
  const [input, setInput] = useState('');
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, steps]);

  const handleSubmit = (e) => {
    e?.preventDefault?.();
    if (!input.trim() || status === 'running') return;
    onSend(input.trim());
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
            <h1 className="welcome-heading">What can I do for you?</h1>

            <div className="welcome-input-wrapper">
              <div className="welcome-input-box">
                <textarea
                  ref={textareaRef}
                  className="welcome-textarea"
                  value={input}
                  onChange={handleTextareaInput}
                  onKeyDown={handleKeyDown}
                  placeholder="Assign a task or ask anything"
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

      <div className="chat-input-bar">
        <div className="welcome-input-box">
          <textarea
            ref={textareaRef}
            className="welcome-textarea"
            value={input}
            onChange={handleTextareaInput}
            onKeyDown={handleKeyDown}
            placeholder="Send a message..."
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
    </div>
  );
}
