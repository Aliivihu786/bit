import { useState, useCallback, useRef, useEffect } from 'react';
import { runAgent, parseSSEStream } from '../api/client.js';

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem('bit_chat_history') || '[]');
  } catch { return []; }
}

function saveHistory(history) {
  localStorage.setItem('bit_chat_history', JSON.stringify(history.slice(0, 50)));
}

export function useAgent() {
  const [messages, setMessages] = useState([]);
  const [steps, setSteps] = useState([]);
  const [status, setStatus] = useState('idle');
  const [taskId, setTaskId] = useState(null);
  const [selectedAgent, setSelectedAgent] = useState('default');
  const [currentAgentInfo, setCurrentAgentInfo] = useState(null);
  const [browserState, setBrowserState] = useState(null);
  const [fileVersion, setFileVersion] = useState(0);
  const [chatHistory, setChatHistory] = useState(loadHistory);
  const [activeChatId, setActiveChatId] = useState(null);
  const [contextUsage, setContextUsage] = useState({ usagePercent: 0, remainingTokens: 0 });
  const [lastFileOperation, setLastFileOperation] = useState(null);
  const [terminalCommands, setTerminalCommands] = useState([]);
  const [checkpoints, setCheckpoints] = useState([]);
  const [todoList, setTodoList] = useState([]);
  const browserCallbackRef = useRef(null);
  const fileCallbackRef = useRef(null);
  const pendingCommandRef = useRef(null);
  const currentRunCommandsRef = useRef([]);

  // Allow Layout to register a callback for browser events
  const onBrowserEvent = useCallback((callback) => {
    browserCallbackRef.current = callback;
  }, []);

  // Allow Layout to register a callback for file operations
  const onFileOperation = useCallback((callback) => {
    fileCallbackRef.current = callback;
  }, []);

  const sendMessage = useCallback(async (text, options = {}) => {
    const { silent = false, systemNotice = '' } = options;
    if (!silent) {
      setMessages(prev => [...prev, { role: 'user', content: text }]);
    } else if (systemNotice) {
      setMessages(prev => [...prev, { role: 'system', content: systemNotice }]);
    }
    setStatus('running');
    setSteps([]);
    currentRunCommandsRef.current = []; // Clear commands for new run

    try {
      const response = await runAgent(text, taskId, selectedAgent);

      await parseSSEStream(response, (event) => {
        switch (event.type) {
          case 'task_created': {
            setTaskId(event.taskId);
            break;
          }
          case 'agent_selected': {
            setCurrentAgentInfo(event.agent);
            break;
          }
          case 'status':
            break;
          case 'thinking':
            setSteps(prev => [...prev, { type: 'thinking', iteration: event.iteration }]);
            break;
          case 'model_thinking':
            setSteps(prev => [...prev, { type: 'model_thinking', content: event.content, iteration: event.iteration }]);
            break;
          case 'reasoning':
            setSteps(prev => [...prev, { type: 'reasoning', content: event.content, iteration: event.iteration }]);
            break;
          case 'tool_call':
            setSteps(prev => [...prev, { type: 'tool_call', tool: event.tool, args: event.args, iteration: event.iteration }]);
            // Track code executor commands for terminal
            if (event.tool === 'code_executor' && event.args) {
              try {
                const args = typeof event.args === 'string' ? JSON.parse(event.args) : event.args;
                pendingCommandRef.current = {
                  command: args.code || '',
                  language: args.language || 'bash',
                  timestamp: Date.now(),
                };
              } catch {
                // ignore parse errors
              }
            }
            break;
          case 'tool_result':
            setSteps(prev => [...prev, { type: 'tool_result', tool: event.tool, result: event.result, success: event.success }]);

            // Capture code executor results for terminal
            if (event.tool === 'code_executor' && pendingCommandRef.current) {
              try {
                const result = JSON.parse(event.result);
                const terminalCmd = {
                  ...pendingCommandRef.current,
                  output: result.output || result.stdout || '',
                  error: result.error || result.stderr || '',
                  status: event.success ? 'success' : 'error',
                };
                setTerminalCommands(prev => [...prev, terminalCmd]);
                // Add to current run commands
                currentRunCommandsRef.current.push(terminalCmd);
                pendingCommandRef.current = null;
              } catch {
                // ignore parse errors
              }
            }

            // Trigger file browser refresh when file-modifying tools complete
            if (event.success && (event.tool === 'file_manager' || event.tool === 'code_executor')) {
              setFileVersion(v => v + 1);

              // Extract file information for auto-opening in editor
              if (event.tool === 'file_manager' && event.result) {
                try {
                  const result = JSON.parse(event.result);
                  if (result.path && (result.written || result.created)) {
                    const fileName = result.path.split('/').pop();
                    const fileOp = {
                      type: result.written ? 'write' : 'create',
                      path: result.path,
                      name: fileName,
                      timestamp: Date.now(),
                    };
                    console.log('[useAgent] Setting lastFileOperation:', fileOp);
                    setLastFileOperation(fileOp);
                    fileCallbackRef.current?.(fileOp);
                  }
                } catch {
                  // ignore parse errors
                }
              }
            }
            // Handle canvas tool - HTML preview (both create and update)
            if (event.success && event.tool === 'canvas' && event.result) {
              try {
                const result = JSON.parse(event.result);
                // Trigger canvas preview for both create and update actions
                if ((result.created || result.updated) && result.url && result.name) {
                  setBrowserState({
                    type: 'canvas',
                    url: result.url,
                    title: result.name,
                    timestamp: Date.now(),
                  });

                  // Also trigger file explorer refresh and auto-open in editor
                  if (result.path) {
                    setFileVersion(v => v + 1);
                    const fileOp = {
                      type: result.created ? 'create' : 'update',
                      path: result.path,
                      name: result.name,
                      timestamp: Date.now(),
                    };
                    console.log('[useAgent] Canvas file operation:', fileOp);
                    setLastFileOperation(fileOp);
                    fileCallbackRef.current?.(fileOp);
                  }
                }
              } catch {
                // ignore parse errors
              }
            }
            // Handle project scaffold preview
            if (event.success && event.tool === 'project_scaffold' && event.result) {
              try {
                const result = JSON.parse(event.result);
                // Refresh file browser after scaffolding
                setFileVersion(v => v + 1);
                const previewUrl = result.previewUrl || result.previewProxyUrl;
                if (previewUrl) {
                  setBrowserState({
                    type: 'canvas',
                    url: previewUrl,
                    externalUrl: result.previewExternalUrl || result.previewUrl || previewUrl,
                    requiresAccessToken: Boolean(result.previewAuthHeader),
                    title: result.project?.name || result.framework || 'Preview',
                    timestamp: Date.now(),
                  });
                }
              } catch {
                // ignore parse errors
              }
            }
            break;
          case 'browser_event': {
            // Do not surface web browsing/search events in the UI
            if (event.tool === 'web_search' || event.tool === 'web_browser') {
              break;
            }
            const state = {
              type: event.tool === 'web_search' ? 'search_results' : 'page',
              action: event.action || 'goto',
              url: event.url,
              title: event.title,
              results: event.results,
              query: event.query,
              section: event.section || 1,
              totalSections: event.totalSections || 1,
              timestamp: Date.now(),
            };
            setBrowserState(state);
            browserCallbackRef.current?.(state);
            break;
          }
          case 'complete':
            setMessages(prev => [...prev, { role: 'assistant', content: event.content }]);
            setStatus('completed');
            break;
          case 'error':
            if (!event.recoverable) {
              setStatus('error');
              setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${event.message}` }]);
            }
            break;
          case 'max_iterations':
            // Backend now forces a final summary, so this rarely fires.
            // If it does, just mark as completed — the complete event will follow.
            break;
          case 'context_warning':
            // Display context window warnings in the steps
            setSteps(prev => [...prev, {
              type: 'context_warning',
              level: event.level,
              message: event.message,
              usagePercent: event.usagePercent,
            }]);
            break;
          case 'context_status':
            // Update context usage state for UI display
            setContextUsage({
              usagePercent: event.usagePercent,
              remainingTokens: event.remainingTokens,
            });
            break;
          case 'checkpoint': {
            if (typeof event.id === 'number') {
              setCheckpoints(prev => [...prev, {
                id: event.id,
                iteration: event.iteration || null,
                timestamp: Date.now(),
              }]);
            }
            break;
          }
          case 'think': {
            setSteps(prev => [...prev, { type: 'think', content: event.content }]);
            break;
          }
          case 'todo_list': {
            const items = Array.isArray(event.items) ? event.items : [];
            setTodoList(items);
            setSteps(prev => [...prev, { type: 'todo_list', items }]);
            break;
          }
        }
      });
      // Safety: if stream ends and status is still 'running', mark as completed
      setStatus(prev => prev === 'running' ? 'completed' : prev);
    } catch (err) {
      setStatus('error');
      setMessages(prev => [...prev, { role: 'assistant', content: `Connection error: ${err.message}` }]);
    }
  }, [taskId, selectedAgent]);

  // Save current chat to history when it completes
  useEffect(() => {
    if (status !== 'completed' && status !== 'error') return;
    if (messages.length === 0) return;

    const firstUserMsg = messages.find(m => m.role === 'user');
    if (!firstUserMsg) return;

    const id = activeChatId || Date.now().toString();
    setActiveChatId(id);

    setChatHistory(prev => {
      const filtered = prev.filter(c => c.id !== id);
      const updated = [
        { id, title: firstUserMsg.content.slice(0, 80), messages, timestamp: Date.now() },
        ...filtered,
      ];
      saveHistory(updated);
      return updated;
    });
  }, [status, messages, activeChatId]);

  const resetChat = useCallback(() => {
    setMessages([]);
    setSteps([]);
    setStatus('idle');
    setTaskId(null);
    setCurrentAgentInfo(null);
    setBrowserState(null);
    setFileVersion(0);
    setActiveChatId(null);
    setContextUsage({ usagePercent: 0, remainingTokens: 0 });
    setTerminalCommands([]);
    setTodoList([]);
  }, []);

  const loadChat = useCallback((chat) => {
    setMessages(chat.messages);
    setSteps([]);
    setStatus('completed');
    setTaskId(null);
    setBrowserState(null);
    setFileVersion(0);
    setActiveChatId(chat.id);
  }, []);

  const deleteChat = useCallback((chatId) => {
    setChatHistory(prev => {
      const updated = prev.filter(c => c.id !== chatId);
      saveHistory(updated);
      return updated;
    });
    if (activeChatId === chatId) resetChat();
  }, [activeChatId, resetChat]);

  return {
    messages,
    steps,
    status,
    taskId,
    selectedAgent,
    setSelectedAgent,
    currentAgentInfo,
    browserState,
    fileVersion,
    chatHistory,
    activeChatId,
    contextUsage,
    lastFileOperation,
    terminalCommands,
    checkpoints,
    todoList,
    sendMessage,
    resetChat,
    loadChat,
    deleteChat,
    onBrowserEvent,
    onFileOperation,
  };
}
