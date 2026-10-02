![Lumen in Prismal, with live laptop and phone options](media/lab.png)

# Prismal

**Review live UI alternatives and export your design decisions.**

Your coding agent builds options in your app or self-contained HTML pages. You open one lab,
compare the options, like, pick and leave notes. The agent reads your exported JSON and applies the decisions.

## Installation

Prismal is an **unpublished preview**. Install from GitHub, not the npm registry.
Authors need Node 20+ and Git; reviewers need only a browser.

```sh
git clone https://github.com/gugarosa/prismal.git
cd prismal
```

## Quick start

Build and open the fictional Lumen example; no dependency installation or server is needed:

```sh
node bin/prismal.js build examples/lumen/prismal.json --open
```

The example includes decisions, questions, vocabulary, element inspection and a journey.
Its generated `examples/lumen/lab.html` can move anywhere and open by double-clicking.

### Use in your app

From your application's project root:

```sh
npm install --save-dev github:gugarosa/prismal
npx prismal init
npx prismal skill
```

`init` creates `prismal/prismal.json`, not the variants themselves. Set its `base` to your dev server,
add the client as shown below, and implement the options before building.
The [agent skill](skill/SKILL.md) explains the round workflow.

## Write variants

For plain HTML, copy `node_modules/prismal/client/prismal.js` into the app's public directory.
Include it before app scripts, in development only:

```html
<script src="/prismal.js"></script>
<style>
  html[data-prismal-header="b"] .site-header {
    padding-block: 24px;
  }
</style>
```

For a bundled app, use its **browser-only development entrypoint** instead:

```js
import "prismal/client";
const header = window.prismal?.choice("header") ?? "now";
const menu = window.prismal?.state.menu ?? "closed";
```

No framework adapter is needed. `prismal.is("header", "b")` is a boolean shortcut.
For a normal browser tab, use `?prismal.header=b&prismal.state.menu=open`.
Outside a lab frame, the client resolves choices without inspection or event interception.
Remove the client and unused variants when the decisions are applied.

## Define a round

Use [the example manifest](examples/lumen/prismal.json) and [editor schema](schema/prismal.schema.json).
Errors identify the field to fix.

| Field                 | Purpose                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------ |
| `title`, `round`      | Required name and positive round number                                                    |
| `about`               | Optional introduction                                                                      |
| `decisions`           | Questions, views and 1-6 proposals besides `now`; use `[]` for review-only rounds          |
| `base`, `devices`     | Live URL base and viewport sizes; defaults are laptop 1440x900 and phone 390x844           |
| `defaults`            | Settled decision-to-option mappings from earlier rounds                                    |
| `views`               | Caption, device, exactly one `url` or `file`, optional `focus` selector and `state` object |
| `options`             | ID, name, optional idea, close/different kind, why and tradeoff                            |
| `questions`, `words`  | Grouped answers and vocabulary review                                                      |
| `elements`, `inspect` | Semantic element definitions and review routes                                             |
| `journeys`            | Ordered routes, target selectors and review questions                                      |

IDs use lowercase letters, numbers and hyphens and are unique within their list. The lab adds `now` when omitted.
Optional review pages appear when configured. Give elements meaningful names and descriptions, not just selectors.

| Source                                            | Requirements                                                                             |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `"url": "/pricing"`                               | A running dev server at `base`, the client installed, and a page that permits framing    |
| `"file": "mockups/header-{option}.html#/pricing"` | Self-contained HTML; Prismal expands the option, inlines the file and injects the client |

Live URLs must be reachable from the reviewer's browser; `localhost` refers to that device.
File sources use hash routing, not the History API. Inline assets for offline use; absolute URLs require network
access. Relative asset paths do not travel with the lab. File previews are sandboxed: scripts and forms work,
but browser storage, popups, downloads and parent DOM access are unavailable.
Use trusted development pages and handle the generated HTML as application data.

## Review and export

Build after implementing the variants. Install Playwright only when using the checker:

```sh
npx prismal build --open
npm install --save-dev playwright
npx playwright install chromium
npx prismal check --shots prismal/shots
```

Try each option at laptop and phone size. Compare beside Now, like useful ideas, pick one option per decision
and add notes. Questions, words, element feedback and journey verdicts join the same export.

Inspect supports clicking elements, an inventory and Previous/Next across instances.
Read its [current limitations](docs/architecture.md#inspect-limitations) before relying on hover or route tracking.

Export `prismal-choices-r<round>.json` and hand it to your agent. The [choices schema](schema/choices.schema.json)
defines the contract: `pick: null` is undecided; `pick: "now"` keeps current. Likes inform refinement; notes are requirements.

Autosave uses `prismal:<title>:r<round>`. Import restores matching entries and warns about title/round differences.
File and private-browsing storage vary, so export before closing or handing off. Reset requires confirmation.

| Keys         | Action                                             |
| ------------ | -------------------------------------------------- |
| Up / Down    | Previous / next page                               |
| Left / Right | Previous / next option                             |
| P / L        | Pick / like                                        |
| B / F        | Beside Now / focus or full page                    |
| I / [ / Esc  | Open or toggle Inspect / toggle navigation / close |

Shortcuts apply outside preview frames and editable fields. Hashes such as `#/d/header/b` preserve the view on reload.

## Commands and API

| Command                                         | Result                                                 |
| ----------------------------------------------- | ------------------------------------------------------ |
| `init [dir]`                                    | Starter manifest and ignore rule; default `prismal/`   |
| `build [manifest] [-o file] [--watch] [--open]` | One HTML file beside the manifest by default           |
| `check [manifest] [--shots dir]`                | Browser verification and optional PNGs                 |
| `skill [dir]`                                   | Copy the agent skill; default `.github/skills/prismal` |

Manifest lookup checks `prismal/prismal.json`, then `./prismal.json`. Init and skill do not overwrite existing files.
`--watch` rebuilds changed inputs; reload the browser to see the new HTML.
For Claude Code, use `skill .claude/skills/prismal`; for user-level Copilot, use `skill ~/.copilot/skills/prismal`.

Check builds first and fails on page/network errors, missing readiness, empty pages, horizontal overflow,
missing focus/journey targets and screenshots byte-identical to Now. It warns when an element matches no configured
inspect route. Failures exit 1. Shots are named `<decision>-<option>-<view-number>.png`.
Use stable data: exact screenshot equality is not a visual-similarity or usability assessment.

The checker resolves your project's Playwright before the package's. `playwright-core` can use installed Chrome.
Build, init and skill have no runtime dependencies.

The ESM API exports `build(path?, { output? })`, `check(path?, { shots?, log? })` and `loadManifest(path?)`.
Build returns the output path, normalized manifest, bundled data, dependencies and counts.
Check returns failures, warnings, frame count and problems. Load returns `{ manifest, path }`.

<details>
<summary>How is this different from Storybook or screenshots?</summary>

Storybook presents isolated components. Prismal frames real pages and records decisions.
Screenshots help verify a round; the reviewer interacts with live frames.

</details>

## Documentation

- [Conventions](CONVENTIONS.md)
- [Architecture](docs/architecture.md)
- [Agent workflow](skill/SKILL.md)

## Tests

```sh
npm ci
npm run verify
npx playwright install chromium
npm run verify:browser
```

See [AGENTS.md](AGENTS.md) for focused tests, browser selection and screenshot refreshes.
MIT; Lucide/Feather notices are retained in `shell/icons.js`.
