// @ts-check
const data = JSON.parse(document.getElementById("prismal-data").textContent);
const manifest = data.manifest;
const storageKey = `prismal:${manifest.title}:r${manifest.round}`;
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
    prismal: 1,
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
    raw.prismal !== 1 ||
    typeof raw.title !== "string" ||
    !raw.title.trim() ||
    typeof raw.exported !== "string" ||
    Number.isNaN(Date.parse(raw.exported)) ||
    !Number.isInteger(raw.round) ||
    raw.round < 1
  )
    throw new Error("Not a Prismal choices file.");
  const text = (value) => value === null || typeof value === "string";
  if (typeof raw.notes !== "string") throw new Error("Choices notes must be text.");
  const fields = {
    decisions: "id title note",
    questions: "id note",
    words: "id term note",
    elements: "name route text note",
    journeys: "journey title note",
  };
  const valid = {
    decisions: (v) =>
      text(v.pick) &&
      text(v.pickName) &&
      Array.isArray(v.liked) &&
      v.liked.every((id) => typeof id === "string"),
    questions: (v) => text(v.answer),
    words: (v) => text(v.choice),
    elements: (v) =>
      [null, "clear", "unclear", "change"].includes(v.verdict) &&
      (v.index === undefined || (Number.isInteger(v.index) && v.index >= 0)),
    journeys: (v) =>
      [null, "obvious", "unclear", "missing"].includes(v.verdict) && Number.isInteger(v.step) && v.step > 0,
  };
  for (const [key, names] of Object.entries(fields)) {
    if (!Array.isArray(raw[key])) throw new Error(`Choices ${key} must be a list.`);
    const seen = new Set();
    for (const entry of raw[key]) {
      if (
        !object(entry) ||
        names.split(" ").some((name) => typeof entry[name] !== "string") ||
        !valid[key](entry)
      )
        throw new Error(`Invalid ${key} choices.`);
      const identity = JSON.stringify(
        key === "elements"
          ? [entry.name, entry.route, entry.index || 0]
          : key === "journeys"
            ? [entry.journey, entry.step]
            : entry.id,
      );
      if (seen.has(identity)) throw new Error(`Duplicate ${key} choices.`);
      seen.add(identity);
    }
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
  link.download = `prismal-choices-r${manifest.round}.json`;
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
