import { Check, Loader2, ChevronUp } from 'lucide-react';
import { useState } from 'react';

export function ExecutionStatus({ steps, status, terminalCommands, onTerminalClick }) {
  const [collapsed, setCollapsed] = useState(false);

  const hasCommands = terminalCommands && terminalCommands.length > 0;
  const isRunning = status === 'running' && steps.length > 0;

  // Hide completely if no commands have been run
  if (!hasCommands && !isRunning) {
    return null;
  }

  // Get last command for thumbnail preview
  const lastCmd = hasCommands ? terminalCommands[terminalCommands.length - 1] : null;
  const thumbnailContent = lastCmd
    ? (lastCmd.output || lastCmd.error || lastCmd.command || '')
    : '';

  // Get status info from steps (only while running)
  let message = '';
  let completedSteps = 0;
  let totalSteps = 0;

  if (isRunning) {
    const lastStep = steps[steps.length - 1];
    const toolCalls = steps.filter(s => s.type === 'tool_call');
    const toolResults = steps.filter(s => s.type === 'tool_result');
    completedSteps = toolResults.length;
    totalSteps = Math.max(toolCalls.length, completedSteps, 1);

    if (lastStep.type === 'tool_call') {
      message = `Executing ${lastStep.tool?.replace(/_/g, ' ') || 'tool'}`;
    } else if (lastStep.type === 'tool_result') {
      message = 'Report results to user';
    } else if (lastStep.type === 'status') {
      message = lastStep.message || 'Working...';
    } else if (lastStep.type === 'reasoning') {
      message = 'Thinking...';
    } else {
      message = 'Working...';
    }
  }

  return (
    <div className="execution-status-inline">
      <div className="execution-status-card">
        {/* Left: Terminal thumbnail - stays visible once commands exist */}
        {!collapsed && hasCommands && thumbnailContent && (
          <div className="execution-preview-thumbnail" onClick={onTerminalClick}>
            <pre>{thumbnailContent.slice(0, 120)}</pre>
          </div>
        )}

        {/* Right: Status badge - only while running */}
        {isRunning ? (
          <div className="execution-status-badge">
            <div className="execution-status-icon">
              <Loader2 size={16} className="spin-icon" />
            </div>
            <span className="execution-status-text">{message}</span>
            <span className="execution-status-steps">{completedSteps} / {totalSteps}</span>
            <button
              className="execution-collapse-btn"
              onClick={() => setCollapsed(!collapsed)}
            >
              <ChevronUp size={16} className={collapsed ? 'rotated' : ''} />
            </button>
          </div>
        ) : (
          <div className="execution-status-badge">
            <div className="execution-status-icon">
              <Check size={16} className="status-check" />
            </div>
            <span className="execution-status-text">Task completed</span>
            <span className="execution-status-steps">{terminalCommands.length} command{terminalCommands.length !== 1 ? 's' : ''}</span>
            <button
              className="execution-collapse-btn"
              onClick={() => setCollapsed(!collapsed)}
            >
              <ChevronUp size={16} className={collapsed ? 'rotated' : ''} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
