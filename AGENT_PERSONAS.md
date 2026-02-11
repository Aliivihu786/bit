# Agent Personas System

Your Bit Agent platform now supports multiple agent personas, similar to Kimi CLI's `default` and `okabe` agents! 🎭

## What Are Agent Personas?

Agent personas are different "modes" or "personalities" for the main AI agent. Each persona has:
- **Custom system prompt** - Defines behavior and personality
- **Tool restrictions** - Can enable/disable specific tools
- **Visual identity** - Color and icon for UI differentiation

Think of it like switching between different team members, each with specialized skills.

## Available Agent Personas

### 🤖 Default Assistant
**Best for**: General development work

- **Full toolset**: Web search, code execution, file management, canvas, subagents, memory, etc.
- **Behavior**: Professional, helpful, proactive AI coding assistant
- **Use when**: You want the complete Bit Agent experience

### 🧪 Okabe (Experimental)
**Best for**: Complex debugging and exploration

- **Special feature**: D-Mail tool for time-travel debugging
- **Behavior**: Experimental agent that explores multiple solution paths
- **Use when**: You want to try alternative approaches or need advanced reasoning
- **Note**: Named after Steins;Gate - can send messages to past conversation checkpoints!

### 💻 Focused Coder
**Best for**: Pure coding tasks

- **Limited toolset**: Code execution, file management, canvas only (no web access)
- **Behavior**: Action-first, writes and tests code immediately
- **Use when**: You want fast implementation without research/browsing

### 🔍 Web Researcher
**Best for**: Finding information and documentation

- **Limited toolset**: Web search and browsing only (cannot write code)
- **Behavior**: Thorough researcher with cited sources
- **Use when**: You need documentation, API info, or technical research

## How It Works in Your Web App

### 1. **Agent Selection UI**

When you open the chat, you'll see an **Agent Selector** above the input box:

```
┌─────────────────────────────────────────────┐
│ 🤖  Default Assistant                      ▼│
│     General-purpose coding assistant...     │
└─────────────────────────────────────────────┘
```

Click it to see all available agents with their descriptions and tools.

### 2. **Configuration File**

Agents are defined in `/home/user/bit/agents.json`:

```json
{
  "agents": [
    {
      "name": "default",
      "displayName": "Default Assistant",
      "description": "General-purpose coding assistant...",
      "systemPrompt": "You are a helpful AI coding assistant...",
      "tools": ["web_search", "code_executor", "file_manager", ...],
      "excludeTools": [],
      "color": "#3b82f6"
    }
  ]
}
```

### 3. **Backend Processing**

When you send a message:
1. Frontend sends selected agent name to `/api/agent/run`
2. Backend loads agent profile from `agentManager`
3. System prompt is customized based on agent
4. Tools are filtered according to agent's `tools` or `excludeTools`
5. Agent runs with its specific configuration

### 4. **System Architecture**

```
┌─────────────────────────────────────────────────┐
│  User selects "Okabe" → sends message           │
└──────────────────┬──────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────────┐
│  Frontend (ChatPanel + AgentSelector)           │
│  • Shows agent dropdown                         │
│  • Passes selectedAgent to API                  │
└──────────────────┬──────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────────┐
│  Backend (routes/agent.js)                      │
│  • Receives agentName                           │
│  • Loads agent profile from agentManager        │
│  • Builds custom system prompt                  │
│  • Filters tools based on agent                 │
└──────────────────┬──────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────────┐
│  Orchestrator                                   │
│  • Runs with custom system prompt              │
│  • Only calls allowed tools                     │
│  • Behaves according to agent personality       │
└─────────────────────────────────────────────────┘
```

## Key Files

### Backend
- **`agents.json`** - Agent profile configurations
- **`server/agent/agentManager.js`** - Loads and manages agent profiles
- **`server/agent/prompts.js`** - Builds system prompts with agent overlays
- **`server/routes/agent.js`** - API endpoint for agent selection

### Frontend
- **`src/components/AgentSelector.jsx`** - UI dropdown component
- **`src/components/AgentSelector.css`** - Styling for selector
- **`src/hooks/useAgent.js`** - React hook with agent state
- **`src/api/client.js`** - Updated to send agentName

## Creating Your Own Agent

Add to `agents.json`:

```json
{
  "name": "security-expert",
  "displayName": "Security Analyst",
  "description": "Specialized in security audits and vulnerability detection",
  "systemPrompt": "You are a security expert. Focus on finding vulnerabilities, security best practices, and potential exploits. Never write insecure code.",
  "tools": ["file_manager", "code_executor", "web_search"],
  "excludeTools": ["canvas", "project_scaffold"],
  "color": "#dc2626"
}
```

Restart the server and it'll appear in the dropdown!

## Comparison with Kimi CLI

| Feature | Kimi CLI | Bit Agent Platform |
|---------|----------|-------------------|
| Agent selection | `--agent okabe` (CLI flag) | UI dropdown |
| Config format | YAML | JSON |
| System prompts | Template with variables | Direct strings |
| Agent inheritance | `extend: default` | Not yet supported |
| Tool filtering | ✅ | ✅ |
| Visual differentiation | Terminal colors | Icons + colors in UI |
| D-Mail feature | ✅ | ✅ (in Okabe agent) |

## FAQs

**Q: Can I change agents mid-conversation?**
A: Currently, agent selection happens at the start of a new chat. To switch agents, start a new conversation.

**Q: What's the difference between agents and subagents?**
A: **Agents** are the main persona you're chatting with. **Subagents** are specialized workers that agents can delegate tasks to (like coder, researcher, code_reviewer).

**Q: Can I remove the D-Mail tool?**
A: Yes! Edit `agents.json` and remove `"dmail"` from the Okabe agent's tools array.

**Q: How do I add more tools to an agent?**
A: Edit `agents.json` and add tool names to the `tools` array. Available tools: `web_search`, `web_browser`, `code_executor`, `file_manager`, `canvas`, `project_scaffold`, `task`, `create_subagent`, `dmail`, `think`, `todo`, `memory`.

**Q: Can I set a default agent?**
A: The agent named "default" is used by default. You can modify its system prompt and tools in `agents.json`.

## Next Steps

Try the different agents and see how they behave differently! The Okabe agent with D-Mail is particularly fun for debugging complex problems where you want to explore multiple approaches.

**Pro tip**: Use Focused Coder for quick implementations, then switch to Web Researcher when you need to look up APIs or documentation!
