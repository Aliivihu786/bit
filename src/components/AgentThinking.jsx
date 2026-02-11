import { Terminal, FileText, Globe, Search, Brain, AlertTriangle, CheckCircle, XCircle, Package, Lightbulb, Info, Pencil, Users, ListTodo, Circle, CircleDot } from 'lucide-react';
import { useState } from 'react';

const stepIcons = {
  code_executor: Terminal,
  file_manager: FileText,
  web_search: Search,
  web_browser: Globe,
  project_scaffold: Package,
  canvas: Pencil,
  task: Users,
  set_todo_list: ListTodo,
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
    case 'task': {
      return `Subagent ${args.subagent_name || ''}`.trim();
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

/**
 * Flatten subagent_event steps into real display steps with a subagent badge.
 * This way subagent tool calls, results, and thinking show as full steps in the timeline.
 */
function buildDisplaySteps(steps) {
  const display = [];
  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];

    // Flatten subagent events into real steps with a subagent tag
    if (step.type === 'subagent_event') {
      const inner = step.event || {};
      const subagentName = step.subagent || 'subagent';

      // Skip empty thinking markers
      if (inner.type === 'thinking') continue;
      // Skip status events from subagent
      if (inner.type === 'status') continue;

      // Convert subagent inner events into regular steps with a subagent badge
      if (inner.type === 'tool_call') {
        // Check if next subagent event is a matching tool_result
        const next = steps[i + 1];
        if (next && next.type === 'subagent_event' && next.event?.type === 'tool_result' && next.event?.tool === inner.tool) {
          display.push({
            type: 'tool_pair',
            call: { ...inner, subagent: subagentName },
            result: { ...next.event, subagent: subagentName },
            subagent: subagentName,
          });
          i += 1;
          continue;
        }
        display.push({ ...inner, subagent: subagentName });
        continue;
      }

      if (inner.type === 'tool_result') {
        // Standalone tool result (not paired above)
        if (inner.tool === 'code_executor' || inner.tool === 'think') continue; // skip like main agent
        display.push({ ...inner, subagent: subagentName });
        continue;
      }

      if (inner.type === 'model_thinking' || inner.type === 'reasoning' || inner.type === 'complete' || inner.type === 'error' || inner.type === 'think') {
        display.push({ ...inner, subagent: subagentName });
        continue;
      }

      // Fallback: show as generic subagent event
      display.push(step);
      continue;
    }

    // Skip code_executor standalone results (paired above)
    if (step.type === 'tool_result' && (step.tool === 'code_executor' || step.tool === 'think' || step.tool === 'set_todo_list')) {
      continue;
    }
    if (step.type === 'tool_call' && (step.tool === 'think' || step.tool === 'set_todo_list')) {
      continue;
    }
    // Pair main agent tool_call + tool_result
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

function SubagentBadge({ name }) {
  return <span className="subagent-badge">{name}</span>;
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
    const showIn = isCodeExec && codePreview;
    const subagent = step.subagent || call.subagent;

    return (
      <div className={`step-item tool-pair ${toolClass} ${isCodeExec ? 'bash-step' : ''} ${subagent ? 'from-subagent' : ''}`} onClick={() => setExpanded(!expanded)}>
        <div className="step-header">
          {Icon && <Icon size={14} />}
          <div className="step-text">
            <span className="step-kind">{kind}</span>
            {title && <span className="step-title">{title}</span>}
          </div>
          {subagent && <SubagentBadge name={subagent} />}
        </div>
        {isCodeExec && showIn && (
          <div className="io-block">
            <div className="io-row">
              <div className="io-label">IN</div>
              <pre className="io-content">{codeDisplay}</pre>
            </div>
          </div>
        )}
        {isFileWrite && meta && (
          <div className="step-meta">{meta}</div>
        )}
      </div>
    );
  }

  if (step.type === 'subagent_start') {
    return (
      <div className="step-item subagent-marker subagent-start-step">
        <div className="step-header">
          <Users size={14} />
          <div className="step-text">
            <span className="step-kind">{step.subagent}</span>
            <span className="step-title">started</span>
          </div>
        </div>
      </div>
    );
  }

  if (step.type === 'subagent_done') {
    const previewText = (step.output || '').slice(0, 120);
    return (
      <div className="step-item subagent-marker subagent-done-step" onClick={() => setExpanded(!expanded)}>
        <div className="step-header">
          <CheckCircle size={14} />
          <div className="step-text">
            <span className="step-kind">{step.subagent}</span>
            <span className="step-title">done</span>
          </div>
        </div>
        {expanded && previewText && (
          <pre className="model-thinking-content">{step.output}</pre>
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

  if (step.type === 'subagent_catalog') {
    const list = Array.isArray(step.subagents) ? step.subagents : [];
    const names = list.map(item => item.name).filter(Boolean);
    const preview = names.length
      ? names.slice(0, 4).join(', ') + (names.length > 4 ? ` +${names.length - 4}` : '')
      : 'None';
    return (
      <div className="step-item subagent-catalog" onClick={() => setExpanded(!expanded)}>
        <div className="step-header">
          <Users size={14} />
          <div className="step-text">
            <span className="step-kind">Subagents</span>
            <span className="step-title">{preview}</span>
          </div>
        </div>
        {expanded && (
          <div className="subagent-catalog-body">
            {list.length === 0 && <div className="subagent-catalog-empty">No subagents available.</div>}
            {list.map(item => (
              <div key={item.name} className="subagent-catalog-item">
                <span className="subagent-catalog-name">{item.name}</span>
                {item.description && <span className="subagent-catalog-desc">{item.description}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (step.type === 'todo_list') {
    const items = Array.isArray(step.items) ? step.items : [];
    const doneCount = items.filter(t => t.status === 'done').length;
    const summary = `${doneCount}/${items.length} done`;
    return (
      <div className={`step-item todo-list-step ${expanded ? 'expanded' : ''}`} onClick={() => setExpanded(!expanded)}>
        <div className="step-header">
          <ListTodo size={14} />
          <div className="step-text">
            <span className="step-kind">Todo</span>
            <span className="step-title">{summary}</span>
          </div>
        </div>
        {expanded && (
          <div className="todo-list-body">
            {items.map((item, idx) => (
              <div key={idx} className={`todo-item todo-${item.status}`}>
                {item.status === 'done' ? <CheckCircle size={12} /> : item.status === 'in_progress' ? <CircleDot size={12} /> : <Circle size={12} />}
                <span className="todo-title">{item.title}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (step.type === 'thinking') {
    return null;
  }

  if (step.type === 'model_thinking') {
    const previewText = (step.content || '').slice(0, 120).replace(/\n/g, ' ');
    const full = step.content || '';
    const displayText = expanded ? full : truncateBlock(full, 8, 1200).text;
    return (
      <div className={`step-item model-thinking step-model-thinking ${expanded ? 'expanded' : ''} ${step.subagent ? 'from-subagent' : ''}`} onClick={() => setExpanded(!expanded)}>
        <div className="step-header">
          <Brain size={14} />
          <div className="step-text">
            <span className="step-kind">Deep Thinking</span>
            <span className="step-title">{expanded ? `Step ${step.iteration}` : previewText}</span>
          </div>
          {step.subagent && <SubagentBadge name={step.subagent} />}
        </div>
        {expanded && (
          <pre className="model-thinking-content">{displayText}</pre>
        )}
      </div>
    );
  }

  if (step.type === 'think') {
    const previewText = (step.content || '').slice(0, 120).replace(/\n/g, ' ');
    const full = step.content || '';
    const displayText = expanded ? full : truncateBlock(full, 6, 800).text;
    return (
      <div className={`step-item think-step ${expanded ? 'expanded' : ''} ${step.subagent ? 'from-subagent' : ''}`} onClick={() => setExpanded(!expanded)}>
        <div className="step-header">
          <Brain size={14} />
          <div className="step-text">
            <span className="step-kind">Internal</span>
            <span className="step-title">{expanded ? '' : previewText}</span>
          </div>
          {step.subagent && <SubagentBadge name={step.subagent} />}
        </div>
        {expanded && (
          <pre className="model-thinking-content">{displayText}</pre>
        )}
      </div>
    );
  }

  if (step.type === 'reasoning') {
    const previewText = (step.content || '').slice(0, 120).replace(/\n/g, ' ');
    const full = step.content || '';
    const displayText = expanded ? full : truncateBlock(full, 8, 1200).text;
    return (
      <div className={`step-item model-thinking step-model-thinking ${expanded ? 'expanded' : ''} ${step.subagent ? 'from-subagent' : ''}`} onClick={() => setExpanded(!expanded)}>
        <div className="step-header">
          <Lightbulb size={14} />
          <div className="step-text">
            <span className="step-kind">Thinking</span>
            <span className="step-title">{expanded ? '' : previewText}</span>
          </div>
          {step.subagent && <SubagentBadge name={step.subagent} />}
        </div>
        {expanded && (
          <pre className="model-thinking-content">{displayText}</pre>
        )}
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
      <div className={`step-item tool-call ${toolClass} ${step.tool === 'code_executor' ? 'bash-step' : ''} ${step.subagent ? 'from-subagent' : ''}`} onClick={() => setExpanded(!expanded)}>
        <div className="step-header">
          {Icon && <Icon size={14} />}
          <div className="step-text">
            <span className="step-kind">{kind}</span>
            {title && <span className="step-title">{title}</span>}
          </div>
          {step.subagent && <SubagentBadge name={step.subagent} />}
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
      <div className={`step-item tool-result ${step.success ? 'success step-result-success' : 'error step-result-error'} ${step.subagent ? 'from-subagent' : ''}`} onClick={() => setExpanded(!expanded)}>
        <div className="step-header">
          {step.success ? <CheckCircle size={14} /> : <XCircle size={14} />}
          <div className="step-text">
            <span className="step-kind">{step.success ? 'OUT' : 'Error'}</span>
            {title && <span className="step-title">{title}</span>}
          </div>
          {step.subagent && <SubagentBadge name={step.subagent} />}
        </div>
        {expanded && fullText && (
          <pre className="tool-result-full">{step.result}</pre>
        )}
      </div>
    );
  }

  if (step.type === 'complete' && step.subagent) {
    const previewText = (step.content || '').slice(0, 120);
    return (
      <div className={`step-item step-result-success from-subagent`} onClick={() => setExpanded(!expanded)}>
        <div className="step-header">
          <CheckCircle size={14} />
          <div className="step-text">
            <span className="step-kind">Done</span>
            <span className="step-title">{expanded ? '' : previewText}</span>
          </div>
          <SubagentBadge name={step.subagent} />
        </div>
        {expanded && step.content && (
          <pre className="tool-result-full">{step.content}</pre>
        )}
      </div>
    );
  }

  if (step.type === 'error' && step.subagent) {
    return (
      <div className="step-item step-result-error from-subagent">
        <div className="step-header">
          <XCircle size={14} />
          <div className="step-text">
            <span className="step-kind">Error</span>
            <span className="step-title">{step.message}</span>
          </div>
          <SubagentBadge name={step.subagent} />
        </div>
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

  // Fallback for unhandled subagent_event (shouldn't happen after flattening)
  if (step.type === 'subagent_event') {
    return null;
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
