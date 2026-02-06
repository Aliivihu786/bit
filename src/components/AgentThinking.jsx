import { Globe, Search, Terminal, FolderOpen, Brain, CheckCircle, XCircle, Box, AlertTriangle, AlertCircle, Gauge } from 'lucide-react';
import { useState } from 'react';

const toolIcons = {
  web_browser: Globe,
  web_search: Search,
  code_executor: Terminal,
  file_manager: FolderOpen,
};

function StepItem({ step }) {
  const [expanded, setExpanded] = useState(false);

  if (step.type === 'status') {
    return (
      <div className="step-item status">
        <Box size={14} />
        <span>{step.message}</span>
      </div>
    );
  }

  if (step.type === 'thinking') {
    return (
      <div className="step-item thinking">
        <Brain size={14} />
        <span>Thinking... (step {step.iteration})</span>
      </div>
    );
  }

  if (step.type === 'reasoning') {
    return (
      <div className="step-item reasoning">
        <Brain size={14} />
        <span className="reasoning-text">{step.content}</span>
      </div>
    );
  }

  if (step.type === 'tool_call') {
    const Icon = toolIcons[step.tool] || Terminal;
    return (
      <div className="step-item tool-call" onClick={() => setExpanded(!expanded)}>
        <Icon size={14} />
        <span className="tool-name">{step.tool}</span>
        <span className="tool-args-preview">
          {Object.entries(step.args || {}).map(([k, v]) => (
            <span key={k} className="arg-chip">{k}: {typeof v === 'string' ? v.slice(0, 40) : JSON.stringify(v)}</span>
          ))}
        </span>
        {expanded && (
          <pre className="tool-args-full">{JSON.stringify(step.args, null, 2)}</pre>
        )}
      </div>
    );
  }

  if (step.type === 'tool_result') {
    const Icon = step.success ? CheckCircle : XCircle;
    let preview = '';
    try {
      const parsed = JSON.parse(step.result);
      preview = parsed.error || parsed.content?.slice(0, 100) || parsed.stdout?.slice(0, 100) || JSON.stringify(parsed).slice(0, 100);
    } catch {
      preview = step.result?.slice(0, 100) || '';
    }

    return (
      <div className={`step-item tool-result ${step.success ? 'success' : 'error'}`} onClick={() => setExpanded(!expanded)}>
        <Icon size={14} />
        <span className="result-preview">{preview}...</span>
        {expanded && (
          <pre className="tool-result-full">{step.result}</pre>
        )}
      </div>
    );
  }

  if (step.type === 'context_warning') {
    const Icon = step.level === 'critical' ? AlertCircle : AlertTriangle;
    const levelClass = step.level === 'critical' ? 'critical' : step.level === 'high' ? 'high' : 'warning';
    return (
      <div className={`step-item context-warning ${levelClass}`}>
        <Icon size={14} />
        <span>{step.message}</span>
        <span className="context-usage-badge">{step.usagePercent}%</span>
      </div>
    );
  }

  return null;
}

export function AgentThinking({ steps, inline }) {
  if (steps.length === 0) return null;

  return (
    <div className={`agent-thinking ${inline ? 'inline' : ''}`}>
      {!inline && <h3>Agent Activity</h3>}
      <div className="steps-list">
        {steps.map((step, i) => (
          <StepItem key={i} step={step} />
        ))}
      </div>
    </div>
  );
}
