import './ApprovalBar.css';

export function ApprovalBar({ approval, onApprove, onDeny }) {
  if (!approval) return null;

  const formatCode = (args) => {
    if (args?.code) {
      return args.code.length > 100 ? args.code.slice(0, 100) + '...' : args.code;
    }
    return null;
  };

  const formatAction = (toolName, args) => {
    if (toolName === 'code_executor' && args?.code) {
      return (
        <div className="approval-action">
          <span className="approval-tool">{args.language || 'bash'}</span>
          <code className="approval-code">{formatCode(args)}</code>
        </div>
      );
    }
    if (toolName === 'file_manager') {
      return (
        <div className="approval-action">
          <span className="approval-tool">{args?.action}</span>
          <span className="approval-path">{args?.path}</span>
        </div>
      );
    }
    if (toolName === 'project_scaffold') {
      return (
        <div className="approval-action">
          <span className="approval-tool">scaffold</span>
          <span className="approval-path">{args?.framework || 'project'}</span>
        </div>
      );
    }
    return <span className="approval-tool">{toolName}</span>;
  };

  const isDangerous = (toolName, args) => {
    if (toolName === 'code_executor' && args?.code) {
      const code = args.code;
      return /rm\s+-rf|dd\s+if=|mkfs\.|>\s*\/dev\/sd|:\(\)\s*\{/.test(code);
    }
    if (toolName === 'file_manager' && args?.action === 'delete') {
      return true;
    }
    return false;
  };

  const dangerous = isDangerous(approval.toolName, approval.args);

  return (
    <div className={`approval-bar ${dangerous ? 'approval-bar-danger' : ''}`}>
      <div className="approval-bar-content">
        <div className="approval-bar-icon">
          {dangerous ? '⚠️' : '🔒'}
        </div>
        <div className="approval-bar-info">
          <div className="approval-bar-label">Approval required</div>
          {formatAction(approval.toolName, approval.args)}
        </div>
      </div>
      <div className="approval-bar-actions">
        <button className="approval-bar-btn deny" onClick={onDeny}>
          Deny
        </button>
        <button className="approval-bar-btn approve" onClick={onApprove}>
          Approve
        </button>
      </div>
    </div>
  );
}
