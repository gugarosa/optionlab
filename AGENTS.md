# Working on Prismal

Read [CONVENTIONS.md](CONVENTIONS.md) before changing this repository. It is the single source of contributor rules,
ownership boundaries, documentation style and the change workflow.

Read the [README](README.md) for user-facing behavior and [architecture](docs/architecture.md) when changing the
build, shared shell scope, frame protocol or persisted choices. The [agent skill](skill/SKILL.md) teaches consumers
to run design rounds; it is not this repository's coding policy.

## Commands

`npm run verify` checks code, documentation and Node contracts. `npm run verify:browser` checks browser workflows.
Dependency and browser setup live in the [README](README.md#tests).

Use focused `node --test` selections while iterating. `npm run format` applies formatting; `npm run lint:fix`
applies safe JavaScript lint fixes. Keep both separate from the read-only verification commands.

`PRISMAL_BROWSER=firefox` or `webkit` selects another test engine; `PRISMAL_CHANNEL=msedge` selects installed Edge.
`UPDATE_SHOTS=1 npm run test:e2e` refreshes the fictional README images. Keep generated labs out of git.
