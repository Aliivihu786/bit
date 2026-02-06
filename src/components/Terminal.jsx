import { useState, useEffect, useRef } from 'react';
import { Terminal as TerminalIcon, X, Maximize2 } from 'lucide-react';

export function Terminal({ commands = [] }) {
  const terminalRef = useRef(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Auto-scroll to bottom when new commands arrive
  useEffect(() => {
    if (autoScroll && terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [commands, autoScroll]);

  if (commands.length === 0) {
    return (
      <div className="terminal-empty">
        <TerminalIcon size={48} className="empty-icon" />
        <p className="empty-title">Terminal</p>
        <p className="empty-hint">Command output will appear here when the agent runs code</p>
      </div>
    );
  }

  return (
    <div className="terminal">
      <div className="terminal-header">
        <div className="terminal-title">
          <TerminalIcon size={16} />
          <span>ubuntu@sandbox:~</span>
        </div>
        <div className="terminal-actions">
          <label className="terminal-checkbox">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
            />
            <span>Auto-scroll</span>
          </label>
        </div>
      </div>

      <div className="terminal-content" ref={terminalRef}>
        {commands.map((cmd, idx) => (
          <div key={idx} className="terminal-command-block">
            {/* Prompt line */}
            <div className="terminal-prompt-line">
              <span className="terminal-user">ubuntu@sandbox</span>
              <span className="terminal-separator">:</span>
              <span className="terminal-path">~</span>
              <span className="terminal-dollar">$</span>
              <span className="terminal-command-text">{cmd.command}</span>
            </div>

            {/* Output */}
            {cmd.output && (
              <div className="terminal-output">
                <pre>{cmd.output}</pre>
              </div>
            )}

            {/* Error output */}
            {cmd.error && (
              <div className="terminal-error">
                <pre>{cmd.error}</pre>
              </div>
            )}

            {/* Empty line after command */}
            {(cmd.output || cmd.error) && idx < commands.length - 1 && (
              <div className="terminal-newline"></div>
            )}
          </div>
        ))}

        {/* Live prompt at the end */}
        <div className="terminal-prompt-line terminal-live">
          <span className="terminal-user">ubuntu@sandbox</span>
          <span className="terminal-separator">:</span>
          <span className="terminal-path">~</span>
          <span className="terminal-dollar">$</span>
          <span className="terminal-cursor">█</span>
        </div>
      </div>
    </div>
  );
}
