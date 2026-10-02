// @ts-check
const data = JSON.parse(document.getElementById("optionlab-data").textContent);
const manifest = data.manifest;
const storageKey = `optionlab:${manifest.title}:r${manifest.round}`;
const stage = document.getElementById("stage");
const rail = document.getElementById("rail");
const escapeHTML = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
const button = (label, action, extra = "", classes = "") =>
  `<button type="button" class="button ${classes}" data-action="${action}" ${extra}>${label}</button>`;
const items = (key) => manifest[key] || [];
let toastTimer;
function toast(text, error = false) {
  const element = document.getElementById("toast");
  element.textContent = text;
  element.classList.toggle("error", error);
  element.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(
    () => {
      element.hidden = true;
    },
    error ? 10000 : 4500,
  );
}
function freshChoices() {
  return {
    optionlab: 1,
    title: manifest.title,
    round: manifest.round,
    exported: "",
    decisions: manifest.decisions.map((d) => ({
      id: d.id,
      title: d.title,
      pick: null,
      pickName: null,
      liked: [],
      note: "",
    })),
    questions: items("questions").map((q) => ({ id: q.id, answer: null, note: "" })),
    words: items("words").map((w) => ({ id: w.id, term: w.term, choice: null, note: "" })),
    elements: [],
    journeys: items("journeys").flatMap((j) =>
      j.steps.map((s, i) => ({ journey: j.id, step: i + 1, title: s.title, verdict: null, note: "" })),
    ),
    notes: "",
  };
}
let choices = freshChoices();
let storageUnavailable = false;
function exportChoices() {
  return { ...choices, exported: new Date().toISOString() };
}
function save() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(exportChoices()));
  } catch {
    if (!storageUnavailable)
      toast("Autosave is unavailable in this browser. Export to keep your choices.", true);
    storageUnavailable = true;
  }
  renderRail();
}
function parseChoices(raw) {
  const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  if (
    !object(raw) ||
    raw.optionlab !== 1 ||
    typeof raw.title !== "string" ||
    !Number.isInteger(raw.round) ||
    raw.round < 1
  )
    throw new Error("Not an optionlab choices file.");
  const list = (key) => {
    if (!Array.isArray(raw[key]) || raw[key].some((v) => !object(v)))
      throw new Error(`Choices ${key} must be a list.`);
    return raw[key];
  };
  const text = (value) => value === null || typeof value === "string";
  const note = (entry) => typeof entry.note === "string";
  if (typeof raw.notes !== "string") throw new Error("Choices notes must be text.");
  for (const d of list("decisions")) {
    if (
      typeof d.id !== "string" ||
      !text(d.pick) ||
      !note(d) ||
      !Array.isArray(d.liked) ||
      d.liked.some((v) => typeof v !== "string")
    )
      throw new Error("Invalid decision choices.");
  }
  for (const q of list("questions"))
    if (typeof q.id !== "string" || !text(q.answer) || !note(q)) throw new Error("Invalid question choices.");
  for (const w of list("words"))
    if (typeof w.id !== "string" || !text(w.choice) || !note(w)) throw new Error("Invalid word choices.");
  for (const e of list("elements")) {
    if (
      typeof e.name !== "string" ||
      typeof e.route !== "string" ||
      typeof e.text !== "string" ||
      !note(e) ||
      ![null, "clear", "unclear", "change"].includes(e.verdict) ||
      (e.index !== undefined && (!Number.isInteger(e.index) || e.index < 0))
    )
      throw new Error("Invalid element choices.");
  }
  for (const j of list("journeys")) {
    if (
      typeof j.journey !== "string" ||
      !Number.isInteger(j.step) ||
      j.step < 1 ||
      !note(j) ||
      ![null, "obvious", "unclear", "missing"].includes(j.verdict)
    )
      throw new Error("Invalid journey choices.");
  }
  const next = freshChoices();
  for (const d of next.decisions) {
    const incoming = raw.decisions.find((entry) => entry.id === d.id);
    const definition = manifest.decisions.find((entry) => entry.id === d.id);
    if (!incoming) continue;
    if (incoming.pick !== null && !definition.options.some((option) => option.id === incoming.pick))
      throw new Error(`Unknown pick for ${d.id}: ${incoming.pick}`);
    if (incoming.liked.some((id) => !definition.options.some((option) => option.id === id)))
      throw new Error(`Unknown liked option for ${d.id}.`);
    d.pick = incoming.pick;
    d.pickName = definition.options.find((option) => option.id === d.pick)?.name ?? null;
    d.liked = [...new Set(incoming.liked)];
    d.note = incoming.note;
  }
  for (const key of ["questions", "words"]) {
    for (const entry of next[key]) {
      const incoming = raw[key].find((value) => value.id === entry.id);
      if (!incoming) continue;
      const field = key === "questions" ? "answer" : "choice";
      if (
        key === "questions" &&
        incoming.answer !== null &&
        !items("questions")
          .find((q) => q.id === entry.id)
          .choices.includes(incoming.answer)
      )
        throw new Error(`Unknown answer for ${entry.id}.`);
      entry[field] = incoming[field];
      entry.note = incoming.note;
    }
  }
  next.elements = raw.elements.map(({ name, route, text, verdict, note, index = 0 }) => ({
    name,
    route,
    text,
    verdict,
    note,
    index,
  }));
  for (const j of next.journeys) {
    const incoming = raw.journeys.find((entry) => entry.journey === j.journey && entry.step === j.step);
    if (incoming) {
      j.verdict = incoming.verdict;
      j.note = incoming.note;
    }
  }
  next.notes = raw.notes;
  return next;
}
function downloadChoices() {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(exportChoices(), null, 2) + "\n"], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `optionlab-choices-r${manifest.round}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("Choices exported. Hand the JSON file back to your agent.");
}
function frameChoices(id, option) {
  const result = { ...manifest.defaults };
  for (const d of choices.decisions) if (d.pick !== null) result[d.id] = d.pick;
  if (id) result[id] = option;
  return result;
}
function decisionState(id) {
  return choices.decisions.find((d) => d.id === id);
}
