import { Terminal as TerminalIcon } from 'lucide-react';

export function TerminalPreview({ command, onClick }) {
  return (
    <div className="terminal-preview" onClick={onClick}>
      <div className="terminal-preview-header">
        <TerminalIcon size={14} />
        <span className="terminal-preview-title">{command.language || 'bash'}</span>
        <span className="terminal-preview-hint">Click to expand</span>
      </div>
      <div className="terminal-preview-content">
        <div className="terminal-preview-command">
          <span className="terminal-user">ubuntu@sandbox</span>
          <span className="terminal-separator">:</span>
          <span className="terminal-path">~</span>
          <span className="terminal-dollar">$</span>
          <span className="terminal-command-text">{command.command}</span>
        </div>
        {command.output && (
          <div className="terminal-preview-output">
            <pre>{command.output.slice(0, 200)}{command.output.length > 200 ? '...' : ''}</pre>
          </div>
        )}
        {command.error && (
          <div className="terminal-preview-error">
            <pre>{command.error.slice(0, 200)}{command.error.length > 200 ? '...' : ''}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
