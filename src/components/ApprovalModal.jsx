import { useState } from 'react';
import './ApprovalModal.css';

export function ApprovalModal({
  approval,
  approvalMode,
  onApprove,
  onDeny,
  onSetMode
}) {
  const [showDetails, setShowDetails] = useState(false);

  if (!approval) return null;

  const formatArgs = (args) => {
    if (typeof args === 'string') return args;
    return JSON.stringify(args, null, 2);
  };

  const getDangerLevel = (toolName, args) => {
    if (toolName === 'code_executor') {
      const code = args?.code || '';
      if (/rm\s+-rf|dd\s+if=|mkfs\.|>\s*\/dev\/sd/.test(code)) {
        return 'critical';
      }
      return 'warning';
    }
    if (toolName === 'file_manager' && args?.action === 'delete') {
      return 'critical';
    }
    if (toolName === 'project_scaffold') {
      return 'warning';
    }
    return 'info';
  };

  const dangerLevel = getDangerLevel(approval.toolName, approval.args);

  return (
    <div className="approval-modal-overlay">
      <div className={`approval-modal approval-${dangerLevel}`}>
        <div className="approval-header">
          <div className="approval-icon">
            {dangerLevel === 'critical' ? '⚠️' : dangerLevel === 'warning' ? '⚡' : 'ℹ️'}
          </div>
          <h3>Approval Required</h3>
        </div>

        <div className="approval-body">
          <p className="approval-message">
            <strong>{approval.toolName}</strong> wants to execute:
          </p>

          <div className="approval-details">
            {approval.toolName === 'code_executor' && approval.args?.code && (
              <div className="code-preview">
                <div className="code-language">{approval.args.language || 'bash'}</div>
                <pre><code>{approval.args.code}</code></pre>
              </div>
            )}
            {approval.toolName === 'file_manager' && (
              <div className="file-operation">
                <div className="operation-type">{approval.args?.action}</div>
                <div className="operation-path">{approval.args?.path}</div>
                {approval.args?.content && (
                  <button
                    className="show-details-btn"
                    onClick={() => setShowDetails(!showDetails)}
                  >
                    {showDetails ? 'Hide' : 'Show'} content
                  </button>
                )}
                {showDetails && approval.args?.content && (
                  <pre className="content-preview">{approval.args.content.slice(0, 500)}</pre>
                )}
              </div>
            )}
            {approval.toolName === 'project_scaffold' && (
              <div className="scaffold-info">
                Creating project with {approval.args?.framework || 'unknown framework'}
              </div>
            )}
          </div>

          <div className="approval-modes">
            <label>
              <input
                type="radio"
                name="mode"
                value="ask"
                checked={approvalMode === 'ask'}
                onChange={() => onSetMode('ask')}
              />
              Ask each time
            </label>
            <label>
              <input
                type="radio"
                name="mode"
                value="auto"
                checked={approvalMode === 'auto'}
                onChange={() => onSetMode('auto')}
              />
              Auto-approve after this
            </label>
            <label>
              <input
                type="radio"
                name="mode"
                value="yolo"
                checked={approvalMode === 'yolo'}
                onChange={() => onSetMode('yolo')}
              />
              YOLO (skip all)
            </label>
          </div>
        </div>

        <div className="approval-actions">
          <button className="btn-deny" onClick={onDeny}>
            ✕ Deny
          </button>
          <button className="btn-approve" onClick={onApprove}>
            ✓ Approve
          </button>
        </div>
      </div>
    </div>
  );
}
