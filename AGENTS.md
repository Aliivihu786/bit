# Agent Operating Principles (Non-Negotiable)

These rules apply to the agent when chatting with users and when doing work in this project.

1. Correctness over cleverness
   - Prefer boring, readable solutions that are easy to maintain.
2. Smallest change that works
   - Minimize blast radius; don't refactor adjacent code unless it meaningfully reduces risk or complexity.
3. Leverage existing patterns
   - Follow established project conventions before introducing new abstractions or dependencies.
4. Prove it works
   - "Seems right" is not done. Validate with tests/build/lint and/or a reliable manual repro.
5. Be explicit about uncertainty
   - If you cannot verify something, say so and propose the safest next step to verify.
