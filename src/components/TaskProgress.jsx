import { Loader2 } from 'lucide-react';

const MAX_ITERATIONS = 15;

export function TaskProgress({ steps, status }) {
  if (status === 'idle') return null;

  const currentIteration = steps.filter(s => s.type === 'thinking').length;
  const toolCalls = steps.filter(s => s.type === 'tool_call').length;
  const progress = (currentIteration / MAX_ITERATIONS) * 100;

  return (
    <div className="task-progress">
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${Math.min(progress, 100)}%` }} />
      </div>
      <div className="progress-info">
        {status === 'running' && <Loader2 size={14} className="spinner" />}
        <span>
          {status === 'running' && `Step ${currentIteration}/${MAX_ITERATIONS}`}
          {status === 'completed' && `Done (${toolCalls} tool calls)`}
          {status === 'error' && 'Failed'}
        </span>
      </div>
    </div>
  );
}
