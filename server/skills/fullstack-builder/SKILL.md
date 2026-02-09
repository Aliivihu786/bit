---
name: fullstack-builder
description: "Scaffold full-stack web apps across frameworks inside the sandbox workspace"
emoji: "🏗️"
requires:
  bins: []
  env: []
---

# Full Stack Builder

Use the `project_scaffold` tool to create new projects inside the sandbox workspace.

## When to Use

- User asks to create a new app or scaffold a project
- User wants a specific framework (React/Vue/Next/Express/etc.)
- User wants a full-stack setup (UI + API)

## How to Use

1. If framework is unclear, call `project_scaffold` with action `list` to see options.
2. Call `project_scaffold` with action `create` and:
   - `framework`
   - `project_name`
   - `language` (ask user if JS/TS is needed)
   - `package_manager` (npm/pnpm/yarn/bun)
3. For unsupported frameworks, use `framework: "custom"` with a `command`.

## Output Expectations

- Projects are created under `/home/user/workspace`.
- After scaffolding, provide `nextSteps` and any dev server command.
- For Vite/Next/Nuxt, a live dev server preview URL will be returned automatically.
