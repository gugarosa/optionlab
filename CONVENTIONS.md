# Conventions

This file owns contributor policy. The [README](README.md) owns usage; [architecture](docs/architecture.md) owns
implementation explanations. Agent instructions link to these sources instead of duplicating them.

## Product and structure

- Preserve one manifest in, one self-contained HTML lab, and one choices file out.
- Keep runtime JavaScript framework-agnostic and dependency-free. No compiler, bundler, proxy or server.
- Development tools must justify their cost and support Node 20/22. Commit public, integrity-checked package URLs,
  never machine-specific mirrors or credentials.
- Change contracts and every producer, consumer, test, example and document together. Make migrations canonical;
  do not retain forwarding modules, alternate implementations or deprecated aliases.

| Owner                 | Responsibility                                                                       |
| --------------------- | ------------------------------------------------------------------------------------ |
| `bin/`                | Arguments, dispatch, process exit and browser opening; delegates to `lib/`           |
| `lib/`                | Manifest, build, check and scaffolding; imports Node APIs and direct sibling modules |
| `lib/index.js`        | Deliberate public package entrypoint, not an internal import hub                     |
| `shell/`              | Review UI, choices and frame lifecycle in one generated browser scope                |
| `client/`             | Standalone, idempotent browser client; no imports or parent DOM access               |
| `schema/`             | Editor contracts kept in agreement with validation and exports                       |
| `skill/`              | The consuming agent's workflow, not contributor policy                               |
| `examples/`, `media/` | Fictional demonstrations and original, reproducible screenshots                      |
| `test/`               | Node contracts; browser workflows in `test/e2e/`, inputs in `test/fixtures/`         |
| `docs/`               | Source-linked explanations, one subject per file                                     |

Keep the tree flat until a real ownership boundary needs a directory. Do not add `src/`, workspaces, a generic
`utils/` bucket or a configuration framework. Name files for their job: `build.js`, `state.js`, `frames.js`.
Use lowercase kebab-case for new multiword files and retain standard tool filenames. Never add numbered replacements.

## JavaScript

- Use ESM, top-level imports, explicit `.js` relative paths and `node:` built-ins. Import from the defining module;
  the public package entrypoint is the deliberate exception.
- Keep the client an IIFE and shell fragments in their documented shared scope. Do not connect them through
  implicit `window` properties or add module imports to the fragments.
- Prefer `const`, `camelCase` values/functions and `PascalCase` types/classes. Use meaningful domain names;
  short counters and conventional coordinates are fine.
- Add `// @ts-check`. Use JSDoc for public signatures and useful shared types; prefer inference and guards to
  `any`, unchecked casts, suppressions or duplicated types.
- Use guard clauses and blank lines between substantial phases. Extract helpers for reuse or a meaningful contract,
  not to name trivial expressions or satisfy arbitrary complexity quotas.
- Name constants when their meaning or reuse warrants it. Do not duplicate absent-value sentinels with extra flags.
- Let [Prettier](.prettierrc.json) own formatting. Do not hand-align or compress code to satisfy the roughly
  3,500-line runtime target.

## Errors and lifecycle

- Validate external inputs once at their boundary; trust established internal invariants.
- Reject invalid data explicitly. A parse failure must not become an empty result or successful-looking default.
- Catch only to recover deliberately, add context with `cause`, report at an application boundary or clean up.
  Distinguish expected absence by its error code and keep unexpected errors visible.
- Name the failed operation and relevant field, path or value. Preserve path-style validation messages and the
  `prismal: <message>` CLI boundary rather than imposing unrelated message conventions.
- Libraries return or throw. Terminal output belongs to the CLI, except the checker's `log` callback.
  Browser failures use the existing toast, frame-status or message channel.
- Own and clean up timers, observers, watchers, frames and temporary resources. Release load permits once,
  ignore stale generations and keep unchanged iframe contexts attached.
- Preserve semantic controls, keyboard focus, editable-target shortcut guards, reduced motion and narrow layouts.
  Shared primitives own their variants; avoid per-call-site forks.

## Comments and documentation

- Explain non-obvious intent, not the next statement. Prefer a one-line comment; prose blocks stop at three lines.
  Preserve license notices, source attribution and useful JSDoc types.
- No banners, commented-out code, process diaries or redundant private-helper essays.
  Public API JSDoc states the operation and surprising semantics. Durable rationale belongs in the owning document;
  change-specific motivation belongs in the commit or PR.
- Use plain sentence case, imperative headings and short, factual paragraphs. Avoid hype and first-person narration.
- Keep the README under 200 lines and the skill under 120. Put installation before runnable usage, preserve important
  limits and link to detail rather than repeating policy, setup steps or schemas.
- Use one H1, a clear heading hierarchy and fenced code with language labels. No manual table of contents.
  Use tables for comparisons/contracts and `<details>` only for optional material.
- Keep prose within 120 columns; complete URLs, tables and fenced code are exempt.
  Use Markdown links/images with relative local paths and meaningful alt text, not raw HTML links or image tags.
- No emoji headings, decorative badges or ornamental diagrams. Keep session files, private reference material,
  credentials and machine-local paths out of tracked documentation and examples.
- A `docs/` file starts with a title, blank line, status, blank line and one-sentence purpose.
  Use `Status: Living`, `Status: Snapshot (YYYY-MM)` or `Status: Superseded by <relative-link>`.
- Anchor implementation claims to source files, symbols, configuration keys or schemas.
  Treat those references as callers and update them with their owner.

## Tests and change workflow

- Use flat, descriptive `node:test` behavior tests and `node:assert/strict`. Cover meaningful success and rejection
  paths, not private snapshots or one test per assertion.
- Reuse fixtures and browser helpers. Isolate storage, ports and temporary directories; register cleanup immediately.
  Test through owned messages when automation cannot inspect a child frame.
- Omit assertion strings that repeat test names; keep useful case identifiers and measured timing/geometry context.
- Use focused tests while iterating, then `npm run verify`. Run `npm run verify:browser` for browser, framing,
  client, serialization or checker changes. Keep package boundaries, schema agreement and dependency direction covered.
- Never weaken a rule or skip a failure to make CI green. Linters check structure; review checks accuracy, naming,
  useful abstractions and coupled behavior.
- Check branch, worktree and PR state before editing/pushing. Use a topic branch and an isolated worktree when
  sessions share a checkout. Never overwrite others' changes or push follow-ups to a merged PR branch.
- Keep commits coherent. Record deviations and verification evidence in the PR, sync current `main` and confirm
  merge status before handoff. Never merge, publish to npm or create a release without an explicit request.
