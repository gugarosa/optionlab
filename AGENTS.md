# Contributing to optionlab

## Map

- `bin/optionlab.js`: Node CLI, argument parsing and terminal output.
- `lib/`: manifest validation, HTML build, browser checker and scaffolding.
- `shell/`: vanilla HTML/CSS/JS, concatenated into a single lab at build time.
- `client/optionlab.js`: development-only page client; dependency-free IIFE.
- `schema/`: editor hints for manifests and exported choices.
- `skill/SKILL.md`: the coding agent's round workflow.
- `examples/lumen/`: fictional, offline, self-contained demonstration.
- `test/`: Node unit tests; `test/e2e/`: Playwright browser tests.

## Commands

`npm ci`, `npm test`, `npm run check:types`, `npm run test:e2e`, `npm run check:example`,
`npm run format:check`, `npm pack --dry-run`.
Install test browsers with `npx playwright install chromium`.
Type checking uses JSDoc and `--noEmit`; there is no compilation step.
`OPTIONLAB_BROWSER=firefox` or `webkit` selects another test engine;
`OPTIONLAB_CHANNEL=msedge` selects installed Edge. `UPDATE_SHOTS=1` refreshes README media.

## Rules

- Zero runtime dependencies. Modern JavaScript with JSDoc and `// @ts-check`.
- No framework, bundler, compile step, adapters or plugin system.
- Keep runtime code in `bin/`, `lib/`, `shell/` and `client/` around 3,500 lines.
- Preserve the single-manifest, single-HTML, single-choices-file contract.
- Keep the hand-written validator and JSON schema in agreement.
- Use real buttons, accessible names and keyboard navigation. Respect reduced motion.
- Report errors explicitly. Do not silently drop a failed frame or invalid input.
- Use fictional example data only. Never include credentials or private source material.
- Keep the README short and the skill actionable; avoid process documents.
- Run the relevant tests before committing. Do not publish or merge without approval.
