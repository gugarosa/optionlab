# Architecture

Status: Living

Use this reference when changing bundling, frame lifecycles or the persisted review contract.

## Build one portable artifact

[The CLI](../bin/optionlab.js) delegates to the functions behind [the public package API](../lib/index.js).
The ownership and dependency rules live in [CONVENTIONS.md](../CONVENTIONS.md); usage lives in the [README](../README.md).

[`loadManifest()`](../lib/manifest.js) validates and normalizes one manifest. Its hand-written validation agrees with
the [manifest schema](../schema/optionlab.schema.json), including the implicit current option and device defaults.

[`build()`](../lib/build.js) resolves local source files relative to the manifest, expands `{option}`, deduplicates
file contents and injects the client before application scripts. A file's hash remains a route, not a second copy
of its contents. URL sources are resolved at review time and are not rewritten or proxied.

The generated [HTML template](../shell/lab.html) contains inline CSS, JSON data and one classic-script IIFE.
`SHELL_ASSETS` in `lib/build.js` owns the JavaScript assembly order:

1. `shell/icons.js` supplies licensed SVG paths.
2. `shell/state.js` owns manifest access, persistence, import and export.
3. `shell/frames.js` owns source frames and their lifecycle.
4. `shell/pages.js` constructs the review surfaces.
5. `shell/main.js` binds navigation, input and keyboard actions.

These are fragments of one lexical scope, not separate browser modules. The no-emit type check checks that shared
scope together, including cross-file reads and writes. ESLint checks each fragment's local bindings and syntax.
Global binding checks belong to TypeScript; a `const`/`let` review must consider writes in every fragment.
Do not add module imports or rely on implicit properties of `window` to connect fragments.

The data block escapes `<` and JavaScript line separators. Local pages are assigned through `iframe.srcdoc`,
never interpolated into an HTML attribute. Local files must be self-contained to remain portable.

## Carry choices before the app starts

[`client/optionlab.js`](../client/optionlab.js) installs `window.optionlab` once. The frame's JSON `name` supplies
choices and state synchronously, before application code runs. Query parameters are the debugging channel.
The precedence is frame name, query, then `now`.

`frameChoices()` in [shell state](../shell/state.js) combines settled defaults, current picks and the option under
review. File routes travel in the frame name and become `location.hash`. The injected `about:srcdoc` base keeps
hash navigation inside the source page.

Local frames permit scripts and forms but have opaque sandbox origins. Live URL frames retain their app origin.
The shell checks message markers, owned source windows and the expected origin. The client accepts control
messages only from its parent; it never reads the parent's DOM.

## Own loading and replacement

[Frame management](../shell/frames.js) creates frames detached, sets their names before navigation and limits loading
to two visible or nearby frames. A replacement leaves the previous frame attached until readiness, with a
three-second visual fallback and an eight-second connection failure.

Disposal clears timers, removes message ownership and releases a load permit once. Late messages cannot replace
a newer generation. `aria-busy` describes the pending generation rather than the retained old image.

The page patcher in [page rendering](../shell/pages.js) keeps unchanged frame nodes attached. Removing and reinserting
an iframe restarts its browsing context, even when the DOM object is reused.

The client reports page size after layout, load and fonts, ignores sub-two-pixel size changes and caps height at
30,000 pixels. Laptop views scale their source layout; full phone views retain a scrollable device viewport.
Focus uses the client's target rectangle. Inspection overlays do not handle pointer events.

## Persist one review contract

[Shell state](../shell/state.js) owns the canonical choices object. Autosave is keyed by title and round.
Import validates before replacing state, resolves entries against the current manifest and reports a mismatched
title or round. Export produces the [choices schema](../schema/choices.schema.json) with an export timestamp.

Keep null distinct from a current-design pick. Element feedback is identified by name, route and instance index;
journey feedback is identified by journey and one-based step. Notes, words and question answers are part of the
same export, not side documents.

## Verify the same browser contract

[`check()`](../lib/check.js) builds first, then uses a file-based browser harness with the same frame names, sources,
sandbox and dimensions. It examines every decision/option/view, inspect route and journey step, then visits the
generated lab's actual navigation routes.

Playwright is resolved only when checking: the host project's installation first, then the package's.
`playwright-core` can use installed Chrome. Neither is required to build, scaffold or install the skill.

[Node tests](../test/) cover validation, serialization, command behavior, structure and package contents.
[Browser tests](../test/e2e/) cover user actions, real messages, lifecycle thresholds and broken-source fixtures.
The [CI workflow](../.github/workflows/ci.yml) uses the same verification commands as local development.
