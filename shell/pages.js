// @ts-check
let beside = false;
let fullPage = false;
let resetConfirm = false;
let current = { page: "start", id: "", option: "now" };
const reviewPages = [];
function pageLinks() {
  return [
    { href: "#/start", label: "Start", icon: "layers" },
    ...manifest.decisions.map((d) => ({ href: `#/d/${d.id}`, label: d.title, decision: d.id })),
    ...reviewPages,
  ];
}
function marker(id) {
  const d = decisionState(id);
  return d.pick !== null
    ? escapeHTML(d.pick === "now" ? "Now" : d.pick.toUpperCase())
    : icon(d.liked.length ? "heart" : "circle");
}
function progress(label, done, total) {
  if (!total) return "";
  return `<div class="progress-item"><div><span>${label}</span><span>${done} of ${total}</span></div><progress value="${done}" max="${total}" aria-label="${label}">${done} of ${total}</progress></div>`;
}
function renderRail() {
  const scroll = rail.querySelector(".rail-scroll")?.scrollTop || 0;
  let links = "";
  for (const link of pageLinks()) {
    if (link.decision === manifest.decisions[0]?.id) links += '<h2 class="nav-label">Decisions</h2>';
    const selected = link.decision
      ? current.page === "d" && current.id === link.decision
      : current.page === link.href.split("/")[1];
    links += `<a href="${link.href}" class="nav-link ${selected ? "selected" : ""}" ${selected ? 'aria-current="page"' : ""}><span class="nav-marker">${link.decision ? marker(link.decision) : icon(link.icon || "note")}</span>${escapeHTML(link.label)}</a>`;
  }
  rail.innerHTML = `<div class="rail-brand"><span class="brand-mark">${icon("layers")}</span><div><strong>${escapeHTML(manifest.title)}</strong><span>Round ${manifest.round}</span></div>${button(icon("close"), "rail", 'aria-label="Hide navigation"', "rail-close")}</div>
    <div class="rail-scroll"><div class="progress-list">${progress("Decisions picked", choices.decisions.filter((d) => d.pick !== null).length, choices.decisions.length)}</div><nav aria-label="Review pages">${links}</nav></div>
    <footer class="rail-footer">${button(`${icon("download")} Export choices`, "export", "", "primary export-button")}<div class="footer-row">${button(`${icon("upload")} Import`, "import", "", "quiet")}<span class="autosave">${storageUnavailable ? "Export to save" : "Autosaved locally"}</span></div><div class="keyboard-hint"><kbd>P</kbd> Pick <kbd>L</kbd> Like <kbd>[</kbd> Hide rail</div>${resetConfirm ? `<div class="reset-confirm"><span>Clear this round's choices?</span>${button("Keep choices", "cancel-reset", "", "small")}${button("Reset", "confirm-reset", "", "small danger")}</div>` : button("Reset round", "reset", "", "quiet small")}</footer>`;
  rail.querySelector(".rail-scroll").scrollTop = scroll;
}
function pageHead(title, text, tools = "") {
  return `<header class="page-head"><div><h1>${escapeHTML(title)}</h1>${text ? `<p>${escapeHTML(text)}</p>` : ""}</div><div class="page-tools">${button(icon("menu"), "rail", 'aria-label="Show navigation"', "show-rail")}${tools}</div></header>`;
}
function noteField(value, scope, id, label = "Your notes", extra = "") {
  return `<label class="note-field"><span>${label}</span><textarea rows="1" data-note="${scope}" data-id="${escapeHTML(id)}" ${extra} placeholder="Anything to carry forward?">${escapeHTML(value)}</textarea></label>`;
}
function startPage() {
  return `${pageHead("A few decisions. Your point of view.", manifest.about || "Compare the live options, keep what works, and hand your choices back.")}
    <section class="start-guide" aria-label="How this round works">
      <div>${icon("layers")}<h2>Explore the options</h2><p>Same page. Different ideas. Try each one on laptop and phone.</p></div>
      <div>${icon("heart")}<h2>Keep what works</h2><p>Like ideas worth carrying forward. Pick one option per decision.</p></div>
      <div>${icon("download")}<h2>Hand it back</h2><p>Export one choices file for your agent. Notes travel with it.</p></div>
    </section>
    <section class="decision-list"><h2>This round</h2>${manifest.decisions.map((d) => `<a class="decision-row" href="#/d/${d.id}"><span class="decision-status">${marker(d.id)}</span><span><strong>${escapeHTML(d.title)}</strong><span>${escapeHTML(d.question)}</span></span><span class="row-meta">${d.options.length - 1} options</span>${icon("right")}</a>`).join("") || '<p class="muted">This round is for the review pages in the navigation.</p>'}</section>
    <section class="shortcuts"><h2>A little faster with keys</h2><dl><div><dt><kbd>↑</kbd> <kbd>↓</kbd></dt><dd>Previous / next page</dd></div><div><dt><kbd>←</kbd> <kbd>→</kbd></dt><dd>Previous / next option</dd></div><div><dt><kbd>P</kbd> <kbd>L</kbd></dt><dd>Pick / like</dd></div><div><dt><kbd>B</kbd> <kbd>F</kbd></dt><dd>Beside Now / full page</dd></div><div><dt><kbd>I</kbd> <kbd>[</kbd></dt><dd>Inspect / hide navigation</dd></div><div><dt><kbd>Esc</kbd></dt><dd>Close</dd></div></dl></section>`;
}
function decisionPage() {
  const d = manifest.decisions.find((entry) => entry.id === current.id);
  const option = d.options.find((entry) => entry.id === current.option);
  const saved = decisionState(d.id);
  const letter = option.id === "now" ? "Now" : option.id.toUpperCase();
  const tabs = d.options
    .map(
      (o) =>
        `<button type="button" role="tab" id="tab-${o.id}" aria-controls="decision-panel" aria-selected="${o.id === option.id}" tabindex="${o.id === option.id ? 0 : -1}" class="option-tab ${o.id === option.id ? "active" : ""}" data-action="option" data-option="${o.id}"><span class="tab-top"><span class="letter ${o.kind === "different" ? "different" : ""}">${o.id === "now" ? "Now" : escapeHTML(o.id.toUpperCase())}</span><span class="tab-kind">${o.id === "now" ? "Current" : o.kind === "different" ? "Different" : "Close"}</span><span class="tab-marks">${saved.pick === o.id ? icon("check") : ""}${saved.liked.includes(o.id) ? icon("heart") : ""}</span></span><strong>${escapeHTML(o.name)}</strong></button>`,
    )
    .join("");
  const actions = `${button(`${icon("heart")} ${saved.liked.includes(option.id) ? "Liked" : "Like"}`, "like", `aria-pressed="${saved.liked.includes(option.id)}"`)}${button(`${saved.pick === option.id ? icon("check") : ""}${option.id === "now" ? "Keep Now" : `${saved.pick === option.id ? "Picked" : "Pick"} ${escapeHTML(letter)}`}`, "pick", `aria-pressed="${saved.pick === option.id}"`, "primary")}`;
  const views = d.views
    .map(
      (view, index) =>
        `<div class="view-unit"><div class="view-pair ${beside && option.id !== "now" ? "paired" : ""}">${beside && option.id !== "now" ? frameSlot(`${d.id}:${index}:now`, view, "now", d.id, { full: fullPage, label: "Now" }) : ""}${frameSlot(`${d.id}:${index}:option`, view, option.id, d.id, { full: fullPage, label: option.name })}</div></div>`,
    )
    .join("");
  return `${pageHead(d.title, d.question)}<div class="option-bar"><div role="tablist" aria-label="${escapeHTML(d.title)} options" class="option-tabs">${tabs}</div><div class="decision-actions">${actions}</div></div>
    <section id="decision-panel" role="tabpanel" aria-labelledby="tab-${option.id}"><div class="option-context"><div><p class="option-idea">${escapeHTML(option.idea || (option.id === "now" ? "The current design, without a variant applied." : ""))}</p><div class="option-reasons">${option.why ? `<span>${icon("book")}${escapeHTML(option.why)}</span>` : ""}${option.tradeoff ? `<span>${icon("alert")}${escapeHTML(option.tradeoff)}</span>` : ""}</div></div><div class="view-tools">${d.views.some((view) => view.focus) ? button(`${icon("focus")} ${fullPage ? "Full page" : "Focus"}`, "focus", `aria-pressed="${!fullPage}"`, "small") : ""}${button(`${icon("columns")} Beside Now`, "beside", `aria-pressed="${beside}"`, "small")}</div></div>
    ${noteField(saved.note, "decisions", d.id)}<div class="views ${beside ? "comparing" : ""} ${d.views.length === 1 ? "single" : ""}">${views}</div></section>`;
}
function render() {
  framePlans = [];
  const next = document.createElement("template");
  next.innerHTML = current.page === "d" ? decisionPage() : startPage();
  patchChildren(stage, next.content);
  syncFrames();
  renderRail();
  for (const textarea of stage.querySelectorAll("textarea")) growNote(textarea);
}
function patchChildren(parent, next) {
  let cursor = parent.firstChild;
  for (const fresh of next.childNodes) {
    const kept = fresh instanceof HTMLElement && frameRecords.get(fresh.dataset.frameKey)?.card;
    if (kept?.parentNode === parent) {
      // Detaching even an unchanged iframe reloads its browsing context.
      while (cursor && cursor !== kept) {
        const remove = cursor;
        cursor = cursor.nextSibling;
        remove.remove();
      }
      cursor = kept.nextSibling;
      continue;
    }
    if (
      cursor?.nodeType === fresh.nodeType &&
      (!(fresh instanceof Element) ||
        (cursor instanceof Element && cursor.tagName === fresh.tagName && !cursor.hasAttribute("data-key")))
    ) {
      if (cursor instanceof Element && fresh instanceof Element) {
        for (const attr of [...cursor.attributes])
          if (!fresh.hasAttribute(attr.name)) cursor.removeAttribute(attr.name);
        for (const attr of fresh.attributes)
          if (cursor.getAttribute(attr.name) !== attr.value) cursor.setAttribute(attr.name, attr.value);
        patchChildren(cursor, fresh);
        if (
          (cursor instanceof HTMLInputElement ||
            cursor instanceof HTMLTextAreaElement ||
            cursor instanceof HTMLSelectElement) &&
          cursor.value !== fresh.value
        )
          cursor.value = fresh.value;
      } else if (cursor.nodeValue !== fresh.nodeValue) cursor.nodeValue = fresh.nodeValue;
      cursor = cursor.nextSibling;
    } else parent.insertBefore(fresh.cloneNode(true), cursor);
  }
  while (cursor) {
    const remove = cursor;
    cursor = cursor.nextSibling;
    remove.remove();
  }
}
function growNote(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
}
