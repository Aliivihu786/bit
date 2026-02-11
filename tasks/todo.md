# Todo

## Working Notes
- Enforce agent guidelines with a lightweight repo check and CI workflow (no new deps).
- Keep changes minimal and reversible.
- Implement subagents with fixed + dynamic definitions; reuse existing tool/orchestrator patterns.
- Add subagent orchestration flow: plan → delegate → aggregate → verify.
- Prefer config-driven defaults and clear UI indicators.

## Checklist
- [x] Restate goal + acceptance criteria
- [x] Locate existing implementation / patterns
- [x] Design: minimal approach + key decisions
- [x] Implement smallest safe slice
- [ ] Add/adjust tests
- [x] Run verification (lint/tests/build/manual repro)
- [x] Summarize changes + verification story
- [ ] Record lessons (if any)

## Subagent Workflow v2

### Checklist
- [x] Restate goal + acceptance criteria
- [x] Locate existing orchestration/plan patterns
- [x] Design: minimal decomposition + routing + aggregation
- [x] Implement smallest safe slice
- [ ] Add/adjust tests
- [x] Run verification (lint/tests/build/manual repro)
- [x] Summarize changes + verification story
- [ ] Record lessons (if any)

### Goal + Acceptance Criteria
- Goal: Align subagent orchestration with the full workflow (decompose, delegate, aggregate, optional review) without breaking existing behavior.
- Acceptance criteria:
  - Orchestrator can decide when to decompose a task into subtasks.
  - Subtasks are routed to appropriate subagents and can run in parallel with a configurable concurrency cap.
  - Subagent outputs are aggregated into a single summary that is fed back to the main agent.
  - Optional reviewer/critic pass can be enabled to validate the aggregated result.
  - UI shows progress/selection for auto-delegated subagents.
  - If todo items remain incomplete, the model is prompted to finish and premature final responses are suppressed.

### Results
- Added LLM-based task decomposition and batch routing with parallel subagent execution and aggregation.
- Added optional reviewer pass via `SUBAGENT_REVIEWER`.
- UI now supports multi-subagent auto-selection indicator.
- Strengthened system prompt to discard premature final summaries.
- Verification: `node -e "import('./server/agent/orchestrator.js')..."`.

## Goal + Acceptance Criteria
- Goal: Enforce `claude.md` guidelines with automated checks.
- Acceptance criteria:
  - `scripts/check-agent-guidelines.mjs` validates required files and key headings.
  - `npm run check:agent` runs the validation.
  - CI workflow runs the check on push/PR.

## Subagents Goal + Acceptance Criteria
- Goal: Implement subagents (fixed + dynamic) with isolated context and UI visibility.
- Acceptance criteria:
  - Fixed subagents load from `subagents.json` (optional file; empty list allowed).
  - Dynamic subagents can be created at runtime via `CreateSubagent` tool.
  - Main agent can delegate via `Task` tool; subagent runs with isolated messages.
  - Subagent events are streamed to the UI as `subagent_event` steps.
  - Tool access can be limited per subagent (tools/excludeTools).
  - Subagent auto-run occurs after creation; no manual Run Task UI.
  - Subagent create form lists available tools in a dropdown for selection.
  - Tools dropdown only shows recommended tools (not all tools).
  - Tool selection uses category checkboxes (All, Read-only, Edit, Execution, MCP, Other).

## Results
- Added `scripts/check-agent-guidelines.mjs` and `npm run check:agent`.
- Added CI workflow at `.github/workflows/agent-guidelines.yml`.
- Injected `claude.md` into system prompt in `server/agent/prompts.js`.
- Verification: `node scripts/check-agent-guidelines.mjs`, `node -e "import('./server/agent/prompts.js')..."`

## Subagents Results
- Added `server/agent/subagentManager.js` and `subagents.json` for fixed subagent specs.
- Added `task` and `create_subagent` tools plus subagent execution support in `server/agent/orchestrator.js`.
- Stream subagent events to UI via `subagent_event` steps.
- Added Subagents UI modal and create/list API endpoints.
- Added subagent task dispatch endpoint; UI now auto-runs after creation (no manual run form).
- Auto-run newly created subagent on next chat message (background).
- Tools list dropdown added to subagent creation modal.
- Recommended-only tools now returned by `/api/agent/tools`.
- Multiple subagents can be set to auto-run on every message (persistent).
- Subagent step entries now expand to show detailed events/tool results.
- Main model uses DeepSeek reasoning; subagents use DeepSeek chat.
- Tool selection now uses a category dropdown (All, Read-only, Edit, Execution, MCP, Other).
- Description and system prompt auto-generate from the Idea field unless user edits them.
- Description auto-generates from Name unless user edits it.
- Verification: `node -e "import('./server/agent/toolRegistry.js')..."`, `node -e "import('./server/agent/subagentManager.js')..."`, `node -e "import('./server/routes/agent.js')..."`. JSX import check failed (`ERR_UNKNOWN_FILE_EXTENSION`); manual UI run recommended.
