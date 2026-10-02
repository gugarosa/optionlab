---
name: prismal
description: Present real UI alternatives in a single-file design lab, let the user compare, like, pick and note, then apply their exported choices. Use for design options, a design lab, alternatives, choosing between designs, or a prismal-choices JSON handoff.
---

# Prismal

Build the options. The user decides. Apply the choices.

## Prerequisites

Prismal is not published to npm. In the user's app, install it with
`npm install --save-dev github:gugarosa/prismal` before running `npx prismal`.
Authors need Node 20+; reviewers install nothing. Use trusted development pages and keep private data out of public artifacts.

## 1. Plan the round

- Pick 3-9 independent decisions and give each one a question.
- Begin broadly; later rounds refine only open decisions.
- Work in the real app. Use self-contained HTML when a mockup is appropriate.
- Propose Now plus five: A-C are close variations, D-E are different. Use fewer when appropriate, with at least two proposals.

## 2. Implement the options

- Give each option the same care, data, route and state. Keep `now` unchanged; never build a straw man.
- Load `prismal/client` before app scripts, in the browser's development entrypoint only.
- Switch with `html[data-prismal-header="b"]` or `window.prismal.choice("header")`.
- Keep variants easy to remove. Use a view's `state` through `window.prismal.state` for open menus or first-run states.
- Provide laptop and phone views. Name options in 1-3 words with one sentence explaining the idea.

## 3. Describe and verify

- Write `prismal/prismal.json` with title, round, about, decisions, views and options. `init` scaffolds metadata, not variants.
- Each view has one `url` or `file`. Live URLs resolve against `base` and require the client in the app.
- File sources use inline assets or absolute URLs, never relative assets. Inline everything for offline use.
  `{option}` expands per option; `#` selects a hash route. Do not use History API routing in file sources.
- Add `focus`, `why` and `tradeoff` when useful.
- Install the checker when needed: `npm i -D playwright && npx playwright install chromium`.
- Run `npx prismal build` and `npx prismal check --shots <dir>`. Use stable data; check compares exact screenshots,
  not visual similarity or design quality.
- Open representative views and exercise the review actions. No blank frames, missing targets or phone overflow.
  Keep the dev server running for live sources; reload the lab after a watched rebuild.

## 4. Hand off

- Share `lab.html`, briefly state what the round decides, and ask for `prismal-choices-r<round>.json`.
- Do not pre-pick, rank or invent approval. The user's export is the decision record.

## 5. Apply and refine

- A pick is settled, a like informs refinement, and a note is a requirement.
  `pick: null` is undecided; `pick: "now"` keeps current.
- Read question answers, word choices, element feedback and journey verdicts as well as picks.
- Make settled picks canonical and remove alternatives. If variants must remain temporarily, record settled picks in `defaults`.
- Increment `round` and refine open decisions with 3-4 options. Never overwrite earlier exports.
- Once layout settles, add questions, vocabulary, inspect routes and journeys.
  Register meaningful controls, labels and marks with element names, groups, selectors and descriptions, not only containers.
- Verify optional review pages interactively and account for the [current inspector limitations][inspect-limits].

## 6. Finish

- Apply every decision canonically. Remove the client, switches, unused variants and lab folder.
- Keep exported choices only if the user wants a record.
- Run the app's tests and inspect the result at laptop and phone size.
- Follow the user's PR workflow; do not merge or publish without approval.

[inspect-limits]: https://github.com/gugarosa/prismal/blob/main/docs/architecture.md#inspect-limitations
