---
name: optionlab
description: Let the user choose between real design options. Build alternatives per UI decision in the user's own app, present one live single-file lab where they compare, like, pick and note, then apply the exported optionlab-choices JSON. Use when a UI change has more than one reasonable answer, when the user asks for design options, a design lab, alternatives, or to choose between designs, or hands back an optionlab-choices file.
---

# optionlab

You propose. The user decides in the lab. You apply.

## 1. Plan the round

- Pick 3-9 decisions the user can judge independently: a header, a table, an empty state, a section's copy.
- Give each one a question, such as "How should pricing compare plans?".
- Round 1 is broad. Later rounds refine only decisions that remain open.
- Work in the user's real app, not a demo inside the lab. Use self-contained HTML only when a mockup is appropriate.

## 2. Build real options

- Now plus five: A, B and C are close variations; D and E are clearly different. Use fewer when the space is small,
  but at least two proposals.
- Give every option the same care, data, route and state. Never build a straw man.
- Include `optionlab/client` before application scripts, in development only.
- Switch with CSS `html[data-ol-header="b"] ...` or JS `window.optionlab.choice("header")`.
- Keep variants in clearly marked places that are easy to delete.
- Use a view's `state` to expose open menus or first-run states through `window.optionlab.state`.
- Keep `now` unchanged. Include laptop and phone views for each decision.

## 3. Describe, build and check

- Write `optionlab/optionlab.json`: title, round, about, decisions, views and options.
- Each view has exactly one `url` or `file`. URLs resolve against `base`; the live page must include the client.
- File sources are self-contained HTML: inline CSS, JS and images, or absolute URLs. A `{option}` placeholder
  expands per option; `#` sets the start hash route. No relative asset paths or History API routing.
- Name options in 1-3 words with a one-sentence idea. Add `why` and `tradeoff` when useful.
- Add a CSS `focus` selector to crop a view around the decision.
- Run `npx optionlab build`, then `npx optionlab check --shots <dir>`. Check must pass.
- Open representative shots yourself. No blank frames, hidden targets, identical-to-Now proposals or phone overflow.
- Keep the user's dev server running for live URLs. File-based rounds need no server.

## 4. Hand off

- Give the user the path to `lab.html` and explain what the round decides in a few lines.
- Do not pre-pick or rank. The reviewer can interact with the frames, compare beside Now, like, pick and note.
- Ask for the exported `optionlab-choices-r<round>.json`, not a transcription of their choices.

## 5. Apply the choices

- A pick is settled. A like is an idea to carry forward. A note is a requirement.
- `pick: null` is undecided; `pick: "now"` means keep the current design.
- Question answers and word choices are decisions too. Read element and journey feedback, not just picks.
- Make settled picks canonical immediately and delete their alternatives. If variants must remain until the end,
  put the settled selections in `defaults`, which applies to every frame.
- For the next round, increment `round` and refine open decisions with 3-4 options.
- Once layout settles, add `questions`, `words`, named `elements`, `inspect` routes and `journeys`.
- Element verdicts are clear/unclear/change; journey verdicts are obvious/unclear/missing.
- Do not overwrite earlier choice exports or invent an approval.

## 6. Finish

- Implement every pick canonically. Delete switches, the client include, unused variants and the lab folder.
- Keep choices files only when the user wants a record.
- Run the app's tests and inspect the result at laptop and phone size.
- Follow the user's normal PR workflow; do not merge or publish without their approval.

## Commands

`npx optionlab init` creates the manifest. `npx optionlab build --watch` rebuilds changed sources.
`npx optionlab build --open` opens the lab. `-o <file>` chooses its destination.
If check needs a browser: `npm i -D playwright && npx playwright install chromium`.
Before an npm release exists, install optionlab from the repository/preview branch in its README; do not assume
an uninstalled bare `npx optionlab` resolves to this project.
