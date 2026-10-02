// @ts-check
const frameRecords = new Map();
const ownedFrames = new Set();
let framePlans = [];
let loadingFrames = 0;
const frameObserver = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      const rec = frameRecords.get(entry.target.dataset.key);
      if (rec && entry.isIntersecting) rec.visible = true;
    }
    pumpFrames();
  },
  { rootMargin: "240px" },
);
const frameResize = new ResizeObserver((entries) => {
  for (const entry of entries) {
    const rec = frameRecords.get(entry.target.dataset.key);
    if (rec) layoutFrame(rec.active || rec.pending);
  }
});
function frameSlot(key, view, option = "now", decision = "", extra = {}) {
  const slot = `frame-slot-${framePlans.length}`;
  framePlans.push({ key, slot, view, option, choices: frameChoices(decision, option), ...extra });
  return `<div id="${slot}" class="frame-slot" data-frame-key="${escapeHTML(key)}"></div>`;
}
function frameRoute(view) {
  if (view.file) return view.file.includes("#") ? view.file.slice(view.file.indexOf("#")) : view.file;
  const url = new URL(view.url, manifest.base);
  return url.pathname + url.search + url.hash;
}
function finishLoading(task) {
  clearTimeout(task.swapTimer);
  clearTimeout(task.failTimer);
  if (task.loading) {
    task.loading = false;
    loadingFrames--;
  }
  queueMicrotask(pumpFrames);
}
function disposeFrame(task) {
  if (!task || task.disposed) return;
  task.disposed = true;
  finishLoading(task);
  ownedFrames.delete(task);
  task.frame?.remove();
}
function activateFrame(task) {
  const rec = task.rec;
  if (task.disposed || (rec.pending !== task && rec.active !== task)) return;
  if (rec.active && rec.active !== task) disposeFrame(rec.active);
  rec.active = task;
  task.frame.style.opacity = "1";
  task.frame.style.pointerEvents = "auto";
  rec.status.hidden = task.ready && !task.error;
  layoutFrame(task);
}
function failFrame(task, text) {
  if (task.disposed || (task.rec.pending !== task && task.rec.active !== task)) return;
  task.error = text;
  finishLoading(task);
  if (task.frame) activateFrame(task);
  task.rec.status.hidden = false;
  task.rec.status.innerHTML = `<strong>${escapeHTML(text)}</strong><code>${escapeHTML(task.plan.view.url || task.plan.view.file)}</code><ul><li>Start the dev server for live pages.</li><li>Include the optionlab client.</li><li>Check the URL or file source.</li></ul>${button("Try again", "retry", `data-key="${escapeHTML(task.plan.key)}"`)}`;
  task.rec.card.classList.add("frame-error");
}
function layoutFrame(task) {
  if (!task?.frame || task.disposed) return;
  const { view, full } = task.plan;
  const [width, viewportHeight] = manifest.devices[view.device || "laptop"];
  const phone = (view.device || "laptop") === "phone";
  const focused = !full && Boolean(view.focus) && task.rect;
  const height = phone && !focused ? viewportHeight : Math.max(viewportHeight, task.height || 0);
  let left = 0,
    top = 0,
    cropWidth = width,
    cropHeight = height;
  if (focused) {
    left = Math.max(0, task.rect.left - 24);
    top = Math.max(0, task.rect.top - 24);
    cropWidth = Math.min(width - left, task.rect.width + 48);
    cropHeight = Math.min(height - top, task.rect.height + 48);
  }
  const bezel = phone && !focused;
  const available = Math.max(1, task.rec.body.clientWidth - 32 - (bezel ? 16 : 0));
  const scale = Math.min(1, available / Math.max(1, cropWidth));
  task.frame.style.width = `${width}px`;
  task.frame.style.height = `${height}px`;
  task.frame.style.transform = `translate(${-left * scale}px, ${-top * scale}px) scale(${scale})`;
  if (task.rec.active && task.rec.active !== task) return;
  task.rec.clip.classList.toggle("bezel", bezel);
  task.rec.clip.style.width = `${cropWidth * scale}px`;
  task.rec.clip.style.height = `${Math.max(1, cropHeight * scale)}px`;
}
function sendFrame(task, type, payload = {}) {
  task.frame?.contentWindow?.postMessage(
    { ol: 1, type, ...payload },
    task.origin === "null" ? "*" : task.origin,
  );
}
function startFrame(task) {
  if (task.disposed || task.rec.pending !== task) return;
  task.loading = true;
  loadingFrames++;
  const { view, option, choices: picks } = task.plan;
  const frame = document.createElement("iframe");
  task.frame = frame;
  frame.title = `${view.caption || view.label || "Page"} / ${option === "now" ? "Current" : option.toUpperCase()}`;
  frame.style.opacity = "0";
  frame.style.pointerEvents = "none";
  const file = view.file?.replaceAll("{option}", option);
  const split = file?.indexOf("#") ?? -1;
  frame.name = JSON.stringify({
    ol: 1,
    choices: picks,
    state: view.state || {},
    route: split >= 0 ? file.slice(split) : "",
  });
  ownedFrames.add(task);
  if (file) {
    frame.setAttribute("sandbox", "allow-scripts allow-forms");
    task.origin = "null";
    frame.srcdoc = data.files[data.fileIds[split >= 0 ? file.slice(0, split) : file]];
  } else {
    const url = new URL(view.url, manifest.base);
    task.origin = url.origin;
    frame.src = url.href;
  }
  task.rec.clip.append(frame);
  layoutFrame(task);
  task.swapTimer = setTimeout(() => activateFrame(task), 3000);
  task.failTimer = setTimeout(() => failFrame(task, "This page has not connected."), 8000);
}
function pumpFrames() {
  for (const rec of frameRecords.values()) {
    const task = rec.pending;
    if (loadingFrames >= 2) break;
    if (rec.visible && task && !task.frame && !task.disposed) startFrame(task);
  }
}
function requestFrame(rec, plan) {
  disposeFrame(rec.pending === rec.active ? null : rec.pending);
  rec.card.classList.remove("frame-error");
  rec.status.innerHTML = `<span class="loading-line"></span><span>Loading the live page</span>`;
  rec.status.hidden = Boolean(rec.active);
  rec.pending = { rec, plan, loading: false, ready: false, disposed: false, height: 0 };
  if (rec.active?.error) {
    disposeFrame(rec.active);
    rec.active = null;
    rec.status.hidden = false;
  }
  pumpFrames();
}
function syncFrames() {
  const wanted = new Set(framePlans.map((p) => p.key));
  for (const [key, rec] of frameRecords) {
    if (wanted.has(key)) continue;
    frameObserver.unobserve(rec.card);
    frameResize.unobserve(rec.card);
    disposeFrame(rec.pending);
    disposeFrame(rec.active);
    frameRecords.delete(key);
  }
  for (const plan of framePlans) {
    let rec = frameRecords.get(plan.key);
    if (!rec) {
      const card = document.createElement("section");
      card.className = "frame-card";
      card.dataset.key = plan.key;
      card.innerHTML =
        '<div class="frame-caption"></div><div class="frame-body"><div class="frame-viewport"></div><div class="frame-status" role="status"></div></div>';
      rec = {
        card,
        body: card.querySelector(".frame-body"),
        clip: card.querySelector(".frame-viewport"),
        status: card.querySelector(".frame-status"),
        active: null,
        pending: null,
        visible: false,
      };
      frameRecords.set(plan.key, rec);
      frameObserver.observe(card);
      frameResize.observe(card);
    }
    document.getElementById(plan.slot)?.replaceWith(rec.card);
    const label = plan.label || (plan.option === "now" ? "Current" : plan.option.toUpperCase());
    rec.card.querySelector(".frame-caption").innerHTML =
      `<span>${escapeHTML(plan.view.caption || plan.view.label || "Page")} <span class="muted">/ ${escapeHTML(label)}</span></span><code>${escapeHTML(frameRoute(plan.view))}</code>`;
    const signature = JSON.stringify({
      view: plan.view,
      option: plan.option,
      choices: plan.choices,
      full: plan.full,
      inspect: plan.inspect,
      highlight: plan.highlight,
    });
    if (signature !== rec.signature) {
      rec.signature = signature;
      requestFrame(rec, plan);
    } else {
      if (rec.active) rec.active.plan = plan;
      if (rec.pending) rec.pending.plan = plan;
      layoutFrame(rec.active || rec.pending);
    }
  }
  pumpFrames();
}
addEventListener("message", (event) => {
  const payload = event.data;
  if (!payload || typeof payload !== "object" || payload.ol !== 1) return;
  const task = [...ownedFrames].find((entry) => entry.frame.contentWindow === event.source);
  if (!task || task.disposed || event.origin !== task.origin) return;
  if (task.rec.pending !== task && task.rec.active !== task) return;
  if (payload.type === "ready" && !task.error) {
    task.ready = true;
    finishLoading(task);
    sendFrame(task, "init", {
      elements: items("elements"),
      inspect: Boolean(task.plan.inspect),
      highlight: task.plan.highlight || null,
      focus: task.plan.full ? "" : task.plan.view.focus || "",
    });
    activateFrame(task);
    if (task.rec.pending === task) task.rec.pending = null;
  } else if (payload.type === "size" && Number.isFinite(payload.height) && payload.height > 0) {
    task.height = Math.min(30000, payload.height);
    layoutFrame(task);
  } else if (
    payload.type === "rect" &&
    ["top", "left", "width", "height"].every((key) => Number.isFinite(payload[key]) && payload[key] >= 0)
  ) {
    task.rect = payload;
    layoutFrame(task);
  } else if (payload.type === "error" && typeof payload.message === "string") {
    failFrame(task, payload.message);
  }
  task.plan.onMessage?.(task, payload);
});
