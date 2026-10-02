// @ts-check
(() => {
  /** @typedef {{active:boolean, choice:(id:string)=>string, is:(id:string, option:string)=>boolean, state:Record<string, unknown>}} Client */
  /** @type {Window & typeof globalThis & {optionlab?: Client}} */
  const win = window;
  if (win.optionlab) return;
  /** @param {unknown} value @returns {value is Record<string, any>} */
  const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  let config = {};
  try {
    const parsed = JSON.parse(window.name || "{}");
    if (record(parsed) && parsed.ol === 1) config = parsed;
  } catch {
    // Other applications also use window.name; it is not necessarily JSON.
  }
  const active = parent !== window && config.ol === 1;
  const choices = Object.create(null);
  const state = Object.create(null);
  for (const [key, value] of new URLSearchParams(location.search)) {
    if (/^ol\.[a-z0-9-]+$/.test(key)) choices[key.slice(3)] = value;
    if (key.startsWith("ol.state.")) state[key.slice(9)] = value;
  }
  if (record(config.choices)) Object.assign(choices, config.choices);
  if (record(config.state)) Object.assign(state, config.state);
  const choice = (id) => (typeof choices[id] === "string" ? choices[id] : "now");
  win.optionlab = Object.freeze({ active, choice, is: (id, option) => choice(id) === option, state });
  for (const id of Object.keys(choices)) {
    if (/^[a-z0-9-]+$/.test(id)) document.documentElement.setAttribute(`data-ol-${id}`, choice(id));
  }
  if (!active) return;
  if (typeof config.route === "string" && config.route.startsWith("#") && location.hash !== config.route) {
    location.hash = config.route;
  }
  const post = (type, payload = {}) => parent.postMessage({ ol: 1, type, ...payload }, "*");
  const route = () => location.hash || location.pathname;
  const message = (value) => (value instanceof Error ? value.message : String(value));
  addEventListener("error", (event) =>
    post("error", { message: event.message || "A resource failed to load." }),
  );
  addEventListener("unhandledrejection", (event) => post("error", { message: message(event.reason) }));
  const originalError = console.error;
  console.error = (...args) => {
    originalError.apply(console, args);
    post("error", { message: args.map(message).join(" ") });
  };
  let focus = "";
  let lastWidth = 0;
  let lastHeight = 0;
  let pending = false;
  function measure(force = false) {
    const root = document.documentElement;
    const body = document.body;
    if (!body) return;
    const width = Math.max(root.scrollWidth, body.scrollWidth);
    const height = Math.min(30000, Math.max(root.scrollHeight, body.scrollHeight));
    if (force || Math.abs(width - lastWidth) >= 2 || Math.abs(height - lastHeight) >= 2) {
      post("size", { width, height });
      lastWidth = width;
      lastHeight = height;
    }
    if (focus) {
      try {
        const target = document.querySelector(focus);
        if (target) {
          const rect = target.getBoundingClientRect();
          post("rect", {
            top: rect.top + scrollY,
            left: rect.left + scrollX,
            width: rect.width,
            height: rect.height,
          });
        }
      } catch (error) {
        post("error", { message: `Invalid focus selector: ${message(error)}` });
        focus = "";
      }
    }
  }
  function schedule() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      measure();
    });
  }
  addEventListener("message", (event) => {
    if (event.source !== parent || !record(event.data) || event.data.ol !== 1) return;
    if (event.data.type === "init") {
      focus = typeof event.data.focus === "string" ? event.data.focus : "";
      measure(true);
    }
  });
  function ready() {
    post("ready", { title: document.title, route: route() });
    measure(true);
    const observer = new ResizeObserver(schedule);
    observer.observe(document.documentElement);
    if (document.body) observer.observe(document.body);
    document.fonts.ready.then(() => measure(true));
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ready, { once: true });
  else queueMicrotask(ready);
  addEventListener("load", () => measure(true));
  addEventListener("resize", schedule);
  addEventListener("scroll", schedule, { passive: true });
  addEventListener("hashchange", () => {
    post("ready", { title: document.title, route: route() });
    schedule();
  });
})();
