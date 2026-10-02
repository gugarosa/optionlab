// @ts-check
function navigate() {
  const previous = current.page + current.id;
  const focusTab = document.activeElement?.getAttribute("role") === "tab";
  const [, page = "start", id = "", option = ""] = location.hash.split("/");
  const decision = manifest.decisions.find((entry) => entry.id === id);
  current =
    page === "d" && decision
      ? { page, id, option: decision.options.some((entry) => entry.id === option) ? option : "now" }
      : {
          page: reviewPages.some((entry) => entry.href === `#/${page}`) ? page : "start",
          id: "",
          option: "now",
        };
  render();
  if (focusTab && current.page === "d")
    stage.querySelector('[role="tab"][aria-selected="true"]')?.focus({ preventScroll: true });
  if (previous !== current.page + current.id) window.scrollTo(0, 0);
  document.body.classList.remove("menu-open");
  updateMenuState();
}
function updateMenuState() {
  const open = document.body.classList.contains("menu-open");
  document.querySelector(".mobile-bar [data-action=rail]").setAttribute("aria-expanded", String(open));
}
function toggleRail() {
  if (matchMedia("(max-width: 899px)").matches) document.body.classList.toggle("menu-open");
  else document.body.classList.toggle("rail-hidden");
  updateMenuState();
}
function act(action, target) {
  const saved = decisionState(current.id);
  if (action === "rail") toggleRail();
  else if (action === "export") downloadChoices();
  else if (action === "import") document.getElementById("import-file").click();
  else if (action === "reset" || action === "cancel-reset") {
    resetConfirm = action === "reset";
    renderRail();
  } else if (action === "confirm-reset") {
    choices = freshChoices();
    resetConfirm = false;
    save();
    render();
    toast("This round has been reset.");
  } else if (action === "retry") {
    const rec = frameRecords.get(target.dataset.key);
    if (rec) requestFrame(rec, (rec.pending || rec.active).plan);
  } else if (action === "answer" || action === "word") {
    const group = action === "answer" ? choices.questions : choices.words;
    const entry = group.find((item) => item.id === target.dataset.id);
    const field = action === "answer" ? "answer" : "choice";
    entry[field] = entry[field] === target.dataset.value ? null : target.dataset.value;
    save();
    render();
  } else if (action === "option") location.hash = `#/d/${current.id}/${target.dataset.option}`;
  else if (saved && ["pick", "like", "focus", "beside"].includes(action)) {
    if (action === "pick") {
      saved.pick = saved.pick === current.option ? null : current.option;
      saved.pickName =
        manifest.decisions.find((d) => d.id === current.id).options.find((o) => o.id === saved.pick)?.name ??
        null;
    } else if (action === "like")
      saved.liked = saved.liked.includes(current.option)
        ? saved.liked.filter((id) => id !== current.option)
        : [...saved.liked, current.option];
    else if (action === "focus") fullPage = !fullPage;
    else beside = !beside;
    if (action === "pick" || action === "like") save();
    render();
    stage.querySelector(`[data-action="${action}"]`)?.focus({ preventScroll: true });
  }
}
document.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;
  const target = event.target.closest("[data-action]");
  if (target instanceof HTMLElement) act(target.dataset.action, target);
});
document.addEventListener("input", (event) => {
  const target = event.target;
  if (target instanceof HTMLInputElement && target.dataset.other) {
    choices.words.find((word) => word.id === target.dataset.other).choice = target.value || null;
    for (const chip of target.closest(".word-card").querySelectorAll(".choice-chip"))
      chip.setAttribute("aria-pressed", "false");
    save();
    return;
  }
  if (!(target instanceof HTMLTextAreaElement) || !target.dataset.note) return;
  if (target.dataset.note === "notes") {
    choices.notes = target.value;
    save();
    growNote(target);
    return;
  }
  const saved = choices[target.dataset.note]?.find((entry) => entry.id === target.dataset.id);
  if (saved) {
    saved.note = target.value;
    save();
    growNote(target);
  }
});
document.getElementById("import-file").addEventListener("change", async (event) => {
  const input = event.target;
  const file = input.files?.[0];
  if (!file) return;
  try {
    const raw = JSON.parse(await file.text());
    const imported = parseChoices(raw);
    const mismatch = raw.title !== manifest.title || raw.round !== manifest.round;
    choices = imported;
    save();
    render();
    toast(
      mismatch
        ? `Imported matching items from "${raw.title}", round ${raw.round}. This is "${manifest.title}", round ${manifest.round}.`
        : "Choices imported.",
      mismatch,
    );
  } catch (error) {
    toast(`Import failed: ${error.message}`, true);
  }
  input.value = "";
});
document.addEventListener("keydown", (event) => {
  if (
    !(event.target instanceof Element) ||
    event.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])') ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey
  )
    return;
  const key = event.key.toLowerCase();
  if (["arrowup", "arrowdown"].includes(key)) {
    event.preventDefault();
    const links = pageLinks();
    const index = links.findIndex((link) =>
      link.decision
        ? current.page === "d" && link.decision === current.id
        : current.page === link.href.split("/")[1],
    );
    location.hash = links[(index + (key === "arrowdown" ? 1 : -1) + links.length) % links.length].href;
  } else if (["arrowleft", "arrowright"].includes(key) && current.page === "d") {
    event.preventDefault();
    const options = manifest.decisions.find((d) => d.id === current.id).options;
    const index = options.findIndex((o) => o.id === current.option);
    location.hash = `#/d/${current.id}/${options[(index + (key === "arrowright" ? 1 : -1) + options.length) % options.length].id}`;
  } else if (["p", "l", "b", "f", "["].includes(key)) {
    event.preventDefault();
    act({ p: "pick", l: "like", b: "beside", f: "focus", "[": "rail" }[key], null);
  } else if (key === "escape") {
    document.body.classList.remove("menu-open");
    resetConfirm = false;
    renderRail();
    updateMenuState();
  }
});
document.getElementById("mobile-title").textContent = manifest.title;
document.querySelector(".mobile-bar [data-action=rail]").innerHTML = icon("menu");
let restoreError = "";
try {
  const saved = localStorage.getItem(storageKey);
  if (saved) choices = parseChoices(JSON.parse(saved));
} catch (error) {
  restoreError = `Could not restore saved choices: ${error.message}. Export to keep your work.`;
}
addEventListener("hashchange", navigate);
navigate();
if (restoreError) toast(restoreError, true);
