import React, { useState, useEffect } from 'react';
import './AgentSelector.css';

export function AgentSelector({ selectedAgent, onAgentChange, disabled }) {
  const [agents, setAgents] = useState([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    fetch('/api/agent/agents')
      .then(res => res.json())
      .then(data => {
        setAgents(data.agents || []);
        // Set default if none selected
        if (!selectedAgent && data.agents.length > 0) {
          onAgentChange(data.agents[0].name);
        }
      })
      .catch(err => {
        console.error('Failed to load agents:', err);
      });
  }, []);

  const currentAgent = agents.find(a => a.name === selectedAgent) || agents[0];

  if (!currentAgent) return null;

  return (
    <div className="agent-selector">
      <button
        className="agent-selector-button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        style={{ borderLeft: `3px solid ${currentAgent.color}` }}
      >
        <div className="agent-selector-icon" style={{ backgroundColor: currentAgent.color }}>
          {currentAgent.name === 'okabe' ? '🧪' :
           currentAgent.name === 'coder' ? '💻' :
           currentAgent.name === 'researcher' ? '🔍' : '🤖'}
        </div>
        <div className="agent-selector-info">
          <div className="agent-selector-name">{currentAgent.displayName}</div>
          <div className="agent-selector-desc">{currentAgent.description}</div>
        </div>
        <div className="agent-selector-arrow">{isOpen ? '▲' : '▼'}</div>
      </button>

      {isOpen && (
        <>
          <div className="agent-selector-overlay" onClick={() => setIsOpen(false)} />
          <div className="agent-selector-dropdown">
            {agents.map(agent => (
              <button
                key={agent.name}
                className={`agent-option ${agent.name === selectedAgent ? 'selected' : ''}`}
                onClick={() => {
                  onAgentChange(agent.name);
                  setIsOpen(false);
                }}
                style={{ borderLeft: `3px solid ${agent.color}` }}
              >
                <div className="agent-option-icon" style={{ backgroundColor: agent.color }}>
                  {agent.name === 'okabe' ? '🧪' :
                   agent.name === 'coder' ? '💻' :
                   agent.name === 'researcher' ? '🔍' : '🤖'}
                </div>
                <div className="agent-option-info">
                  <div className="agent-option-name">{agent.displayName}</div>
                  <div className="agent-option-desc">{agent.description}</div>
                  {agent.tools.length > 0 && (
                    <div className="agent-option-tools">
                      Tools: {agent.tools.slice(0, 3).join(', ')}
                      {agent.tools.length > 3 && ` +${agent.tools.length - 3} more`}
                    </div>
                  )}
                </div>
                {agent.name === selectedAgent && (
                  <div className="agent-option-check">✓</div>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
