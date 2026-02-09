import { Loader2 } from 'lucide-react';

export function ExecutionStatus({ steps, status }) {
  const isRunning = status === 'running' && steps.length > 0;

  if (!isRunning) return null;

  const lastStep = steps[steps.length - 1];
  const toolCalls = steps.filter(s => s.type === 'tool_call');
  const toolResults = steps.filter(s => s.type === 'tool_result');
  const completedSteps = toolResults.length;
  const totalSteps = Math.max(toolCalls.length, completedSteps, 1);

  let message = 'Working...';
  if (lastStep.type === 'tool_call') {
    message = `Executing ${lastStep.tool?.replace(/_/g, ' ') || 'tool'}`;
  } else if (lastStep.type === 'tool_result') {
    message = 'Report results to user';
  } else if (lastStep.type === 'reasoning') {
    message = 'Thinking...';
  }

  return (
    <div className="execution-status-inline">
      <div className="execution-status-card">
        <div className="execution-status-badge">
          <div className="execution-status-icon">
            <Loader2 size={16} className="spin-icon" />
          </div>
          <span className="execution-status-text">{message}</span>
          <span className="execution-status-steps">{completedSteps} / {totalSteps}</span>
        </div>
      </div>
    </div>
  );
}
