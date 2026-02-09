import { useState, useEffect, useRef, useCallback } from 'react';
import { ChatPanel } from './ChatPanel.jsx';
import { CanvasPreview } from './CanvasPreview.jsx';
import { FileBrowser } from './FileBrowser.jsx';
import { CodeEditor } from './CodeEditor.jsx';
import { Terminal } from './Terminal.jsx';
import { useAgent } from '../hooks/useAgent.js';
import {
  Bot, Eye, Code, SquarePen, Search, BookOpen,
  HelpCircle, Settings, Bell, PanelLeftClose, PanelLeftOpen,
  MessageSquare, Trash2, ChevronsLeft, ChevronsRight, Terminal as TerminalIcon,
} from 'lucide-react';

// Slash commands that are handled locally (not sent to agent)
const LOCAL_COMMANDS = {
  '/new': 'Start a new conversation',
  '/reset': 'Start a new conversation (alias for /new)',
  '/clear': 'Clear current conversation',
  '/status': 'Show session status',
  '/help': 'Show available commands',
  '/history': 'Show conversation history',
};

export function Layout() {
  const { messages, steps, status, taskId, browserState, fileVersion, chatHistory, activeChatId, lastFileOperation, terminalCommands, sendMessage, resetChat, loadChat, deleteChat, onFileOperation } = useAgent();
  const [activeTab, setActiveTab] = useState('browser');
  const [selectedFile, setSelectedFile] = useState(null);
  const [explorerOpen, setExplorerOpen] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [systemMessages, setSystemMessages] = useState([]);
  const prevBrowserTimestamp = useRef(null);
  const prevFileVersion = useRef(0);

  const hasMessages = messages.length > 0 || steps.length > 0 || systemMessages.length > 0;
  const showDetail = hasMessages;

  // Handle slash commands locally
  const handleSend = useCallback((text) => {
    const trimmed = text.trim().toLowerCase();

    // Check for slash commands
    if (trimmed.startsWith('/')) {
      const cmd = trimmed.split(' ')[0];

      switch (cmd) {
        case '/new':
        case '/reset':
        case '/clear':
          resetChat();
          setSystemMessages([]);
          return;

        case '/status': {
          const statusInfo = {
            taskId: taskId || 'None',
            status: status,
            messageCount: messages.length,
            historyCount: chatHistory.length,
            currentChat: activeChatId || 'New conversation',
          };
          setSystemMessages(prev => [...prev, {
            role: 'system',
            content: `**Session Status**\n\n` +
              `- Task ID: \`${statusInfo.taskId}\`\n` +
              `- Status: ${statusInfo.status}\n` +
              `- Messages: ${statusInfo.messageCount}\n` +
              `- Saved chats: ${statusInfo.historyCount}\n` +
              `- Current chat: ${statusInfo.currentChat}`
          }]);
          return;
        }

        case '/help': {
          const helpText = Object.entries(LOCAL_COMMANDS)
            .map(([cmd, desc]) => `- \`${cmd}\` - ${desc}`)
            .join('\n');
          setSystemMessages(prev => [...prev, {
            role: 'system',
            content: `**Available Commands**\n\n${helpText}\n\n` +
              `**Agent Commands**\n` +
              `- Just type naturally to talk to the agent\n` +
              `- Ask the agent to "remember X" to save to memory\n` +
              `- Ask "what do you remember about X" to recall memories`
          }]);
          return;
        }

        case '/history': {
          if (chatHistory.length === 0) {
            setSystemMessages(prev => [...prev, {
              role: 'system',
              content: 'No saved conversations yet.'
            }]);
          } else {
            const historyList = chatHistory.slice(0, 10)
              .map((chat, i) => `${i + 1}. ${chat.title}`)
              .join('\n');
            setSystemMessages(prev => [...prev, {
              role: 'system',
              content: `**Recent Conversations**\n\n${historyList}\n\n_Click a chat in the sidebar to load it._`
            }]);
          }
          return;
        }

        default:
          // Unknown command, show help hint
          setSystemMessages(prev => [...prev, {
            role: 'system',
            content: `Unknown command: \`${cmd}\`\n\nType \`/help\` to see available commands.`
          }]);
          return;
      }
    }

    // Not a command, send to agent
    setSystemMessages([]); // Clear system messages when starting new agent conversation
    sendMessage(text);
  }, [taskId, status, messages.length, chatHistory, activeChatId, resetChat, sendMessage]);

  // Combine messages with system messages for display
  const allMessages = [...messages, ...systemMessages];

  // Auto-switch to browser tab when agent creates a canvas (app preview)
  useEffect(() => {
    if (!browserState) return;
    const ts = browserState.timestamp || browserState.type;
    if (ts !== prevBrowserTimestamp.current) {
      prevBrowserTimestamp.current = ts;
      if (browserState.type === 'canvas') {
        setActiveTab('browser');
      }
    }
  }, [browserState]);

  // Auto-switch to editor tab when agent creates/modifies files
  useEffect(() => {
    if (fileVersion > 0 && fileVersion !== prevFileVersion.current) {
      prevFileVersion.current = fileVersion;
      if (activeTab !== 'browser' || !browserState || browserState.type === 'page') {
        setActiveTab('editor');
      }
    }
  }, [fileVersion, activeTab, browserState]);

  // Auto-open files in editor when agent creates/writes them
  useEffect(() => {
    if (!lastFileOperation) return;

    const { path, name } = lastFileOperation;
    console.log('[Layout] Auto-opening file in editor:', { path, name });

    // Auto-select the file (will open in CodeEditor)
    setSelectedFile({ path, name });

    // Always show in editor for code viewing/editing
    setActiveTab('editor');
  }, [lastFileOperation]);

  const handleFileSelect = (file) => {
    setSelectedFile(file);
  };

  return (
    <div className={`layout ${showDetail ? 'has-detail' : ''} ${sidebarOpen ? 'sidebar-expanded' : ''}`}>
      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'expanded' : ''}`}>
        <div className="sidebar-top-section">
          <div className="sidebar-logo">
            <Bot size={24} />
            {sidebarOpen && <span className="sidebar-brand">Bit Agent</span>}
          </div>
          <div className="sidebar-nav-top">
            <button className="sidebar-icon active" onClick={resetChat} title="New task">
              <SquarePen size={20} />
              {sidebarOpen && <span className="sidebar-label">New task</span>}
            </button>
            <button className="sidebar-icon" title="Search">
              <Search size={20} />
              {sidebarOpen && <span className="sidebar-label">Search</span>}
            </button>
            <button className="sidebar-icon" title="Library">
              <BookOpen size={20} />
              {sidebarOpen && <span className="sidebar-label">Library</span>}
            </button>
          </div>

          {/* Recent Chats */}
          {sidebarOpen && chatHistory.length > 0 && (
            <div className="sidebar-history">
              <div className="sidebar-history-header">Recent</div>
              <div className="sidebar-history-list">
                {chatHistory.map((chat) => (
                  <div
                    key={chat.id}
                    className={`sidebar-history-item ${activeChatId === chat.id ? 'active' : ''}`}
                    onClick={() => loadChat(chat)}
                  >
                    <MessageSquare size={14} className="history-icon" />
                    <span className="history-title">{chat.title}</span>
                    <button
                      className="history-delete"
                      onClick={(e) => { e.stopPropagation(); deleteChat(chat.id); }}
                      title="Delete"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="sidebar-nav-bottom">
          <button className="sidebar-icon" title="Help">
            <HelpCircle size={20} />
            {sidebarOpen && <span className="sidebar-label">Help</span>}
          </button>
          <button className="sidebar-icon" title="Settings">
            <Settings size={20} />
            {sidebarOpen && <span className="sidebar-label">Settings</span>}
          </button>
          <button
            className="sidebar-icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            title={sidebarOpen ? 'Collapse' : 'Expand'}
          >
            {sidebarOpen ? <ChevronsLeft size={20} /> : <ChevronsRight size={20} />}
            {sidebarOpen && <span className="sidebar-label">Collapse</span>}
          </button>
        </div>
      </aside>

      {/* Content Area */}
      <div className="content-area">
        {/* Top Bar */}
        <div className="top-bar">
          <div className="top-bar-left">
            <span className="top-bar-title">Bit Agent</span>
          </div>
          <div className="top-bar-right">
            <button className="top-bar-btn" title="Notifications">
              <Bell size={18} />
            </button>
            <div className="user-avatar">A</div>
          </div>
        </div>

        {/* Main Panel */}
        <main className="main-panel">
          <ChatPanel
            messages={allMessages}
            steps={steps}
            status={status}
            onSend={handleSend}
          />
        </main>
      </div>

      {/* Detail Panel — only shown when task is active */}
      {showDetail && (
        <aside className="detail-panel">
          <div className="tab-bar">
            <button
              className={`${activeTab === 'browser' ? 'active' : ''} ${browserState && browserState.type === 'canvas' ? 'tab-pulse' : ''}`}
              onClick={() => setActiveTab('browser')}
            >
              <Eye size={16} />
              Preview
            </button>
            <button
              className={activeTab === 'editor' ? 'active' : ''}
              onClick={() => setActiveTab('editor')}
            >
              <Code size={16} />
              Editor
            </button>
            <button
              className={`${activeTab === 'terminal' ? 'active' : ''} ${terminalCommands.length > 0 ? 'tab-pulse' : ''}`}
              onClick={() => setActiveTab('terminal')}
            >
              <TerminalIcon size={16} />
              Terminal
            </button>
          </div>

          <div className="tab-content">
            {activeTab === 'browser' && (
              <CanvasPreview browserState={browserState} />
            )}
            {activeTab === 'editor' && (
              <div className="editor-panel">
                {explorerOpen ? (
                  <FileBrowser
                    taskId={taskId}
                    onFileSelect={handleFileSelect}
                    fileVersion={fileVersion}
                    onToggleSidebar={() => setExplorerOpen(false)}
                  />
                ) : (
                  <div className="explorer-collapsed">
                    <button
                      className="explorer-toggle-btn"
                      onClick={() => setExplorerOpen(true)}
                      title="Open sidebar"
                    >
                      <PanelLeftOpen size={16} />
                    </button>
                  </div>
                )}
                <CodeEditor taskId={taskId} file={selectedFile} onFileSelect={handleFileSelect} fileVersion={fileVersion} />
              </div>
            )}
            {activeTab === 'terminal' && (
              <Terminal commands={terminalCommands} />
            )}
          </div>
        </aside>
      )}
    </div>
  );
}
