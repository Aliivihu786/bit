import { Terminal, FileText, Globe, Search, Brain, AlertTriangle, CheckCircle, XCircle, Package, Lightbulb, Info, Pencil } from 'lucide-react';
import { useState } from 'react';

const stepIcons = {
  code_executor: Terminal,
  file_manager: FileText,
  web_search: Search,
  web_browser: Globe,
  project_scaffold: Package,
  canvas: Pencil,
};

function summarizeToolCall(step) {
  const args = step.args || {};
  switch (step.tool) {
    case 'code_executor': {
      return 'Bash';
    }
    case 'file_manager': {
      const action = args.action || 'file';
      const path = args.path ? ` ${basename(args.path)}` : '';
      return `${action.charAt(0).toUpperCase() + action.slice(1)}${path}`;
    }
    case 'canvas': {
      return `Write ${args.name || 'HTML'}`;
    }
    case 'project_scaffold': {
      const name = args.project_name || args.name || 'project';
      const framework = args.framework ? ` (${args.framework})` : '';
      return `Scaffold ${name}${framework}`;
    }
    case 'web_search': {
      return `Search ${args.query || ''}`.trim();
    }
    case 'web_browser': {
      const action = args.action || 'browse';
      const target = args.url || '';
      return `${action} ${target}`.trim();
    }
    default:
      return step.tool || 'Task';
  }
}

function splitLabel(label) {
  const parts = label.trim().split(' ');
  if (parts.length <= 1) return { kind: label, title: '' };
  return { kind: parts[0], title: parts.slice(1).join(' ') };
}

function basename(path) {
  if (!path || typeof path !== 'string') return '';
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
}

function summarizeToolResult(step, parsed, preview) {
  if (step.tool === 'file_manager' && parsed && typeof parsed === 'object') {
    if (typeof parsed.lines === 'number') return `${parsed.lines} lines`;
    if (parsed.written && parsed.path) return `Wrote ${basename(parsed.path)}`;
    if (parsed.created && parsed.path) return `Created ${basename(parsed.path)}`;
  }
  if (parsed && typeof parsed === 'object') {
    if (typeof parsed.error === 'string' && parsed.error.trim()) return parsed.error.trim();
    if (typeof parsed.output === 'string' && parsed.output.trim()) return parsed.output.trim().split('\n')[0];
    if (typeof parsed.stdout === 'string' && parsed.stdout.trim()) return parsed.stdout.trim().split('\n')[0];
    if (typeof parsed.content === 'string' && parsed.content.trim()) return parsed.content.trim().split('\n')[0];
  }
  return preview;
}

function parseResultPayload(step) {
  let parsed = null;
  let fullText = '';
  let preview = '';
  try {
    parsed = JSON.parse(step.result);
    const raw = parsed.error || parsed.content || parsed.stdout || parsed.output || JSON.stringify(parsed);
    fullText = typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2);
    preview = fullText.slice(0, 120);
  } catch {
    fullText = step.result || '';
    preview = fullText.slice(0, 120);
  }
  return { parsed, fullText, preview };
}

function truncateBlock(text, maxLines = 6, maxChars = 600) {
  if (!text) return { text: '', truncated: false };
  const lines = text.split('\n');
  const out = [];
  let chars = 0;
  for (let i = 0; i < lines.length; i += 1) {
    if (out.length >= maxLines) break;
    const line = lines[i];
    if (chars + line.length > maxChars) {
      out.push(line.slice(0, Math.max(0, maxChars - chars)));
      chars = maxChars;
      break;
    }
    out.push(line);
    chars += line.length;
  }
  const truncated = out.length < lines.length || chars < text.length;
  return { text: `${out.join('\n')}${truncated ? '\n...' : ''}`, truncated };
}

function buildDisplaySteps(steps) {
  const display = [];
  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    if (step.type === 'tool_result' && step.tool === 'code_executor') {
      continue;
    }
    if (step.type === 'tool_call') {
      const next = steps[i + 1];
      if (next && next.type === 'tool_result' && next.tool === step.tool) {
        display.push({ type: 'tool_pair', call: step, result: next });
        i += 1;
        continue;
      }
    }
    display.push(step);
  }
  return display;
}

function buildTodos(steps) {
  const todos = [];
  const pending = [];

  steps.forEach((step, index) => {
    if (step.type === 'tool_call') {
      const item = {
        id: `${step.tool}-${index}`,
        tool: step.tool,
        label: summarizeToolCall(step),
        status: 'pending',
      };
      todos.push(item);
      pending.push(item);
    }

    if (step.type === 'tool_result') {
      let target = pending.find(p => p.tool === step.tool);
      if (!target) target = pending[0];
      if (target) {
        target.status = step.success ? 'done' : 'error';
        const idx = pending.indexOf(target);
        if (idx >= 0) pending.splice(idx, 1);
      }
    }
  });

  return todos;
}

