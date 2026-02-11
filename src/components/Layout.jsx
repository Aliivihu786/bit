import { useState, useEffect, useRef, useCallback } from 'react';
import { ChatPanel } from './ChatPanel.jsx';
import { CanvasPreview } from './CanvasPreview.jsx';
import { FileBrowser } from './FileBrowser.jsx';
import { CodeEditor } from './CodeEditor.jsx';
import { useAgent } from '../hooks/useAgent.js';
import {
  Eye, Code, SquarePen, Search, FolderKanban,
  User, PanelLeftOpen, HelpCircle, Star, SlidersHorizontal, Settings, LogOut, X, ChevronDown,
  MessageSquare, Trash2, ChevronsLeft, ChevronsRight, Bell, LayoutGrid, ChevronRight, KeyRound,
  Github, Share2, UploadCloud, Lock, Database, Mail,
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
  const {
    messages, steps, status, taskId, browserState, fileVersion, chatHistory, activeChatId, lastFileOperation,
    approvalMode, pendingApproval,
    selectedAgent, setSelectedAgent, currentAgentInfo,
    sendMessage, resetChat, loadChat, deleteChat, onFileOperation, checkpoints, autoSubagent, runSubagent,
    approveAction, denyAction, setApprovalMode,
  } = useAgent();
  const [activeTab, setActiveTab] = useState('browser');
  const [selectedFile, setSelectedFile] = useState(null);
  const [explorerOpen, setExplorerOpen] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState('General');
  const [settingsTabLoading, setSettingsTabLoading] = useState(false);
  const [appearanceMenuOpen, setAppearanceMenuOpen] = useState(false);
  const [appearanceValue, setAppearanceValue] = useState(() => {
    if (typeof localStorage === 'undefined') return 'system';
    return localStorage.getItem('appearance') || 'system';
  });
  const [accentMenuOpen, setAccentMenuOpen] = useState(false);
  const [accentValue, setAccentValue] = useState(() => {
    if (typeof localStorage === 'undefined') return 'default';
    return localStorage.getItem('accent') || 'default';
  });
  const [notificationMenuOpen, setNotificationMenuOpen] = useState(null);
  const [notificationPrefs, setNotificationPrefs] = useState(() => {
    const defaults = {
      responses: 'push',
      tasks: 'push_email',
      projects: 'email',
      recommendations: 'push_email',
      usage: 'push_email',
    };
    if (typeof localStorage === 'undefined') return defaults;
    try {
      const stored = JSON.parse(localStorage.getItem('notifications') || '{}');
      return { ...defaults, ...stored };
    } catch {
      return defaults;
    }
  });
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const [languageValue, setLanguageValue] = useState(() => {
    if (typeof localStorage === 'undefined') return 'auto';
    return localStorage.getItem('language') || 'auto';
  });
  const [securityMfa, setSecurityMfa] = useState(() => {
    const defaults = { authenticator: true, textMessage: false };
    if (typeof localStorage === 'undefined') return defaults;
    try {
      const stored = JSON.parse(localStorage.getItem('securityMfa') || '{}');
      return { ...defaults, ...stored };
    } catch {
      return defaults;
    }
  });
  const [systemMessages, setSystemMessages] = useState([]);
  const [subagentOpenRequest, setSubagentOpenRequest] = useState(0);
  const prevBrowserTimestamp = useRef(null);
  const prevFileVersion = useRef(0);
  const settingsMenuRef = useRef(null);
  const settingsButtonRef = useRef(null);
  const tabSwitchTimeout = useRef(null);
  const appearanceMenuRef = useRef(null);
  const appearanceButtonRef = useRef(null);
  const accentMenuRef = useRef(null);
  const accentButtonRef = useRef(null);
  const notificationMenuRef = useRef({});
  const notificationButtonRef = useRef({});
  const languageMenuRef = useRef(null);
  const languageButtonRef = useRef(null);

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

  useEffect(() => {
    if (!settingsMenuOpen) return;
    const handleClick = (e) => {
      if (settingsMenuRef.current?.contains(e.target)) return;
      if (settingsButtonRef.current?.contains(e.target)) return;
      setSettingsMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [settingsMenuOpen]);

  useEffect(() => {
    if (!appearanceMenuOpen) return;
    const handleClick = (e) => {
      if (appearanceMenuRef.current?.contains(e.target)) return;
      if (appearanceButtonRef.current?.contains(e.target)) return;
      setAppearanceMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [appearanceMenuOpen]);

  useEffect(() => {
    if (!accentMenuOpen) return;
    const handleClick = (e) => {
      if (accentMenuRef.current?.contains(e.target)) return;
      if (accentButtonRef.current?.contains(e.target)) return;
      setAccentMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [accentMenuOpen]);

  useEffect(() => {
    if (!notificationMenuOpen) return;
    const handleClick = (e) => {
      const menuEl = notificationMenuRef.current?.[notificationMenuOpen];
      const buttonEl = notificationButtonRef.current?.[notificationMenuOpen];
      if (menuEl?.contains(e.target)) return;
      if (buttonEl?.contains(e.target)) return;
      setNotificationMenuOpen(null);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [notificationMenuOpen]);

  useEffect(() => {
    if (!languageMenuOpen) return;
    const handleClick = (e) => {
      if (languageMenuRef.current?.contains(e.target)) return;
      if (languageButtonRef.current?.contains(e.target)) return;
      setLanguageMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [languageMenuOpen]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const getSystemTheme = () => (
      window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    );

    const applyTheme = (theme) => {
      root.dataset.theme = theme;
      window.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));
    };

    if (appearanceValue === 'system') {
      const media = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = () => applyTheme(getSystemTheme());
      applyTheme(getSystemTheme());
      if (media.addEventListener) {
        media.addEventListener('change', handleChange);
      } else if (media.addListener) {
        media.addListener(handleChange);
      }
      localStorage.setItem('appearance', 'system');
      return () => {
        if (media.removeEventListener) {
          media.removeEventListener('change', handleChange);
        } else if (media.removeListener) {
          media.removeListener(handleChange);
        }
      };
    }

    applyTheme(appearanceValue);
    localStorage.setItem('appearance', appearanceValue);
  }, [appearanceValue]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const palette = {
      default: null,
      blue: { accent: '#2563eb', hover: '#1d4ed8', contrast: '#ffffff' },
      yellow: { accent: '#f59e0b', hover: '#d97706', contrast: '#111827' },
      green: { accent: '#22c55e', hover: '#16a34a', contrast: '#ffffff' },
      pink: { accent: '#ec4899', hover: '#db2777', contrast: '#ffffff' },
      orange: { accent: '#f97316', hover: '#ea580c', contrast: '#ffffff' },
    };

    if (accentValue === 'default') {
      root.style.removeProperty('--accent');
      root.style.removeProperty('--accent-hover');
      root.style.removeProperty('--accent-contrast');
      root.style.removeProperty('--user-bubble');
      root.style.removeProperty('--user-bubble-contrast');
      localStorage.setItem('accent', 'default');
      return;
    }

    const theme = palette[accentValue];
    if (!theme) return;
    root.style.setProperty('--accent', theme.accent);
    root.style.setProperty('--accent-hover', theme.hover);
    root.style.setProperty('--accent-contrast', theme.contrast);
    root.style.setProperty('--user-bubble', theme.accent);
    root.style.setProperty('--user-bubble-contrast', theme.contrast);
    localStorage.setItem('accent', accentValue);
  }, [accentValue]);

  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem('language', languageValue);
  }, [languageValue]);

  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem('notifications', JSON.stringify(notificationPrefs));
  }, [notificationPrefs]);

  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem('securityMfa', JSON.stringify(securityMfa));
  }, [securityMfa]);

  const openSettingsModal = useCallback((tab) => {
    setSettingsMenuOpen(false);
    setSettingsTab(tab);
    setSettingsModalOpen(true);
    setSettingsTabLoading(false);
    setAppearanceMenuOpen(false);
    setAccentMenuOpen(false);
    setNotificationMenuOpen(null);
    setLanguageMenuOpen(false);
  }, []);

  const closeSettingsModal = useCallback(() => {
    setSettingsModalOpen(false);
    setAppearanceMenuOpen(false);
    setAccentMenuOpen(false);
    setNotificationMenuOpen(null);
    setLanguageMenuOpen(false);
    setSettingsTabLoading(false);
    if (tabSwitchTimeout.current) {
      clearTimeout(tabSwitchTimeout.current);
      tabSwitchTimeout.current = null;
    }
  }, []);

  const handleSettingsTabChange = useCallback((tab) => {
    if (tab === settingsTab) return;
    setSettingsTabLoading(true);
    if (tabSwitchTimeout.current) {
      clearTimeout(tabSwitchTimeout.current);
    }
    tabSwitchTimeout.current = setTimeout(() => {
      setSettingsTab(tab);
      setSettingsTabLoading(false);
      tabSwitchTimeout.current = null;
    }, 350);
  }, [settingsTab]);

  const formatNotificationLabel = (value) => {
    if (value === 'push_whatsapp') return 'Push, WhatsApp';
    if (value === 'push_email') return 'Push, Email';
    if (value === 'push') return 'Push';
    if (value === 'email') return 'Email';
    if (value === 'whatsapp') return 'WhatsApp';
    return 'Off';
  };

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

  // Track file updates without auto-switching the active tab
  useEffect(() => {
    if (fileVersion > 0 && fileVersion !== prevFileVersion.current) {
      prevFileVersion.current = fileVersion;
    }
  }, [fileVersion]);

  // Auto-open files in editor when agent creates/writes them
  useEffect(() => {
    if (!lastFileOperation) return;

    const { path, name } = lastFileOperation;
    console.log('[Layout] Auto-opening file in editor:', { path, name });

    // Auto-select the file (will open in CodeEditor)
    setSelectedFile({ path, name });

    // Do not auto-switch to editor; keep preview active unless user clicks
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
            <div className="brand-mark">b</div>
            {sidebarOpen && <span className="sidebar-brand">bit</span>}
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
          <button className="sidebar-icon" title="Project">
            <FolderKanban size={20} />
            {sidebarOpen && <span className="sidebar-label">Project</span>}
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
          <div className="sidebar-menu-wrap">
            <button
              ref={settingsButtonRef}
              className={`sidebar-icon ${settingsMenuOpen ? 'active' : ''}`}
              title="User"
              onClick={() => setSettingsMenuOpen((open) => !open)}
              aria-expanded={settingsMenuOpen}
              aria-haspopup="menu"
            >
              <User size={20} />
              {sidebarOpen && <span className="sidebar-label">User</span>}
            </button>
            {settingsMenuOpen && (
              <div ref={settingsMenuRef} className="sidebar-menu" role="menu">
                <div className="sidebar-profile">
                  <div className="sidebar-profile-avatar">
                    <User size={14} />
                  </div>
                  <div className="sidebar-profile-info">
                    <div className="sidebar-profile-name">User</div>
                    <div className="sidebar-profile-email">user@example.com</div>
                  </div>
                </div>
                <div className="sidebar-menu-divider" />
                <button
                  type="button"
                  className="sidebar-menu-item"
                  role="menuitem"
                  onClick={() => setSettingsMenuOpen(false)}
                >
                  <Star size={14} />
                  Upgrade Plan
                </button>
                <button
                  type="button"
                  className="sidebar-menu-item"
                  role="menuitem"
                  onClick={() => openSettingsModal('Personalization')}
                >
                  <SlidersHorizontal size={14} />
                  Personalization
                </button>
                <button
                  type="button"
                  className="sidebar-menu-item"
                  role="menuitem"
                  onClick={() => openSettingsModal('General')}
                >
                  <Settings size={14} />
                  Settings
                </button>
                <div className="sidebar-menu-divider" />
                <button
                  type="button"
                  className="sidebar-menu-item"
                  role="menuitem"
                  onClick={() => {
                    setSettingsMenuOpen(false);
                    handleSend('/help');
                  }}
                >
                  <HelpCircle size={14} />
                  Help
                </button>
                <button
                  type="button"
                  className="sidebar-menu-item"
                  role="menuitem"
                  onClick={() => {
                    setSettingsMenuOpen(false);
                  }}
                >
                  <LogOut size={14} />
                  Logout
                </button>
              </div>
            )}
          </div>
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

      {settingsModalOpen && (
        <div className="settings-modal-overlay" onClick={closeSettingsModal}>
          <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
            <div className="settings-modal-left">
              <button className="settings-close" onClick={closeSettingsModal}>
                <X size={16} />
              </button>
              <div className="settings-tabs">
                {[
                  { label: 'General', icon: <Settings size={16} /> },
                  { label: 'Notifications', icon: <Bell size={16} /> },
                  { label: 'Personalization', icon: <SlidersHorizontal size={16} /> },
                  { label: 'Apps', icon: <LayoutGrid size={16} /> },
                  { label: 'Data controls', icon: <Database size={16} /> },
                  { label: 'Security', icon: <Lock size={16} /> },
                  { label: 'Account', icon: <User size={16} /> },
                ].map((tab) => (
                  <button
                    key={tab.label}
                    className={`settings-tab ${settingsTab === tab.label ? 'active' : ''}`}
                    onClick={() => handleSettingsTabChange(tab.label)}
                  >
                    <span className="settings-tab-icon">{tab.icon}</span>
                    <span className="settings-tab-label">{tab.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="settings-modal-right">
              <div className="settings-modal-header">
                <h2>{settingsTab}</h2>
              </div>
              {settingsTabLoading && (
                <div className="settings-loading">
                  <div className="spinner" />
                  <span>Loading…</span>
                </div>
              )}
              {!settingsTabLoading && settingsTab === 'General' && (
                <div className="settings-section">
                  <div className="settings-row">
                    <span>Appearance</span>
                    <div className="settings-select-wrap">
                      <button
                        ref={appearanceButtonRef}
                        type="button"
                        className={`settings-select-btn ${appearanceMenuOpen ? 'open' : ''}`}
                        onClick={() => {
                          setLanguageMenuOpen(false);
                          setAccentMenuOpen(false);
                          setNotificationMenuOpen(null);
                          setAppearanceMenuOpen((open) => !open);
                        }}
                        aria-expanded={appearanceMenuOpen}
                        aria-haspopup="menu"
                      >
                        <span className="settings-select-label">
                          {appearanceValue === 'system'
                            ? 'System'
                            : appearanceValue === 'dark'
                              ? 'Dark'
                              : 'Light'}
                        </span>
                        <ChevronDown size={14} />
                      </button>
                      {appearanceMenuOpen && (
                        <div ref={appearanceMenuRef} className="settings-select-menu" role="menu">
                          {[
                            { value: 'system', label: 'System' },
                            { value: 'dark', label: 'Dark' },
                            { value: 'light', label: 'Light' },
                          ].map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              role="menuitem"
                              className={`settings-select-option ${appearanceValue === option.value ? 'active' : ''}`}
                              onClick={() => {
                                setAppearanceValue(option.value);
                                setAppearanceMenuOpen(false);
                              }}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="settings-row">
                    <span>Accent color</span>
                    <div className="settings-select-wrap">
                      <button
                        ref={accentButtonRef}
                        type="button"
                        className={`settings-select-btn ${accentMenuOpen ? 'open' : ''}`}
                        onClick={() => {
                          setAppearanceMenuOpen(false);
                          setLanguageMenuOpen(false);
                          setNotificationMenuOpen(null);
                          setAccentMenuOpen((open) => !open);
                        }}
                        aria-expanded={accentMenuOpen}
                        aria-haspopup="menu"
                      >
                        <span className="settings-select-label">
                          {accentValue.charAt(0).toUpperCase() + accentValue.slice(1)}
                        </span>
                        <ChevronDown size={14} />
                      </button>
                      {accentMenuOpen && (
                        <div ref={accentMenuRef} className="settings-select-menu" role="menu">
                          {[
                            { value: 'default', label: 'Default', dot: 'accent-dot-default' },
                            { value: 'blue', label: 'Blue', dot: 'accent-dot-blue' },
                            { value: 'yellow', label: 'Yellow', dot: 'accent-dot-yellow' },
                            { value: 'green', label: 'Green', dot: 'accent-dot-green' },
                            { value: 'pink', label: 'Pink', dot: 'accent-dot-pink' },
                            { value: 'orange', label: 'Orange', dot: 'accent-dot-orange' },
                          ].map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              role="menuitem"
                              className={`settings-select-option ${accentValue === option.value ? 'active' : ''}`}
                              onClick={() => {
                                setAccentValue(option.value);
                                setAccentMenuOpen(false);
                              }}
                            >
                              <span className={`accent-dot ${option.dot}`} />
                              {option.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="settings-row">
                    <span>Language</span>
                    <div className="settings-select-wrap">
                      <button
                        ref={languageButtonRef}
                        type="button"
                        className={`settings-select-btn ${languageMenuOpen ? 'open' : ''}`}
                        onClick={() => {
                          setAppearanceMenuOpen(false);
                          setAccentMenuOpen(false);
                          setNotificationMenuOpen(null);
                          setLanguageMenuOpen((open) => !open);
                        }}
                        aria-expanded={languageMenuOpen}
                        aria-haspopup="menu"
                      >
                        <span className="settings-select-label">
                          {(() => {
                            const labelMap = {
                              auto: 'Auto-detect',
                              en: 'English',
                              es: 'Spanish',
                              fr: 'French',
                              de: 'German',
                              ar: 'Arabic',
                              hi: 'Hindi',
                            };
                            return labelMap[languageValue] || 'Auto-detect';
                          })()}
                        </span>
                        <ChevronDown size={14} />
                      </button>
                      {languageMenuOpen && (
                        <div ref={languageMenuRef} className="settings-select-menu" role="menu">
                          {[
                            { value: 'auto', label: 'Auto-detect' },
                            { value: 'en', label: 'English' },
                            { value: 'es', label: 'Spanish' },
                            { value: 'fr', label: 'French' },
                            { value: 'de', label: 'German' },
                            { value: 'ar', label: 'Arabic' },
                            { value: 'hi', label: 'Hindi' },
                          ].map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              role="menuitem"
                              className={`settings-select-option ${languageValue === option.value ? 'active' : ''}`}
                              onClick={() => {
                                setLanguageValue(option.value);
                                setLanguageMenuOpen(false);
                              }}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="settings-row">
                    <span>Voice</span>
                    <span className="settings-value">Coming soon</span>
                  </div>
                  <div className="settings-row">
                    <span>Separate Voice</span>
                    <span className="settings-value">Coming soon</span>
                  </div>
                </div>
              )}
              {!settingsTabLoading && settingsTab === 'Notifications' && (
                <div className="settings-section">
                  {[
                    {
                      key: 'responses',
                      title: 'Responses',
                      description: 'Get notified when bitagent responds to requests that take time, like research or working on big task.',
                    },
                    {
                      key: 'tasks',
                      title: 'Tasks',
                      description: "Get notified when tasks you've created have updates.",
                      link: 'Manage tasks',
                    },
                    {
                      key: 'projects',
                      title: 'Projects',
                      description: 'Get notified when you receive an email invitation to a shared project.',
                    },
                    {
                      key: 'recommendations',
                      title: 'Recommendations',
                      description: 'Stay in the loop on new tools, tips, and features from bit.',
                    },
                    {
                      key: 'usage',
                      title: 'Usage',
                      description: 'Get notified when your usage limits or activity change.',
                    },
                  ].map((item) => (
                    <div key={item.key} className="settings-row settings-row-notification">
                      <div className="settings-row-info">
                        <div className="settings-row-title">{item.title}</div>
                        <div className="settings-row-sub">{item.description}</div>
                        {item.link && (
                          <button type="button" className="settings-link">
                            {item.link}
                          </button>
                        )}
                      </div>
                      <div className="settings-select-wrap">
                        <button
                          ref={(node) => {
                            notificationButtonRef.current[item.key] = node;
                          }}
                          type="button"
                          className={`settings-select-btn ${notificationMenuOpen === item.key ? 'open' : ''}`}
                          onClick={() => {
                            setAppearanceMenuOpen(false);
                            setAccentMenuOpen(false);
                            setLanguageMenuOpen(false);
                            setNotificationMenuOpen((open) => (open === item.key ? null : item.key));
                          }}
                          aria-expanded={notificationMenuOpen === item.key}
                          aria-haspopup="menu"
                        >
                          <span className="settings-select-label">
                            {formatNotificationLabel(notificationPrefs[item.key])}
                          </span>
                          <ChevronDown size={14} />
                        </button>
                        {notificationMenuOpen === item.key && (
                          <div
                            ref={(node) => {
                              notificationMenuRef.current[item.key] = node;
                            }}
                            className={`settings-select-menu ${item.key === 'usage' ? 'drop-up' : ''}`}
                            role="menu"
                          >
                            {[
                              { value: 'push', label: 'Push' },
                              { value: 'email', label: 'Email' },
                              { value: 'whatsapp', label: 'WhatsApp' },
                              { value: 'push_email', label: 'Push, Email' },
                              { value: 'push_whatsapp', label: 'Push, WhatsApp' },
                              { value: 'off', label: 'Off' },
                            ].map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                role="menuitem"
                                className={`settings-select-option ${notificationPrefs[item.key] === option.value ? 'active' : ''}`}
                                onClick={() => {
                                  setNotificationPrefs((prev) => ({
                                    ...prev,
                                    [item.key]: option.value,
                                  }));
                                  setNotificationMenuOpen(null);
                                }}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {!settingsTabLoading && settingsTab === 'Personalization' && (
                <div className="settings-section">
                  <div className="settings-row settings-row-notification">
                    <div className="settings-row-info">
                      <div className="settings-row-title">Subagents</div>
                      <div className="settings-row-sub">
                        Create focused helpers that run in the background for reviews, testing, or research.
                        Each subagent keeps its own context and reports back with a concise summary.
                      </div>
                    </div>
                    <button
                      type="button"
                      className="settings-action-btn"
                      onClick={() => {
                        closeSettingsModal();
                        setSubagentOpenRequest((value) => value + 1);
                      }}
                    >
                      Configure
                    </button>
                  </div>
                  <div className="settings-row settings-row-notification">
                    <div className="settings-row-info">
                      <div className="settings-row-title">Agent Team</div>
                      <div className="settings-row-sub">
                        Assemble a team of specialists for bigger projects. Route tasks to the right agent and
                        keep ownership clear with shared goals.
                      </div>
                    </div>
                    <button type="button" className="settings-action-btn">
                      Configure
                    </button>
                  </div>
                </div>
              )}
              {!settingsTabLoading && settingsTab === 'Apps' && (
                <div className="settings-section">
                  {[
                    {
                      key: 'github',
                      title: 'Connect to GitHub',
                      description: 'Sync repositories, PRs, and code context for faster reviews.',
                      icon: <Github size={16} />,
                    },
                    {
                      key: 'supabase',
                      title: 'Connect to Supabase',
                      description: 'Link your Supabase project to enable database-aware assistance.',
                      icon: <Database size={16} />,
                    },
                    {
                      key: 'whatsapp',
                      title: 'Connect to WhatsApp',
                      description: 'Receive updates and notifications directly in WhatsApp.',
                      icon: <MessageSquare size={16} />,
                    },
                    {
                      key: 'gmail',
                      title: 'Link your account to Gmail',
                      description: 'Connect Gmail to surface emails and replies in your workflow.',
                      icon: <Mail size={16} />,
                    },
                  ].map((item) => (
                    <div key={item.key} className="settings-row settings-row-notification">
                      <div className="settings-row-info">
                        <div className="settings-row-title with-icon">
                          <span className="settings-row-icon">{item.icon}</span>
                          {item.title}
                        </div>
                        <div className="settings-row-sub">{item.description}</div>
                      </div>
                      <button type="button" className="settings-action-btn">
                        Connect
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {!settingsTabLoading && settingsTab === 'Data controls' && (
                <div className="settings-section">
                  <div className="settings-row settings-row-notification">
                    <div className="settings-row-info">
                      <div className="settings-row-title">Shared links</div>
                    </div>
                    <button type="button" className="settings-action-btn">
                      Manage
                    </button>
                  </div>
                  <div className="settings-row settings-row-notification">
                    <div className="settings-row-info">
                      <div className="settings-row-title">Archived chats</div>
                    </div>
                    <button type="button" className="settings-action-btn">
                      Manage
                    </button>
                  </div>
                  <div className="settings-row settings-row-notification">
                    <div className="settings-row-info">
                      <div className="settings-row-title">Archive all chats</div>
                    </div>
                    <button type="button" className="settings-action-btn">
                      Archive all
                    </button>
                  </div>
                  <div className="settings-row settings-row-notification">
                    <div className="settings-row-info">
                      <div className="settings-row-title">Delete all chats</div>
                    </div>
                    <button type="button" className="settings-action-btn danger">
                      Delete all
                    </button>
                  </div>
                  <div className="settings-row settings-row-notification">
                    <div className="settings-row-info">
                      <div className="settings-row-title">Export data</div>
                    </div>
                    <button type="button" className="settings-action-btn">
                      Export
                    </button>
                  </div>
                </div>
              )}
              {!settingsTabLoading && settingsTab === 'Security' && (
                <div className="settings-section">
                  <div className="settings-row settings-row-notification">
                    <div className="settings-row-info">
                      <div className="settings-row-title">Passkeys</div>
                      <div className="settings-row-sub">
                        Passkeys are secure and protect your account with multi-factor authentication. They don't require any extra steps.
                      </div>
                    </div>
                    <button type="button" className="settings-action-btn settings-action-inline">
                      Add
                      <ChevronRight size={14} />
                    </button>
                  </div>

                  <div className="settings-section-title">Multi-factor authentication (MFA)</div>
                  <div className="settings-card">
                    <span className="settings-card-icon">
                      <KeyRound size={16} />
                    </span>
                    <div className="settings-card-text">Add another method to prevent lockouts</div>
                  </div>

                  <div className="settings-row settings-row-notification">
                    <div className="settings-row-info">
                      <div className="settings-row-title">Authenticator app</div>
                      <div className="settings-row-sub">Use one-time codes from an authenticator app.</div>
                    </div>
                    <button
                      type="button"
                      className={`settings-toggle ${securityMfa.authenticator ? 'on' : ''}`}
                      onClick={() =>
                        setSecurityMfa((prev) => ({ ...prev, authenticator: !prev.authenticator }))
                      }
                      aria-pressed={securityMfa.authenticator}
                    />
                  </div>
                  <div className="settings-row settings-row-notification">
                    <div className="settings-row-info">
                      <div className="settings-row-title">Text message</div>
                      <div className="settings-row-sub">
                        Get 6-digit verification codes by SMS or WhatsApp based on your country code.
                      </div>
                    </div>
                    <button
                      type="button"
                      className={`settings-toggle ${securityMfa.textMessage ? 'on' : ''}`}
                      onClick={() =>
                        setSecurityMfa((prev) => ({ ...prev, textMessage: !prev.textMessage }))
                      }
                      aria-pressed={securityMfa.textMessage}
                    />
                  </div>

                  <div className="settings-row settings-row-notification">
                    <div className="settings-row-info">
                      <div className="settings-row-title">Trusted Devices</div>
                      <div className="settings-row-sub">
                        When you sign in on another device, it will be added here and can automatically receive device prompts for signing in.
                      </div>
                    </div>
                  </div>

                  <div className="settings-row settings-row-notification">
                    <div className="settings-row-info">
                      <div className="settings-row-title">Log out of this device</div>
                    </div>
                    <button type="button" className="settings-action-btn">
                      Log out
                    </button>
                  </div>
                  <div className="settings-row settings-row-notification">
                    <div className="settings-row-info">
                      <div className="settings-row-title">Log out of all devices</div>
                    </div>
                    <button type="button" className="settings-action-btn danger">
                      Log out all
                    </button>
                  </div>
                </div>
              )}
              {!settingsTabLoading && settingsTab === 'Account' && (
                <div className="settings-section">
                  <div className="settings-row settings-row-notification">
                    <div className="settings-row-info">
                      <div className="settings-row-title">Name</div>
                      <div className="settings-row-sub">Aman</div>
                    </div>
                  </div>
                  <div className="settings-row settings-row-notification">
                    <div className="settings-row-info">
                      <div className="settings-row-title">Email</div>
                      <div className="settings-row-sub">aman@example.com</div>
                    </div>
                  </div>
                  <div className="settings-row settings-row-notification">
                    <div className="settings-row-info">
                      <div className="settings-row-title">Plan</div>
                      <div className="settings-row-sub">Free plan</div>
                    </div>
                    <button type="button" className="settings-action-btn">
                      Upgrade to Pro
                    </button>
                  </div>
                  <div className="settings-row settings-row-notification">
                    <div className="settings-row-info">
                      <div className="settings-row-title">Payment</div>
                      <div className="settings-row-sub">Manage billing and invoices.</div>
                    </div>
                    <button type="button" className="settings-action-btn">
                      Manage
                    </button>
                  </div>
                  <div className="settings-row settings-row-notification">
                    <div className="settings-row-info">
                      <div className="settings-row-title">Delete account</div>
                      <div className="settings-row-sub">Permanently delete your account and data.</div>
                    </div>
                    <button type="button" className="settings-action-btn danger">
                      Delete account
                    </button>
                  </div>
                </div>
              )}
              {!settingsTabLoading && settingsTab !== 'General' && settingsTab !== 'Notifications' && settingsTab !== 'Personalization' && settingsTab !== 'Apps' && settingsTab !== 'Data controls' && settingsTab !== 'Security' && settingsTab !== 'Account' && (
                <div className="settings-empty">
                  Configure {settingsTab.toLowerCase()} settings here.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Content Area */}
      <div className="content-area">
        {/* Top Bar */}
        <div className="top-bar">
          <div className="top-bar-left">
            <div className="top-bar-app">
              <span className="top-bar-mark">b</span>
              <span className="top-bar-title">General Communication</span>
              <Lock size={14} className="top-bar-lock" />
            </div>
          </div>
          <div className="top-bar-right">
            <button className="top-bar-btn ghost" title="GitHub">
              <Github size={16} />
            </button>
          </div>
        </div>

        {/* Main Panel */}
        <main className="main-panel">
          <ChatPanel
            messages={allMessages}
            steps={steps}
            status={status}
            checkpoints={checkpoints}
            onSend={handleSend}
            subagentOpenRequest={subagentOpenRequest}
            autoSubagent={autoSubagent}
            runSubagent={runSubagent}
            approvalMode={approvalMode}
            onSetApprovalMode={setApprovalMode}
            pendingApproval={pendingApproval}
            onApprove={approveAction}
            onDeny={denyAction}
          />
        </main>
      </div>

      {/* Detail Panel — only shown when task is active */}
      {showDetail && (
        <aside className="detail-panel">
          <div className="tab-bar">
            <div className="tab-bar-left">
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
            </div>
            <div className="tab-bar-right">
              <button className="top-bar-pill" title="Share">
                <Share2 size={14} />
                Share
              </button>
              <button className="top-bar-pill primary" title="Publish">
                <UploadCloud size={14} />
                Publish
              </button>
              <div className="user-avatar">A</div>
            </div>
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
          </div>
        </aside>
      )}

    </div>
  );
}
