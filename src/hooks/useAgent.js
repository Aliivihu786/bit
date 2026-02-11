import { useState, useCallback, useRef, useEffect } from 'react';
import { runAgent, parseSSEStream, runSubagentTask } from '../api/client.js';

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
  const [autoSubagent, setAutoSubagent] = useState(null);
  const [approvalMode, setApprovalMode] = useState('ask'); // 'ask', 'auto', 'yolo'
  const [pendingApproval, setPendingApproval] = useState(null); // { callId, toolName, args }
  const browserCallbackRef = useRef(null);
  const fileCallbackRef = useRef(null);
  const pendingCommandRef = useRef(null);
  const currentRunCommandsRef = useRef([]);
  const taskIdRef = useRef(null);
  const pendingSubagentRef = useRef([]);
  const pendingSubagentAfterMainRef = useRef([]);
  const pendingVerifyRef = useRef([]);
  const verifyTimerRef = useRef(null);
  const statusRef = useRef(status);

  useEffect(() => {
    taskIdRef.current = taskId;
  }, [taskId]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

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
    setAutoSubagent(null);
    currentRunCommandsRef.current = []; // Clear commands for new run

    try {
      const response = await runAgent(text, taskId, selectedAgent);

      await parseSSEStream(response, (event) => {
        switch (event.type) {
          case 'task_created': {
            setTaskId(event.taskId);
            taskIdRef.current = event.taskId;
            if (pendingSubagentRef.current.length > 0) {
              const pending = [...pendingSubagentRef.current];
              pendingSubagentRef.current = [];
              pending.forEach(item => runSubagent(item));
            }
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
              } catch (e) {
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
              } catch (e) {
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
                } catch (e) {
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
              } catch (e) {
                // ignore parse errors
              }
            }
            // Handle project scaffold preview
            if (event.success && event.tool === 'project_scaffold' && event.result) {
              try {
                const result = JSON.parse(event.result);
                // Refresh file browser after scaffolding
                setFileVersion(v => v + 1);
                if (result.previewUrl) {
                  setBrowserState({
                    type: 'canvas',
                    url: result.previewUrl,
                    title: result.project?.name || result.framework || 'Preview',
                    timestamp: Date.now(),
                  });
                }
              } catch (e) {
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
            if (pendingSubagentAfterMainRef.current.length > 0) {
              const queued = [...pendingSubagentAfterMainRef.current];
              pendingSubagentAfterMainRef.current = [];
              queued.forEach(item => runSubagent({ ...item, deferUntilComplete: false }));
            }
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
          case 'subagent_auto_selected':
            setAutoSubagent({
              name: event.subagent,
              description: event.description,
              reason: event.reason,
              score: event.score,
            });
            setSteps(prev => [...prev, {
              type: 'status',
              message: `Auto-selected subagent: ${event.subagent}`,
            }]);
            break;
          case 'subagent_auto_plan':
            setAutoSubagent(
              Array.isArray(event.subagents)
                ? event.subagents.map(s => ({
                  name: s.name,
                  description: s.description,
                  reason: event.reason || '',
                  tasks: Array.isArray(s.tasks) ? s.tasks : [],
                }))
                : null,
            );
            setSteps(prev => [...prev, {
              type: 'status',
              message: `Auto-selected ${Array.isArray(event.subagents) ? event.subagents.length : 0} subagent(s)`,
            }]);
            break;
          case 'subagent_start':
            setSteps(prev => [...prev, {
              type: 'subagent_start',
              subagent: event.subagent,
              description: event.description,
            }]);
            break;
          case 'subagent_deferred':
            setSteps(prev => [...prev, {
              type: 'status',
              message: `Subagent ${event.subagent} deferred: ${event.reason || 'waiting for workspace files'}`,
            }]);
            break;
          case 'subagent_done':
            setSteps(prev => [...prev, {
              type: 'subagent_done',
              subagent: event.subagent,
              output: event.output,
            }]);
            break;
          case 'subagent_event':
            setSteps(prev => [...prev, {
              type: 'subagent_event',
              subagent: event.subagent,
              event: event.event,
            }]);
            break;
          case 'subagent_catalog':
            setSteps(prev => [...prev, {
              type: 'subagent_catalog',
              iteration: event.iteration,
              subagents: Array.isArray(event.subagents) ? event.subagents : [],
            }]);
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
          case 'approval_required': {
            // Tool requires user approval
            setPendingApproval({
              callId: event.toolCallId,
              toolName: event.toolName,
              args: event.args,
              message: event.message,
            });
            setSteps(prev => [...prev, {
              type: 'approval_required',
              toolName: event.toolName,
              args: event.args,
              message: event.message,
            }]);
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

  const scheduleAutoVerify = useCallback((subagentName, output) => {
    const snippet = (output || '').slice(0, 4000);
    pendingVerifyRef.current.push({ name: subagentName, output: snippet });
    if (verifyTimerRef.current) return;
    verifyTimerRef.current = setTimeout(() => {
      const batch = [...pendingVerifyRef.current];
      pendingVerifyRef.current = [];
      verifyTimerRef.current = null;
      if (batch.length === 0) return;
      const names = batch.map(b => b.name).join(', ');
      const details = batch.map(b => `Subagent ${b.name} output:\n${b.output}`).join('\n\n');
      sendMessage(
        `Verify the subagents' work and approve the changes. Check files, run any needed commands, and report verification. ${details}`,
        { silent: true, systemNotice: `Auto-verifying subagent work: ${names}` },
      );
    }, 400);
  }, [sendMessage]);

  const runSubagent = useCallback(async ({ subagentName, description, prompt, deferUntilComplete = false }) => {
    const activeTaskId = taskIdRef.current;
    if (!activeTaskId) {
      pendingSubagentRef.current.push({ subagentName, description, prompt, deferUntilComplete });
      setSteps(prev => [...prev, {
        type: 'status',
        message: `Queued subagent ${subagentName} until chat starts.`,
      }]);
      return;
    }
    if (!subagentName || !prompt) {
      throw new Error('Subagent name and prompt are required.');
    }

    const priorStatus = statusRef.current;
    if (deferUntilComplete && priorStatus === 'running') {
      pendingSubagentAfterMainRef.current.push({ subagentName, description, prompt });
      setSteps(prev => [...prev, {
        type: 'status',
        message: `Subagent ${subagentName} will run after the main agent completes.`,
      }]);
      return;
    }
    if (priorStatus !== 'running') setStatus('running');
    setSteps(prev => [...prev, {
      type: 'status',
      message: `Running subagent: ${subagentName}`,
    }]);

    const isNetworkError = (err) => (
      err instanceof TypeError || /failed to fetch|network error|load failed/i.test(err.message || '')
    );

    const runOnce = async (markEvent) => {
      const response = await runSubagentTask({
        taskId: activeTaskId,
        subagent_name: subagentName,
        description: description || '',
        prompt,
      });

      await parseSSEStream(response, (event) => {
        markEvent();
        switch (event.type) {
          case 'subagent_start':
            setSteps(prev => [...prev, {
              type: 'subagent_start',
              subagent: event.subagent,
              description: event.description,
            }]);
            break;
          case 'approval_required': {
            setPendingApproval({
              callId: event.toolCallId,
              toolName: event.toolName,
              args: event.args,
              message: event.message,
            });
            setSteps(prev => [...prev, {
              type: 'approval_required',
              toolName: event.toolName,
              args: event.args,
              message: event.message,
            }]);
            break;
          }
          case 'subagent_deferred':
            setSteps(prev => [...prev, {
              type: 'status',
              message: `Subagent ${event.subagent} deferred: ${event.reason || 'waiting for workspace files'}`,
            }]);
            break;
          case 'subagent_done':
            setSteps(prev => [...prev, {
              type: 'subagent_done',
              subagent: event.subagent,
              output: event.output,
            }]);
            break;
          case 'subagent_event':
            setSteps(prev => [...prev, {
              type: 'subagent_event',
              subagent: event.subagent,
              event: event.event,
            }]);
            break;
          case 'subagent_complete':
            setSteps(prev => [...prev, {
              type: 'subagent_done',
              subagent: event.subagent,
              output: event.output || '',
            }]);
            if (priorStatus !== 'running') {
              scheduleAutoVerify(event.subagent, event.output || '');
            }
            if (priorStatus !== 'running') setStatus('completed');
            break;
          case 'subagent_error':
            setSteps(prev => [...prev, {
              type: 'status',
              message: `Subagent ${event.subagent} error: ${event.message}`,
            }]);
            if (priorStatus !== 'running') setStatus('error');
            break;
          default:
            break;
        }
      });

      return true;
    };

    const maxAttempts = 2;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let sawEvent = false;
      const markEvent = () => {
        sawEvent = true;
      };
      try {
        await runOnce(markEvent);
        if (priorStatus !== 'running') {
          setStatus(prev => prev === 'running' ? 'completed' : prev);
        }
        return;
      } catch (err) {
        const network = isNetworkError(err);
        const canRetry = network && !sawEvent && attempt < maxAttempts;
        if (canRetry) {
          setSteps(prev => [...prev, {
            type: 'status',
            message: `Subagent ${subagentName} network error. Retrying...`,
          }]);
          await new Promise(r => setTimeout(r, 700 * attempt));
          continue;
        }
        if (priorStatus !== 'running') setStatus('error');
        setSteps(prev => [...prev, {
          type: 'status',
          message: network
            ? `Subagent ${subagentName} network error. Please retry.`
            : `Subagent error: ${err.message}`,
        }]);
        return;
      }
    }
  }, []);

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
    setAutoSubagent(null);
    pendingSubagentRef.current = [];
    pendingSubagentAfterMainRef.current = [];
    pendingVerifyRef.current = [];
    if (verifyTimerRef.current) {
      clearTimeout(verifyTimerRef.current);
      verifyTimerRef.current = null;
    }
  }, []);

  const loadChat = useCallback((chat) => {
    setMessages(chat.messages);
    setSteps([]);
    setStatus('completed');
    setTaskId(null);
    setBrowserState(null);
    setFileVersion(0);
    setActiveChatId(chat.id);
    setAutoSubagent(null);
    pendingSubagentRef.current = [];
    pendingSubagentAfterMainRef.current = [];
    pendingVerifyRef.current = [];
    if (verifyTimerRef.current) {
      clearTimeout(verifyTimerRef.current);
      verifyTimerRef.current = null;
    }
  }, []);

  const deleteChat = useCallback((chatId) => {
    setChatHistory(prev => {
      const updated = prev.filter(c => c.id !== chatId);
      saveHistory(updated);
      return updated;
    });
    if (activeChatId === chatId) resetChat();
  }, [activeChatId, resetChat]);

  const approveAction = useCallback(async () => {
    if (!pendingApproval || !taskId) return;
    try {
      await fetch(`/api/agent/approval/${taskId}/${pendingApproval.callId}/approve`, {
        method: 'POST',
      });
      setPendingApproval(null);
    } catch (err) {
      console.error('Failed to approve action:', err);
    }
  }, [pendingApproval, taskId]);

  const denyAction = useCallback(async () => {
    if (!pendingApproval || !taskId) return;
    try {
      await fetch(`/api/agent/approval/${taskId}/${pendingApproval.callId}/deny`, {
        method: 'POST',
      });
      setPendingApproval(null);
    } catch (err) {
      console.error('Failed to deny action:', err);
    }
  }, [pendingApproval, taskId]);

  const setApprovalModeAsync = useCallback(async (mode) => {
    if (!taskId) return;
    try {
      await fetch(`/api/agent/approval/${taskId}/mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      setApprovalMode(mode);
      if (mode === 'yolo' && pendingApproval) {
        // Auto-approve pending if switching to YOLO
        await approveAction();
      }
    } catch (err) {
      console.error('Failed to set approval mode:', err);
    }
  }, [taskId, pendingApproval, approveAction]);

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
    autoSubagent,
    approvalMode,
    pendingApproval,
    sendMessage,
    runSubagent,
    resetChat,
    loadChat,
    deleteChat,
    onBrowserEvent,
    onFileOperation,
    approveAction,
    denyAction,
    setApprovalMode: setApprovalModeAsync,
  };
}