function StepItem({ step }) {
  const [expanded, setExpanded] = useState(false);

  if (step.type === 'tool_pair') {
    const call = step.call;
    const result = step.result;
    const label = summarizeToolCall(call);
    const { kind, title } = splitLabel(label);
    const Icon = stepIcons[call.tool];
    const toolClass = call.tool ? `tool-${call.tool}` : '';
    const args = call.args || {};
    const codePreview = call.tool === 'code_executor' && typeof args.code === 'string'
      ? args.code.trim()
      : '';
    const codeDisplay = expanded ? codePreview : truncateBlock(codePreview, 4, 400).text;
    const { parsed, fullText, preview } = parseResultPayload(result);
    const meta = summarizeToolResult(result, parsed, preview);
    const isFileWrite = call.tool === 'file_manager';
    const isCodeExec = call.tool === 'code_executor';
    const showText = expanded ? fullText : truncateBlock(fullText, 8, 1200).text;

    const showIn = isCodeExec && codePreview;

    return (
      <div className={`step-item tool-pair ${toolClass} ${isCodeExec ? 'bash-step' : ''}`} onClick={() => setExpanded(!expanded)}>
        <div className="step-header">
          {Icon && <Icon size={14} />}
          <div className="step-text">
            <span className="step-kind">{kind}</span>
            {title && <span className="step-title">{title}</span>}
          </div>
        </div>
        {isCodeExec && showIn && (
          <div className="io-block">
            {showIn && (
              <div className="io-row">
                <div className="io-label">IN</div>
                <pre className="io-content">{codeDisplay}</pre>
              </div>
            )}
          </div>
        )}
        {isFileWrite && meta && (
          <div className="step-meta">{meta}</div>
        )}
      </div>
    );
  }

  if (step.type === 'status') {
    return (
      <div className="step-item status step-status">
        <div className="step-header">
          <Info size={14} />
          <div className="step-text">
            <span className="step-kind">Status</span>
            <span className="step-title">{step.message}</span>
          </div>
        </div>
      </div>
    );
  }

  if (step.type === 'thinking') {
    return (
      <div className="step-item thinking step-thinking">
        <div className="step-header">
          <Brain size={14} />
          <div className="step-text">
            <span className="step-kind">Thinking</span>
            <span className="step-title">Step {step.iteration}</span>
          </div>
        </div>
      </div>
    );
  }

  if (step.type === 'reasoning') {
    return (
      <div className="step-item reasoning step-reasoning">
        <div className="step-header">
          <Lightbulb size={14} />
          <div className="step-text">
            <span className="step-kind">Reasoning</span>
            <span className="step-title">{step.content}</span>
          </div>
        </div>
      </div>
    );
  }

  if (step.type === 'tool_call') {
    const label = summarizeToolCall(step);
    const { kind, title } = splitLabel(label);
    const Icon = stepIcons[step.tool];
    const args = step.args || {};
    const codePreview = step.tool === 'code_executor' && typeof args.code === 'string'
      ? args.code.trim()
      : '';
    const toolClass = step.tool ? `tool-${step.tool}` : '';
    return (
      <div className={`step-item tool-call ${toolClass} ${step.tool === 'code_executor' ? 'bash-step' : ''}`} onClick={() => setExpanded(!expanded)}>
        <div className="step-header">
          {Icon && <Icon size={14} />}
          <div className="step-text">
            <span className="step-kind">{kind}</span>
            {title && <span className="step-title">{title}</span>}
          </div>
        </div>
        {codePreview && (
          <div className="io-block">
            <div className="io-row">
              <div className="io-label">IN</div>
              <pre className="io-content">{codePreview}</pre>
            </div>
          </div>
        )}
        {expanded && !codePreview && (
          <pre className="tool-args-full">{JSON.stringify(step.args, null, 2)}</pre>
        )}
      </div>
    );
  }

  if (step.type === 'tool_result') {
    const { parsed, fullText, preview } = parseResultPayload(step);
    const displayText = expanded ? fullText : truncateBlock(fullText, 8, 1200).text;
    const title = summarizeToolResult(step, parsed, preview);

    return (
      <div className={`step-item tool-result ${step.success ? 'success step-result-success' : 'error step-result-error'}`} onClick={() => setExpanded(!expanded)}>
        <div className="step-header">
          {step.success ? <CheckCircle size={14} /> : <XCircle size={14} />}
          <div className="step-text">
            <span className="step-kind">{step.success ? 'OUT' : 'Error'}</span>
            {title && <span className="step-title">{title}</span>}
          </div>
        </div>
        {expanded && fullText && (
          <pre className="tool-result-full">{step.result}</pre>
        )}
      </div>
    );
  }

  if (step.type === 'context_warning') {
    const Icon = step.level === 'critical' ? AlertTriangle : AlertTriangle;
    const levelClass = step.level === 'critical' ? 'critical' : step.level === 'high' ? 'high' : 'warning';
    return (
      <div className={`step-item context-warning ${levelClass} step-warning`}>
        <div className="step-header">
          <Icon size={14} />
          <div className="step-text">
            <span className="step-kind">Warning</span>
            <span className="step-title">{step.message}</span>
          </div>
        </div>
        <span className="context-usage-badge">{step.usagePercent}%</span>
      </div>
    );
  }

  return null;
}

export function AgentThinking({ steps, inline }) {
  if (steps.length === 0) return null;

  const todos = buildTodos(steps);
  const displaySteps = buildDisplaySteps(steps);

  return (
    <div className={`agent-thinking ${inline ? 'inline' : ''}`}>
      {!inline && <h3>Agent Activity</h3>}
      <div className="steps-list">
        {displaySteps.map((step, i) => (
          <StepItem key={i} step={step} />
        ))}
      </div>
    </div>
  );
}
