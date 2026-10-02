# Working on Prismal

Read [CONVENTIONS.md](CONVENTIONS.md) for policy and [README.md](README.md) for user behavior.
Read [architecture](docs/architecture.md) before changing bundling, shared shell scope, frame messages or choices.
The [agent skill](skill/SKILL.md) teaches consumers to run rounds; it is not contributor policy.

## Commands

Use focused `node --test` selections while editing, then `npm run verify`.
Use `npm run verify:browser` for browser-affecting changes. Setup lives in the [README](README.md#tests).
`npm run format` and `npm run lint:fix` modify files; verification commands do not apply source fixes.

`PRISMAL_BROWSER=firefox` or `webkit` selects another installed engine; `PRISMAL_CHANNEL=msedge` selects installed Edge.
`UPDATE_SHOTS=1 npm run test:e2e` refreshes the fictional README images. Do not commit generated labs.
