const connectionButton = document.querySelector("#connectionButton");
const connectionLabel = document.querySelector("#connectionLabel");
const targetForm = document.querySelector("#targetForm");
const targetHost = document.querySelector("#targetHost");
const targetPort = document.querySelector("#targetPort");
const addModuleForm = document.querySelector("#addModuleForm");
const newModuleType = document.querySelector("#newModuleType");
const newModuleTitle = document.querySelector("#newModuleTitle");
const modulesContainer = document.querySelector("#modulesContainer");
const customContainer = document.querySelector("#customContainer");
const addCustomButton = document.querySelector("#addCustomButton");
const activityLog = document.querySelector("#activityLog");
const deviceList = document.querySelector("#deviceList");
const deviceCount = document.querySelector("#deviceCount");
const destinationDevice = document.querySelector("#destinationDevice");
const destinationEndpoint = document.querySelector("#destinationEndpoint");
const titleLockButton = document.querySelector("#titleLockButton");
const lockIcon = document.querySelector("#lockIcon");
const lockLabel = document.querySelector("#lockLabel");
const zoomValue = document.querySelector("#zoomValue");
const logToggleButton = document.querySelector("#logToggleButton");
const saveStatus = document.querySelector("#saveStatus");

let oscPort = null;
let connectionState = "disconnected";
let deletionUnlocked = false;
let saveTimer = null;
let idCounter = 0;
let state = null;
let draggedModuleId = null;
let draggedVideoModuleId = null;
let moduleLayoutFrame = null;
let videoLayoutFrame = null;
let destinationPulseTimer = null;
const devicePulseTimers = new Map();

function scheduleModuleLayout() {
  cancelAnimationFrame(moduleLayoutFrame);
  moduleLayoutFrame = requestAnimationFrame(() => {
    const styles = getComputedStyle(modulesContainer);
    const rowHeight = Number.parseFloat(styles.gridAutoRows) || 4;
    const rowGap = Number.parseFloat(styles.rowGap) || 4;
    modulesContainer.querySelectorAll(".module-card").forEach((card) => {
      const height = card.offsetHeight;
      card.style.gridRowEnd = `span ${Math.max(1, Math.ceil((height + rowGap) / (rowHeight + rowGap)))}`;
    });
  });
}

function scheduleVideoLayout() {
  const container = document.querySelector("#videoControls");
  if (!container) return;
  cancelAnimationFrame(videoLayoutFrame);
  videoLayoutFrame = requestAnimationFrame(() => {
    const styles = getComputedStyle(container);
    const rowHeight = Number.parseFloat(styles.gridAutoRows) || 4;
    const rowGap = Number.parseFloat(styles.rowGap) || 4;
    container.querySelectorAll(".video-control-panel").forEach((card) => {
      const height = card.offsetHeight;
      card.style.gridRowEnd = `span ${Math.max(1, Math.ceil((height + rowGap) / (rowHeight + rowGap)))}`;
    });
  });
}

const moduleResizeObserver = new ResizeObserver(scheduleModuleLayout);
const videoResizeObserver = new ResizeObserver(scheduleVideoLayout);
window.addEventListener("resize", () => {
  scheduleModuleLayout();
  scheduleVideoLayout();
});

function makeId(prefix) {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

function makeSlider(title, address, min = 0, max = 1, step = 0.01, value = 0.5, id = makeId("slider")) {
  return { id, type: "slider", title, address, oscType: "f", min, max, step, value, locked: false, settingsLocked: false, controlLocked: false, collapsed: false };
}

function makeButton(type, title, address, id = makeId(type)) {
  return {
    id,
    type,
    title,
    address,
    oscType: "i",
    offValue: 0,
    onValue: 1,
    active: false,
    locked: false,
    settingsLocked: false,
    controlLocked: false,
    collapsed: false,
  };
}

function makeXY(type, title, address, id = makeId(type)) {
  const pointCount = type === "xy2" ? 2 : 1;
  return {
    id,
    type,
    title,
    address,
    oscType: "f",
    scaleMin: 0,
    scaleMax: 1,
    outputMode: "together",
    points: pointCount === 1 ? [[0.5, 0.5]] : [[0.25, 0.25], [0.75, 0.75]],
    valueNames: pointCount === 1 ? ["x", "y"] : ["x1", "y1", "x2", "y2"],
    pairNames: ["a", "b"],
    presets: [null, null, null, null],
    locked: false,
    settingsLocked: false,
    controlLocked: false,
    collapsed: false,
  };
}

function makeCustom(title = "Custom send", id = makeId("custom")) {
  return { id, title, address: "/custom/value", oscType: "f", value: "0.5" };
}

function defaultVideoModules() {
  return [
    ["video-output", "Output", "Render target"],
    ["video-source", "Source", "Input"],
    ["video-generators", "Generators", "Procedural"],
    ["video-transform", "Tile & distort", "Output transform"],
    ["video-draw", "Draw", "Paint source"],
    ["video-markers", "Markers", "Output annotation"],
    ["video-presentation", "Clean output", "Presentation"],
  ].map(([id, title, type]) => ({ id, title, type, locked: false, settingsLocked: false, controlLocked: false, collapsed: false }));
}

function defaultState() {
  return {
    schema: 1,
    activeTab: "sliders",
    zoom: 1,
    logVisible: true,
    target: { host: "127.0.0.1", port: 8000 },
    video: {
      width: 1920,
      height: 1080,
      source: "checker",
      checkerSize: 96,
      checkerColorA: "#ffffff",
      checkerColorB: "#0a0a0a",
      solidColor: "#0a0a0a",
      text: "TYPE HERE",
      textSize: 180,
      textColor: "#0a0a0a",
      textBackground: "#ffffff",
      textOverlayVisible: false,
      textBoxVisible: false,
      textX: 0.5,
      textY: 0.5,
      tileX: 1,
      tileY: 1,
      stretchX: 1,
      stretchY: 1,
      loop: true,
      brushSize: 8,
      brushColor: "#0a0a0a",
      crossSize: 120,
      pointSize: 12,
      selectedMarkerId: "video-marker-1",
      markers: [{ id: "video-marker-1", name: "Marker 1", x: 0.5, y: 0.5, color: "#ff0000", visible: true }],
      drawingData: null,
      imageData: null,
      outputDisplayId: "",
    },
    videoModules: defaultVideoModules(),
    modules: [
      makeSlider("Volume", "/mixer/volume", 0, 1, 0.01, 0.75, "slider-volume"),
      makeSlider("Pan", "/mixer/pan", -1, 1, 0.01, 0, "slider-pan"),
      makeSlider("Effect", "/effect/amount", 0, 1, 0.01, 0.25, "slider-effect"),
      makeSlider("Speed", "/transport/speed", 0, 2, 0.01, 1, "slider-speed"),
      makeXY("xy1", "Single point", "/position/xy", "xy-single"),
      makeXY("xy2", "Two points", "/position/two-point", "xy-double"),
      makeButton("trigger", "Play", "/transport/play", "button-play"),
      makeButton("trigger", "Stop", "/transport/stop", "button-stop"),
      makeButton("toggle", "Mute", "/mixer/mute", "button-mute"),
    ],
    customSends: [makeCustom("Custom send", "custom-1")],
  };
}

function hydrateModule(module) {
  if (!module || typeof module !== "object") return null;
  if (module.type === "slider") return { ...makeSlider("Slider", "/slider"), ...module };
  if (module.type === "trigger" || module.type === "toggle") return { ...makeButton(module.type, "Button", "/button"), ...module };
  if (module.type === "xy1" || module.type === "xy2") {
    const hydrated = { ...makeXY(module.type, "XY pad", "/xy"), ...module };
    const expectedValues = module.type === "xy2" ? 4 : 2;
    const expectedPoints = module.type === "xy2" ? 2 : 1;
    hydrated.points = Array.isArray(module.points) && module.points.length === expectedPoints ? module.points : makeXY(module.type, "", "").points;
    hydrated.valueNames = Array.isArray(module.valueNames) && module.valueNames.length === expectedValues ? module.valueNames : makeXY(module.type, "", "").valueNames;
    hydrated.pairNames = Array.isArray(module.pairNames) && module.pairNames.length === 2 ? module.pairNames : ["a", "b"];
    hydrated.presets = Array.from({ length: 4 }, (_, index) => Array.isArray(module.presets?.[index]) ? module.presets[index] : null);
    return hydrated;
  }
  return null;
}

function hydrateState(saved) {
  const defaults = defaultState();
  if (!saved || typeof saved !== "object") return defaults;
  const modules = Array.isArray(saved.modules) ? saved.modules.map(hydrateModule).filter(Boolean) : defaults.modules;
  const customSends = Array.isArray(saved.customSends)
    ? saved.customSends.map((custom) => ({ ...makeCustom(), ...custom }))
    : defaults.customSends;
  const savedVideo = saved.video || {};
  const markerValue = (value, fallback) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : fallback;
  };
  const fallbackMarker = {
    id: "video-marker-1",
    name: "Marker 1",
    x: markerValue(savedVideo.crossX, 0.5),
    y: markerValue(savedVideo.crossY, 0.5),
    color: savedVideo.overlayColor || "#ff0000",
    visible: savedVideo.overlayVisible !== false,
  };
  const markers = Array.isArray(savedVideo.markers) && savedVideo.markers.length
    ? savedVideo.markers.map((marker, index) => ({
        id: String(marker.id || `video-marker-${index + 1}`),
        name: String(marker.name || `Marker ${index + 1}`),
        x: markerValue(marker.x, 0),
        y: markerValue(marker.y, 0),
        color: /^#[0-9a-f]{6}$/i.test(marker.color) ? marker.color : "#ff0000",
        visible: marker.visible !== false,
      }))
    : [fallbackMarker];
  const video = { ...defaults.video, ...savedVideo, markers };
  if (!markers.some((marker) => marker.id === video.selectedMarkerId)) video.selectedMarkerId = markers[0].id;
  const savedVideoModules = Array.isArray(saved.videoModules) ? saved.videoModules : [];
  const moduleById = new Map(savedVideoModules.map((module) => [module.id, module]));
  const videoModules = [
    ...savedVideoModules
      .map((module) => defaults.videoModules.find((candidate) => candidate.id === module.id) ? { ...defaults.videoModules.find((candidate) => candidate.id === module.id), ...module } : null)
      .filter(Boolean),
    ...defaults.videoModules.filter((module) => !moduleById.has(module.id)),
  ];
  return {
    ...defaults,
    ...saved,
    target: { ...defaults.target, ...(saved.target || {}) },
    video,
    videoModules,
    modules,
    customSends,
  };
}

async function loadState() {
  try {
    const response = await fetch("/api/state", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not load state");
    return hydrateState(result.state);
  } catch (error) {
    addLog("error", "State", error.message);
    return defaultState();
  }
}

async function persistState() {
  if (!state) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  saveStatus.textContent = "Saving…";
  saveStatus.classList.add("saving");
  try {
    const response = await fetch("/api/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state }),
    });
    if (!response.ok) throw new Error("Save failed");
    saveStatus.textContent = "Saved";
    saveStatus.classList.remove("saving");
  } catch (error) {
    saveStatus.textContent = "Not saved";
    saveStatus.classList.add("saving");
    addLog("error", "State", error.message);
  }
}

function scheduleSave(delay = 180) {
  clearTimeout(saveTimer);
  saveStatus.textContent = "Unsaved";
  saveStatus.classList.add("saving");
  saveTimer = setTimeout(persistState, delay);
}

function setConnectionState(nextState, label) {
  connectionState = nextState;
  document.body.dataset.connection = nextState;
  connectionLabel.textContent = label;
  const destinationState = destinationDevice.querySelector(".device-state");
  if (nextState !== "connected") destinationState.textContent = nextState === "connecting" ? "Opening" : "Offline";
  else if (!destinationDevice.classList.contains("is-sending")) destinationState.textContent = "Ready";
}

function deviceDescriptors() {
  if (!state) return [];
  return [
    ...state.modules.map((module) => ({ id: module.id, title: module.title, address: normalizedAddress(module.address) })),
    ...state.customSends.map((custom) => ({ id: custom.id, title: custom.title, address: normalizedAddress(custom.address) })),
  ];
}

function renderDevices() {
  if (!state) return;
  devicePulseTimers.forEach(clearTimeout);
  devicePulseTimers.clear();
  const devices = deviceDescriptors();
  deviceCount.textContent = String(devices.length);
  destinationEndpoint.textContent = `${state.target.host}:${state.target.port}`;
  deviceList.replaceChildren();
  devices.forEach((device) => {
    const item = document.createElement("li");
    item.dataset.deviceId = device.id;
    item.innerHTML = '<span class="device-status-dot" aria-hidden="true"></span><div><strong></strong><code></code></div><span class="device-state">Idle</span><span class="device-value">No output yet</span>';
    item.querySelector("strong").textContent = device.title;
    item.querySelector("code").textContent = device.address;
    deviceList.append(item);
  });
}

function pulseDevice(address, value) {
  destinationDevice.classList.add("is-sending");
  destinationDevice.querySelector(".device-state").textContent = "Sending";
  clearTimeout(destinationPulseTimer);
  destinationPulseTimer = setTimeout(() => {
    destinationDevice.classList.remove("is-sending");
    destinationDevice.querySelector(".device-state").textContent = connectionState === "connected" ? "Ready" : "Offline";
  }, 1400);

  const normalized = normalizedAddress(address);
  const device = deviceDescriptors()
    .filter((candidate) => normalized === candidate.address || normalized.startsWith(`${candidate.address.replace(/\/+$/, "")}/`))
    .sort((a, b) => b.address.length - a.address.length)[0];
  if (!device) return;
  const item = [...deviceList.children].find((candidate) => candidate.dataset.deviceId === device.id);
  if (!item) return;
  item.classList.add("is-sending");
  item.querySelector(".device-state").textContent = "Sending";
  item.querySelector(".device-value").textContent = String(value);
  clearTimeout(devicePulseTimers.get(device.id));
  devicePulseTimers.set(device.id, setTimeout(() => {
    item.classList.remove("is-sending");
    item.querySelector(".device-state").textContent = "Idle";
    devicePulseTimers.delete(device.id);
  }, 1400));
}

function addLog(kind, address, value) {
  activityLog.querySelector(".empty-log")?.remove();
  const item = document.createElement("li");
  const time = new Date().toLocaleTimeString([], { hour12: false });
  item.innerHTML = `<time></time><code></code><span class="log-value"></span>`;
  item.querySelector("time").textContent = time;
  item.querySelector("code").textContent = address;
  item.querySelector(".log-value").textContent = `${kind} ${value}`;
  activityLog.prepend(item);
  while (activityLog.children.length > 120) activityLog.lastElementChild.remove();
}

function showEmptyLog() {
  activityLog.innerHTML = '<li class="empty-log">No messages sent yet.</li>';
}

function normalizedAddress(value) {
  let address = String(value || "").trim();
  if (address && !address.startsWith("/")) address = `/${address}`;
  return address;
}

function validAddress(address) {
  return Boolean(address) && !/\s/.test(address);
}

function suffixName(value, fallback) {
  const cleaned = String(value || fallback)
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .replace(/\s+/g, "_")
    .replace(/[#,?*\[\]{}]/g, "");
  return cleaned || fallback;
}

function addressWithSuffix(base, suffix) {
  return `${normalizedAddress(base).replace(/\/+$/, "")}/${suffixName(suffix, "value")}`;
}

function connect() {
  if (connectionState === "connected" || connectionState === "connecting") return;
  setConnectionState("connecting", "Connecting…");
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  oscPort = new osc.WebSocketPort({ url: `${protocol}://${window.location.host}/osc`, metadata: true });
  oscPort.on("ready", () => {
    setConnectionState("connected", "Connected");
    addLog("status", "WebSocket", "connected");
  });
  oscPort.on("close", () => {
    oscPort = null;
    setConnectionState("disconnected", "Connect");
  });
  oscPort.on("error", (error) => {
    setConnectionState("error", "Connection error");
    addLog("error", "WebSocket", error.message || "connection failed");
  });
  oscPort.open();
}

function disconnect() {
  oscPort?.close();
  oscPort = null;
  setConnectionState("disconnected", "Connect");
}

function sendPacket(addressValue, args, summary = args.map((argument) => argument.value).join(", ")) {
  const address = normalizedAddress(addressValue);
  if (connectionState !== "connected" || !oscPort) {
    addLog("blocked", address || "(empty address)", "connect first");
    return false;
  }
  if (!validAddress(address)) {
    addLog("error", address || "(empty address)", "invalid OSC address");
    return false;
  }
  if (args.some((argument) => argument.type !== "s" && !Number.isFinite(argument.value))) {
    addLog("error", address, "invalid value");
    return false;
  }
  oscPort.send({ address, args });
  addLog(`sent ,${args.map((argument) => argument.type).join("")}`, address, summary);
  pulseDevice(address, summary);
  return true;
}

function typedValue(type, rawValue) {
  const value = Number(rawValue);
  return type === "i" ? Math.round(value) : value;
}

function sendValue(address, type, rawValue) {
  const value = type === "s" ? String(rawValue) : typedValue(type, rawValue);
  return sendPacket(address, [{ type, value }], String(value));
}

async function applyTarget(host, port, announce = true) {
  const response = await fetch("/api/target", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ host, port }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Could not update target");
  if (announce) addLog("target", `${result.target.host}:${result.target.port}`, "applied");
  return result.target;
}

function uniqueTitle(requested, collection) {
  const base = String(requested || "New module").trim() || "New module";
  const used = new Set(collection.map((item) => item.title.toLowerCase()));
  if (!used.has(base.toLowerCase())) return base;
  let index = 2;
  while (used.has(`${base} ${index}`.toLowerCase())) index += 1;
  return `${base} ${index}`;
}

function typeLabel(type) {
  return {
    slider: "Slider",
    trigger: "Trigger button",
    toggle: "Toggle button",
    xy1: "Single-point XY",
    xy2: "Two-point XY",
  }[type] || type;
}

function createBaseCard(module, extraClass = "") {
  const card = document.createElement("article");
  card.className = `module-card panel ${extraClass}`.trim();
  card.dataset.moduleId = module.id;
  card.innerHTML = `
    <div class="module-heading">
      <div class="move-tools">
        <button class="drag-handle" type="button" aria-label="Drag to move module" title="Drag to move module">
          <span aria-hidden="true">⠿</span>
        </button>
        <button class="module-lock-button" type="button" aria-label="Lock module position" title="Lock module position">
          <svg class="unlocked-icon" aria-hidden="true" viewBox="0 0 16 16"><path d="M5.25 7V5.25a2.75 2.75 0 0 1 5.17-1.3M3.5 7.25h9v6h-9z" /></svg>
          <svg class="locked-icon" aria-hidden="true" viewBox="0 0 16 16"><path d="M5.25 7V5.25a2.75 2.75 0 0 1 5.5 0V7M3.5 7.25h9v6h-9z" /></svg>
        </button>
      </div>
      <div class="module-title-wrap">
        <input class="module-title" aria-label="Module title" />
        <span class="module-type"></span>
      </div>
      <div class="module-tools">
        <button class="settings-lock-button red-lock-button" type="button" aria-label="Lock module parameters" title="Lock module parameters">
          <span class="lock-letter" aria-hidden="true">P</span><svg aria-hidden="true" viewBox="0 0 16 16"><path d="M5.25 7V5.25a2.75 2.75 0 0 1 5.5 0V7M3.5 7.25h9v6h-9z" /></svg>
        </button>
        <button class="control-lock-button red-lock-button" type="button" aria-label="Lock live control" title="Lock live control">
          <span class="lock-letter" aria-hidden="true">C</span><svg aria-hidden="true" viewBox="0 0 16 16"><path d="M5.25 7V5.25a2.75 2.75 0 0 1 5.5 0V7M3.5 7.25h9v6h-9z" /></svg>
        </button>
        <button class="delete-button" type="button" aria-label="Delete module">×</button>
        <button class="collapse-button" type="button" aria-label="Collapse module" title="Collapse module">
          <svg aria-hidden="true" viewBox="0 0 16 16"><path d="m3.5 10 4.5-4 4.5 4" /></svg>
        </button>
      </div>
    </div>
    <label class="address-label module-detail"><span>OSC address</span><input class="osc-address" spellcheck="false" /></label>
  `;
  const title = card.querySelector(".module-title");
  title.value = module.title;
  title.readOnly = Boolean(module.settingsLocked);
  card.querySelector(".module-type").textContent = typeLabel(module.type);
  const address = card.querySelector(".osc-address");
  const dragHandle = card.querySelector(".drag-handle");
  const collapseButton = card.querySelector(".collapse-button");
  const settingsLockButton = card.querySelector(".settings-lock-button");
  const controlLockButton = card.querySelector(".control-lock-button");
  const lockButton = card.querySelector(".module-lock-button");
  address.value = module.address;

  function applyModulePresentation() {
    card.classList.toggle("is-locked", Boolean(module.locked));
    card.classList.toggle("is-settings-locked", Boolean(module.settingsLocked));
    card.classList.toggle("is-control-locked", Boolean(module.controlLocked));
    card.classList.toggle("is-all-locked", Boolean(module.locked && module.settingsLocked && module.controlLocked));
    card.classList.toggle("is-collapsed", Boolean(module.collapsed));
    dragHandle.draggable = !module.locked;
    dragHandle.disabled = Boolean(module.locked);
    dragHandle.title = module.locked ? "Unlock this module before moving it" : "Drag to move module";
    collapseButton.setAttribute("aria-expanded", String(!module.collapsed));
    collapseButton.setAttribute("aria-label", module.collapsed ? "Expand module" : "Collapse module");
    collapseButton.title = module.collapsed ? "Expand module" : "Collapse module";
    lockButton.setAttribute("aria-pressed", String(Boolean(module.locked)));
    lockButton.setAttribute("aria-label", module.locked ? "Unlock module position" : "Lock module position");
    lockButton.title = module.locked ? "Unlock module position" : "Lock module position";
    settingsLockButton.setAttribute("aria-pressed", String(Boolean(module.settingsLocked)));
    settingsLockButton.setAttribute("aria-label", module.settingsLocked ? "Unlock module parameters" : "Lock module parameters");
    settingsLockButton.title = module.settingsLocked ? "Unlock module parameters" : "Lock module parameters";
    controlLockButton.setAttribute("aria-pressed", String(Boolean(module.controlLocked)));
    controlLockButton.setAttribute("aria-label", module.controlLocked ? "Unlock live control" : "Lock live control");
    controlLockButton.title = module.controlLocked ? "Unlock live control" : "Lock live control";

    title.readOnly = Boolean(module.settingsLocked);
    card.querySelectorAll(".address-label input, .module-settings input, .module-settings select, .value-name-grid input, .pair-name-grid input").forEach((control) => {
      control.disabled = Boolean(module.settingsLocked);
    });
    card.querySelectorAll(".osc-slider, .direct-value, .button-module-action, .coordinate-readout input").forEach((control) => {
      control.disabled = Boolean(module.controlLocked);
    });
    const pad = card.querySelector(".xy-pad");
    if (pad) {
      pad.setAttribute("aria-disabled", String(Boolean(module.controlLocked)));
      pad.tabIndex = module.controlLocked ? -1 : 0;
    }
    card.querySelectorAll(".preset-row button").forEach((control) => {
      control.disabled = Boolean(module.settingsLocked || module.controlLocked);
    });
  }
  card.applyModulePresentation = applyModulePresentation;

  title.addEventListener("input", () => {
    module.title = title.value;
    renderDevices();
    scheduleSave();
  });
  address.addEventListener("change", () => {
    module.address = normalizedAddress(address.value);
    address.value = module.address;
    address.classList.toggle("invalid", !validAddress(module.address));
    scheduleSave();
    renderDevices();
    card.dispatchEvent(new CustomEvent("addresschange"));
  });
  collapseButton.addEventListener("click", () => {
    module.collapsed = !module.collapsed;
    applyModulePresentation();
    scheduleModuleLayout();
    scheduleSave(0);
  });
  settingsLockButton.addEventListener("click", () => {
    module.settingsLocked = !module.settingsLocked;
    applyModulePresentation();
    scheduleSave(0);
  });
  controlLockButton.addEventListener("click", () => {
    module.controlLocked = !module.controlLocked;
    applyModulePresentation();
    scheduleSave(0);
  });
  lockButton.addEventListener("click", () => {
    module.locked = !module.locked;
    applyModulePresentation();
    scheduleSave(0);
  });
  dragHandle.addEventListener("dragstart", (event) => {
    if (module.locked) {
      event.preventDefault();
      return;
    }
    draggedModuleId = module.id;
    card.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", module.id);
  });
  dragHandle.addEventListener("dragend", () => {
    draggedModuleId = null;
    card.classList.remove("is-dragging");
    modulesContainer.querySelectorAll(".drop-before, .drop-after").forEach((item) => item.classList.remove("drop-before", "drop-after"));
  });
  card.querySelector(".delete-button").addEventListener("click", () => {
    if (!deletionUnlocked) return;
    if (!window.confirm(`Delete “${module.title}”?`)) return;
    state.modules = state.modules.filter((item) => item.id !== module.id);
    renderModules();
    scheduleSave(0);
  });
  applyModulePresentation();
  return card;
}

modulesContainer.addEventListener("dragover", (event) => {
  if (!draggedModuleId) return;
  const target = event.target.closest(".module-card");
  if (!target || target.dataset.moduleId === draggedModuleId) return;
  event.preventDefault();
  const bounds = target.getBoundingClientRect();
  const nearSameRow = Math.abs(event.clientY - (bounds.top + bounds.height / 2)) < bounds.height * 0.35;
  const after = nearSameRow
    ? event.clientX > bounds.left + bounds.width / 2
    : event.clientY > bounds.top + bounds.height / 2;
  modulesContainer.querySelectorAll(".drop-before, .drop-after").forEach((item) => item.classList.remove("drop-before", "drop-after"));
  target.classList.add(after ? "drop-after" : "drop-before");
  event.dataTransfer.dropEffect = "move";
});

modulesContainer.addEventListener("drop", (event) => {
  if (!draggedModuleId) return;
  const target = event.target.closest(".module-card");
  if (!target || target.dataset.moduleId === draggedModuleId) return;
  event.preventDefault();
  const sourceIndex = state.modules.findIndex((module) => module.id === draggedModuleId);
  const source = state.modules[sourceIndex];
  if (!source || source.locked) return;
  const after = target.classList.contains("drop-after");
  state.modules.splice(sourceIndex, 1);
  const targetIndex = state.modules.findIndex((module) => module.id === target.dataset.moduleId);
  state.modules.splice(targetIndex + (after ? 1 : 0), 0, source);
  draggedModuleId = null;
  renderModules();
  applyDeletionLock();
  scheduleSave(0);
});

function renderSlider(module) {
  const card = createBaseCard(module);
  card.insertAdjacentHTML("beforeend", `
    <div class="module-settings slider-settings">
      <label><span>OSC type</span><select class="osc-type"><option value="f">Float</option><option value="i">Integer</option></select></label>
      <label><span>Range min</span><input class="range-min" type="number" step="any" /></label>
      <label><span>Range max</span><input class="range-max" type="number" step="any" /></label>
      <label><span>Step</span><input class="range-step" type="number" min="0.000001" step="any" /></label>
    </div>
    <div class="slider-value"><span>Current value</span><input class="direct-value" type="number" step="any" /></div>
    <input class="osc-slider" type="range" />
    <div class="range-labels"><span class="lower-label"></span><span class="upper-label"></span></div>
  `);
  const type = card.querySelector(".osc-type");
  const minimum = card.querySelector(".range-min");
  const maximum = card.querySelector(".range-max");
  const step = card.querySelector(".range-step");
  const direct = card.querySelector(".direct-value");
  const slider = card.querySelector(".osc-slider");
  type.value = module.oscType;
  minimum.value = module.min;
  maximum.value = module.max;
  step.value = module.step;

  function displayValue() {
    const value = module.oscType === "i" ? Math.round(module.value) : Number(module.value);
    direct.value = value;
    direct.step = module.oscType === "i" ? "1" : String(module.step);
    slider.value = String(module.value);
    card.querySelector(".lower-label").textContent = module.min;
    card.querySelector(".upper-label").textContent = module.max;
  }

  function syncRange() {
    slider.min = String(module.min);
    slider.max = String(module.max);
    slider.step = String(module.oscType === "i" ? Math.max(1, Math.round(module.step)) : module.step);
    module.value = Math.max(module.min, Math.min(module.max, Number(module.value)));
    displayValue();
  }

  function updateSettings() {
    const nextMin = Number(minimum.value);
    const nextMax = Number(maximum.value);
    const nextStep = Number(step.value);
    const valid = Number.isFinite(nextMin) && Number.isFinite(nextMax) && nextMax > nextMin && Number.isFinite(nextStep) && nextStep > 0;
    [minimum, maximum, step].forEach((input) => input.classList.toggle("invalid", !valid));
    if (!valid) return;
    module.oscType = type.value;
    module.min = nextMin;
    module.max = nextMax;
    module.step = nextStep;
    syncRange();
    scheduleSave();
  }

  [type, minimum, maximum, step].forEach((control) => control.addEventListener("change", updateSettings));
  slider.addEventListener("input", () => {
    module.value = Number(slider.value);
    displayValue();
    sendValue(module.address, module.oscType, module.value);
    scheduleSave();
  });
  direct.addEventListener("change", () => {
    const next = Number(direct.value);
    if (!Number.isFinite(next)) return;
    module.value = Math.max(module.min, Math.min(module.max, next));
    displayValue();
    sendValue(module.address, module.oscType, module.value);
    scheduleSave();
  });
  syncRange();
  card.applyModulePresentation();
  return card;
}

function renderButton(module) {
  const card = createBaseCard(module);
  const valueFields = module.type === "toggle"
    ? `<label><span>Off value</span><input class="off-value" type="number" step="any" /></label><label><span>On value</span><input class="on-value" type="number" step="any" /></label>`
    : `<label><span>Send value</span><input class="on-value" type="number" step="any" /></label>`;
  card.insertAdjacentHTML("beforeend", `
    <div class="module-settings button-settings">
      <label><span>OSC type</span><select class="osc-type"><option value="f">Float</option><option value="i">Integer</option></select></label>
      ${valueFields}
    </div>
    <button class="button-module-action" type="button" aria-pressed="false"><span class="action-symbol"></span><span class="action-label"></span></button>
  `);
  const type = card.querySelector(".osc-type");
  const onValue = card.querySelector(".on-value");
  const offValue = card.querySelector(".off-value");
  const action = card.querySelector(".button-module-action");
  type.value = module.oscType;
  onValue.value = module.onValue;
  if (offValue) offValue.value = module.offValue;

  function updateButton() {
    action.setAttribute("aria-pressed", String(module.type === "toggle" && module.active));
    action.querySelector(".action-symbol").textContent = module.type === "toggle" ? (module.active ? "●" : "○") : "●";
    action.querySelector(".action-label").textContent = module.type === "toggle" ? (module.active ? `${module.title} on` : `${module.title} off`) : `Send ${module.title}`;
  }

  [type, onValue, ...(offValue ? [offValue] : [])].forEach((control) => control.addEventListener("change", () => {
    module.oscType = type.value;
    module.onValue = Number(onValue.value);
    if (offValue) module.offValue = Number(offValue.value);
    scheduleSave();
  }));
  action.addEventListener("click", () => {
    if (module.type === "toggle") module.active = !module.active;
    const value = module.type === "toggle" && !module.active ? module.offValue : module.onValue;
    sendValue(module.address, module.oscType, value);
    updateButton();
    scheduleSave();
  });
  card.querySelector(".module-title").addEventListener("input", updateButton);
  updateButton();
  card.applyModulePresentation();
  return card;
}

function renderXY(module) {
  const pointCount = module.type === "xy2" ? 2 : 1;
  const valueCount = pointCount * 2;
  const card = createBaseCard(module, "xy-module");
  card.querySelector(".address-label > span").textContent = "Base OSC address";
  const outputOptions = pointCount === 1
    ? '<option value="together">Together</option><option value="individual">Individual values</option>'
    : '<option value="together">All together</option><option value="paired">Paired points</option><option value="individual">Individual values</option>';
  card.insertAdjacentHTML("beforeend", `
    <div class="module-settings xy-settings">
      <label><span>OSC type</span><select class="osc-type"><option value="f">Float</option><option value="i">Integer</option></select></label>
      <label><span>Scale min</span><input class="scale-min" type="number" step="any" /></label>
      <label><span>Scale max</span><input class="scale-max" type="number" step="any" /></label>
      <label><span>Output</span><select class="output-mode">${outputOptions}</select></label>
    </div>
    <div class="value-name-grid ${valueCount === 2 ? "two-values" : ""}"></div>
    ${pointCount === 2 ? '<div class="pair-name-grid"></div>' : ""}
    <div class="coordinate-readout"></div>
    <div class="xy-pad" tabindex="0" aria-label="XY pad">
      <span class="axis-label axis-y">Y</span><span class="axis-label axis-x">X</span>
    </div>
    <p class="packet-preview"></p>
    <div class="preset-row">
      <span class="preset-label">Position presets</span>
      <button class="store-button" type="button" aria-pressed="false">Store</button>
      <button class="preset-button" data-preset="0" type="button">P1</button>
      <button class="preset-button" data-preset="1" type="button">P2</button>
      <button class="preset-button" data-preset="2" type="button">P3</button>
      <button class="preset-button" data-preset="3" type="button">P4</button>
    </div>
  `);

  const type = card.querySelector(".osc-type");
  const minimum = card.querySelector(".scale-min");
  const maximum = card.querySelector(".scale-max");
  const mode = card.querySelector(".output-mode");
  const pad = card.querySelector(".xy-pad");
  const readout = card.querySelector(".coordinate-readout");
  const preview = card.querySelector(".packet-preview");
  const namesGrid = card.querySelector(".value-name-grid");
  const pairGrid = card.querySelector(".pair-name-grid");
  const storeButton = card.querySelector(".store-button");
  const activePointers = new Map();
  let sendFrame = null;
  let storeArmed = false;
  type.value = module.oscType;
  minimum.value = module.scaleMin;
  maximum.value = module.scaleMax;
  mode.value = module.outputMode;

  const handles = module.points.map((_, index) => {
    const handle = document.createElement("span");
    handle.className = `pad-handle handle-${index === 0 ? "a" : "b"}`;
    handle.innerHTML = `<i>${index === 0 ? "A" : "B"}</i>`;
    pad.append(handle);
    return handle;
  });

  module.valueNames.forEach((name, index) => {
    const label = document.createElement("label");
    label.innerHTML = `<span>Value ${index + 1} name</span><input />`;
    const input = label.querySelector("input");
    input.value = name;
    input.addEventListener("change", () => {
      module.valueNames[index] = input.value.trim() || `value${index + 1}`;
      input.value = module.valueNames[index];
      renderPad();
      scheduleSave();
    });
    namesGrid.append(label);
  });

  if (pairGrid) {
    module.pairNames.forEach((name, index) => {
      const label = document.createElement("label");
      label.innerHTML = `<span>Point ${index === 0 ? "A" : "B"} pair name</span><input />`;
      const input = label.querySelector("input");
      input.value = name;
      input.addEventListener("change", () => {
        module.pairNames[index] = input.value.trim() || (index === 0 ? "a" : "b");
        input.value = module.pairNames[index];
        renderPad();
        scheduleSave();
      });
      pairGrid.append(label);
    });
  }

  const valueInputs = module.valueNames.map((name, index) => {
    const label = document.createElement("label");
    label.innerHTML = `<span></span><input type="number" step="any" />`;
    readout.append(label);
    const input = label.querySelector("input");
    input.addEventListener("change", () => {
      const outputValue = Number(input.value);
      const span = module.scaleMax - module.scaleMin;
      if (!Number.isFinite(outputValue) || span === 0) return;
      const normalized = Math.max(0, Math.min(1, (outputValue - module.scaleMin) / span));
      const pointIndex = Math.floor(index / 2);
      const axisIndex = index % 2;
      module.points[pointIndex][axisIndex] = normalized;
      renderPad();
      sendXY();
      scheduleSave();
    });
    return { label: label.querySelector("span"), input };
  });

  function scaledValue(normalized) {
    const scaled = module.scaleMin + normalized * (module.scaleMax - module.scaleMin);
    return module.oscType === "i" ? Math.round(scaled) : scaled;
  }

  function outputValues() {
    return module.points.flatMap(([x, y]) => [scaledValue(x), scaledValue(y)]);
  }

  function formatted(value) {
    return module.oscType === "i" ? String(value) : Number(value).toFixed(3);
  }

  function updatePreview() {
    const base = normalizedAddress(module.address);
    if (module.outputMode === "together") {
      preview.textContent = `${base} → [ ${module.valueNames.join(", ")} ]`;
    } else if (module.outputMode === "paired" && pointCount === 2) {
      preview.textContent = `${addressWithSuffix(base, module.pairNames[0])} + ${addressWithSuffix(base, module.pairNames[1])}`;
    } else {
      preview.textContent = module.valueNames.map((name) => addressWithSuffix(base, name)).join(" · ");
    }
  }

  function updatePresets() {
    card.querySelectorAll(".preset-button").forEach((button) => {
      const index = Number(button.dataset.preset);
      button.classList.toggle("has-value", Boolean(module.presets[index]));
      button.title = module.presets[index] ? `Recall preset ${index + 1}` : `Preset ${index + 1} is empty`;
    });
    storeButton.setAttribute("aria-pressed", String(storeArmed));
  }

  function renderPad() {
    const values = outputValues();
    module.points.forEach(([x, y], index) => {
      handles[index].style.left = `${x * 100}%`;
      handles[index].style.top = `${(1 - y) * 100}%`;
    });
    valueInputs.forEach(({ label, input }, index) => {
      label.textContent = module.valueNames[index];
      input.value = formatted(values[index]);
      input.step = module.oscType === "i" ? "1" : "any";
    });
    updatePreview();
    updatePresets();
  }

  function sendXY() {
    const values = outputValues();
    const args = values.map((value) => ({ type: module.oscType, value }));
    const summary = `[ ${values.map(formatted).join(", ")} ]`;
    if (module.outputMode === "together") {
      sendPacket(module.address, args, summary);
    } else if (module.outputMode === "paired" && pointCount === 2) {
      sendPacket(addressWithSuffix(module.address, module.pairNames[0]), args.slice(0, 2), `[ ${values.slice(0, 2).map(formatted).join(", ")} ]`);
      sendPacket(addressWithSuffix(module.address, module.pairNames[1]), args.slice(2), `[ ${values.slice(2).map(formatted).join(", ")} ]`);
    } else {
      args.forEach((argument, index) => sendPacket(addressWithSuffix(module.address, module.valueNames[index]), [argument], formatted(values[index])));
    }
  }

  function queueSend() {
    if (sendFrame) return;
    sendFrame = requestAnimationFrame(() => {
      sendXY();
      sendFrame = null;
    });
  }

  function updateFromPointer(index, event) {
    const bounds = pad.getBoundingClientRect();
    module.points[index][0] = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    module.points[index][1] = Math.max(0, Math.min(1, 1 - (event.clientY - bounds.top) / bounds.height));
    renderPad();
    queueSend();
    scheduleSave();
  }

  function choosePoint(event) {
    if (pointCount === 1) return 0;
    const bounds = pad.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width;
    const y = 1 - (event.clientY - bounds.top) / bounds.height;
    const occupied = [...activePointers.values()];
    const available = module.points.map((_, index) => index).filter((index) => !occupied.includes(index));
    return available.reduce((best, index) => {
      const distance = (module.points[index][0] - x) ** 2 + (module.points[index][1] - y) ** 2;
      return distance < best.distance ? { index, distance } : best;
    }, { index: available[0] ?? 0, distance: Infinity }).index;
  }

  pad.addEventListener("pointerdown", (event) => {
    if (module.controlLocked) return;
    event.preventDefault();
    const pointIndex = choosePoint(event);
    activePointers.set(event.pointerId, pointIndex);
    pad.setPointerCapture(event.pointerId);
    updateFromPointer(pointIndex, event);
  });
  pad.addEventListener("pointermove", (event) => {
    if (module.controlLocked) return;
    const pointIndex = activePointers.get(event.pointerId);
    if (pointIndex !== undefined) updateFromPointer(pointIndex, event);
  });
  function releasePointer(event) {
    if (!activePointers.has(event.pointerId)) return;
    activePointers.delete(event.pointerId);
    if (sendFrame) cancelAnimationFrame(sendFrame);
    sendFrame = null;
    sendXY();
  }
  pad.addEventListener("pointerup", releasePointer);
  pad.addEventListener("pointercancel", releasePointer);
  pad.addEventListener("keydown", (event) => {
    if (module.controlLocked) return;
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const index = event.shiftKey && pointCount > 1 ? 1 : 0;
    const step = event.altKey ? 0.001 : 0.01;
    if (event.key === "ArrowLeft") module.points[index][0] = Math.max(0, module.points[index][0] - step);
    if (event.key === "ArrowRight") module.points[index][0] = Math.min(1, module.points[index][0] + step);
    if (event.key === "ArrowDown") module.points[index][1] = Math.max(0, module.points[index][1] - step);
    if (event.key === "ArrowUp") module.points[index][1] = Math.min(1, module.points[index][1] + step);
    renderPad();
    sendXY();
    scheduleSave();
  });

  [type, minimum, maximum, mode].forEach((control) => control.addEventListener("change", () => {
    const nextMin = Number(minimum.value);
    const nextMax = Number(maximum.value);
    if (!Number.isFinite(nextMin) || !Number.isFinite(nextMax) || nextMin === nextMax) {
      minimum.classList.add("invalid");
      maximum.classList.add("invalid");
      return;
    }
    minimum.classList.remove("invalid");
    maximum.classList.remove("invalid");
    module.oscType = type.value;
    module.scaleMin = nextMin;
    module.scaleMax = nextMax;
    module.outputMode = mode.value;
    renderPad();
    scheduleSave();
  }));
  card.addEventListener("addresschange", updatePreview);
  storeButton.addEventListener("click", () => {
    storeArmed = !storeArmed;
    updatePresets();
  });
  card.querySelectorAll(".preset-button").forEach((button) => button.addEventListener("click", () => {
    const index = Number(button.dataset.preset);
    if (storeArmed) {
      module.presets[index] = module.points.map((point) => [...point]);
      storeArmed = false;
      addLog("stored", module.title, `preset P${index + 1}`);
      scheduleSave(0);
      updatePresets();
      return;
    }
    if (!module.presets[index]) {
      addLog("empty", module.title, `preset P${index + 1}`);
      return;
    }
    module.points = module.presets[index].map((point) => [...point]);
    renderPad();
    sendXY();
    scheduleSave();
  }));
  renderPad();
  card.applyModulePresentation();
  return card;
}

function renderModules() {
  moduleResizeObserver.disconnect();
  modulesContainer.replaceChildren();
  if (!state.modules.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No modules yet. Add one above.";
    modulesContainer.append(empty);
    renderDevices();
    scheduleModuleLayout();
    return;
  }
  state.modules.forEach((module) => {
    const card = module.type === "slider"
      ? renderSlider(module)
      : module.type === "xy1" || module.type === "xy2"
        ? renderXY(module)
        : renderButton(module);
    modulesContainer.append(card);
    moduleResizeObserver.observe(card);
  });
  renderDevices();
  scheduleModuleLayout();
}

function renderCustomSends() {
  customContainer.replaceChildren();
  if (!state.customSends.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No custom sends. Use the plus button to add one.";
    customContainer.append(empty);
    renderDevices();
    return;
  }
  state.customSends.forEach((custom) => {
    const card = document.createElement("article");
    card.className = "custom-card panel";
    card.innerHTML = `
      <label><span>Title</span><input class="module-title" /></label>
      <label><span>OSC address</span><input class="custom-address" spellcheck="false" /></label>
      <label><span>Type</span><select class="custom-type"><option value="f">Float</option><option value="i">Integer</option><option value="s">String</option></select></label>
      <label><span>Value</span><input class="custom-value" /></label>
      <button class="primary-button custom-send-button" type="button">Send</button>
      <button class="delete-button" type="button" aria-label="Delete custom send">×</button>
    `;
    const title = card.querySelector(".module-title");
    const address = card.querySelector(".custom-address");
    const type = card.querySelector(".custom-type");
    const value = card.querySelector(".custom-value");
    title.value = custom.title;
    title.readOnly = false;
    address.value = custom.address;
    type.value = custom.oscType;
    value.value = custom.value;
    title.addEventListener("input", () => { custom.title = title.value; renderDevices(); scheduleSave(); });
    address.addEventListener("change", () => { custom.address = normalizedAddress(address.value); address.value = custom.address; renderDevices(); scheduleSave(); });
    type.addEventListener("change", () => { custom.oscType = type.value; scheduleSave(); });
    value.addEventListener("change", () => { custom.value = value.value; scheduleSave(); });
    card.querySelector(".custom-send-button").addEventListener("click", () => sendValue(custom.address, custom.oscType, custom.value));
    card.querySelector(".delete-button").addEventListener("click", () => {
      if (!deletionUnlocked || !window.confirm(`Delete “${custom.title}”?`)) return;
      state.customSends = state.customSends.filter((item) => item.id !== custom.id);
      renderCustomSends();
      scheduleSave(0);
    });
    customContainer.append(card);
  });
  renderDevices();
}

function applyDeletionLock() {
  document.body.classList.toggle("delete-unlocked", deletionUnlocked);
  titleLockButton.setAttribute("aria-pressed", String(deletionUnlocked));
  lockIcon.textContent = deletionUnlocked ? "🔓" : "🔒";
  lockLabel.textContent = deletionUnlocked ? "Deletion unlocked" : "Deletion locked";
  titleLockButton.title = deletionUnlocked ? "Lock deletion" : "Unlock deletion";
  document.querySelectorAll(".module-card").forEach((card) => card.applyModulePresentation?.());
  document.querySelectorAll(".custom-card .module-title").forEach((input) => { input.readOnly = false; });
}

function applyZoom() {
  document.documentElement.style.zoom = document.body.classList.contains("output-only") ? "1" : String(state.zoom);
  zoomValue.value = `${Math.round(state.zoom * 100)}%`;
}

function applyLogVisibility() {
  document.body.classList.toggle("log-hidden", !state.logVisible);
  logToggleButton.textContent = state.logVisible ? "Hide side" : "Show side";
  logToggleButton.setAttribute("aria-pressed", String(state.logVisible));
}

function initializeVideoModules() {
  const container = document.querySelector("#videoControls");
  if (!container) return;
  const moduleMap = new Map(state.videoModules.map((module) => [module.id, module]));
  state.videoModules.forEach((module) => {
    const card = container.querySelector(`[data-video-module-id="${module.id}"]`);
    if (card) container.append(card);
  });

  container.querySelectorAll(".video-control-panel").forEach((card) => {
    const module = moduleMap.get(card.dataset.videoModuleId);
    if (!module) return;
    const header = card.querySelector(".video-module-header");
    header.className = "module-heading video-module-heading";
    header.innerHTML = `
      <div class="move-tools">
        <button class="drag-handle" type="button" aria-label="Drag to move video module" title="Drag to move video module"><span aria-hidden="true">⠿</span></button>
        <button class="module-lock-button" type="button" aria-label="Lock module position" title="Lock module position">
          <svg class="unlocked-icon" aria-hidden="true" viewBox="0 0 16 16"><path d="M5.25 7V5.25a2.75 2.75 0 0 1 5.17-1.3M3.5 7.25h9v6h-9z" /></svg>
          <svg class="locked-icon" aria-hidden="true" viewBox="0 0 16 16"><path d="M5.25 7V5.25a2.75 2.75 0 0 1 5.5 0V7M3.5 7.25h9v6h-9z" /></svg>
        </button>
      </div>
      <div class="module-title-wrap"><input class="module-title" aria-label="Video module title" /><span class="module-type"></span></div>
      <div class="module-tools">
        <button class="settings-lock-button red-lock-button" type="button" aria-label="Lock module parameters" title="Lock module parameters"><span class="lock-letter" aria-hidden="true">P</span><svg aria-hidden="true" viewBox="0 0 16 16"><path d="M5.25 7V5.25a2.75 2.75 0 0 1 5.5 0V7M3.5 7.25h9v6h-9z" /></svg></button>
        <button class="control-lock-button red-lock-button" type="button" aria-label="Lock live control" title="Lock live control"><span class="lock-letter" aria-hidden="true">C</span><svg aria-hidden="true" viewBox="0 0 16 16"><path d="M5.25 7V5.25a2.75 2.75 0 0 1 5.5 0V7M3.5 7.25h9v6h-9z" /></svg></button>
        <button class="collapse-button" type="button" aria-label="Collapse module" title="Collapse module"><svg aria-hidden="true" viewBox="0 0 16 16"><path d="m3.5 10 4.5-4 4.5 4" /></svg></button>
      </div>`;
    const title = header.querySelector(".module-title");
    const dragHandle = header.querySelector(".drag-handle");
    const positionLock = header.querySelector(".module-lock-button");
    const settingsLock = header.querySelector(".settings-lock-button");
    const controlLock = header.querySelector(".control-lock-button");
    const collapse = header.querySelector(".collapse-button");
    title.value = module.title;
    header.querySelector(".module-type").textContent = module.type;

    const setDisabled = (selector, disabled) => {
      card.querySelectorAll(selector).forEach((root) => {
        if (root.matches("input, select, textarea, button")) root.disabled = disabled;
        root.querySelectorAll?.("input, select, textarea, button").forEach((control) => { control.disabled = disabled; });
        if (root.matches("[tabindex]")) root.tabIndex = disabled ? -1 : 0;
        root.setAttribute?.("aria-disabled", String(disabled));
      });
    };
    const applyPresentation = () => {
      card.classList.toggle("is-locked", Boolean(module.locked));
      card.classList.toggle("is-settings-locked", Boolean(module.settingsLocked));
      card.classList.toggle("is-control-locked", Boolean(module.controlLocked));
      card.classList.toggle("is-all-locked", Boolean(module.locked && module.settingsLocked && module.controlLocked));
      card.classList.toggle("is-collapsed", Boolean(module.collapsed));
      title.readOnly = Boolean(module.settingsLocked);
      dragHandle.draggable = !module.locked;
      dragHandle.disabled = Boolean(module.locked);
      positionLock.setAttribute("aria-pressed", String(Boolean(module.locked)));
      settingsLock.setAttribute("aria-pressed", String(Boolean(module.settingsLocked)));
      controlLock.setAttribute("aria-pressed", String(Boolean(module.controlLocked)));
      collapse.setAttribute("aria-expanded", String(!module.collapsed));
      collapse.setAttribute("aria-label", module.collapsed ? "Expand module" : "Collapse module");
      setDisabled(".video-settings", Boolean(module.settingsLocked));
      setDisabled(".video-live-control", Boolean(module.controlLocked));
      scheduleVideoLayout();
    };
    title.addEventListener("input", () => { module.title = title.value; scheduleSave(); });
    positionLock.addEventListener("click", () => { module.locked = !module.locked; applyPresentation(); scheduleSave(0); });
    settingsLock.addEventListener("click", () => { module.settingsLocked = !module.settingsLocked; applyPresentation(); scheduleSave(0); });
    controlLock.addEventListener("click", () => { module.controlLocked = !module.controlLocked; applyPresentation(); scheduleSave(0); });
    collapse.addEventListener("click", () => { module.collapsed = !module.collapsed; applyPresentation(); scheduleSave(0); });
    dragHandle.addEventListener("dragstart", (event) => {
      if (module.locked) return event.preventDefault();
      draggedVideoModuleId = module.id;
      card.classList.add("is-dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", module.id);
    });
    dragHandle.addEventListener("dragend", () => {
      draggedVideoModuleId = null;
      card.classList.remove("is-dragging");
      container.querySelectorAll(".drop-before, .drop-after").forEach((item) => item.classList.remove("drop-before", "drop-after"));
    });
    card.applyModulePresentation = applyPresentation;
    applyPresentation();
    videoResizeObserver.observe(card);
  });

  container.addEventListener("dragover", (event) => {
    if (!draggedVideoModuleId) return;
    const target = event.target.closest(".video-control-panel");
    if (!target || target.dataset.videoModuleId === draggedVideoModuleId) return;
    event.preventDefault();
    const bounds = target.getBoundingClientRect();
    const after = event.clientY > bounds.top + bounds.height / 2;
    container.querySelectorAll(".drop-before, .drop-after").forEach((item) => item.classList.remove("drop-before", "drop-after"));
    target.classList.add(after ? "drop-after" : "drop-before");
  });
  container.addEventListener("drop", (event) => {
    if (!draggedVideoModuleId) return;
    const target = event.target.closest(".video-control-panel");
    if (!target || target.dataset.videoModuleId === draggedVideoModuleId) return;
    event.preventDefault();
    const sourceIndex = state.videoModules.findIndex((module) => module.id === draggedVideoModuleId);
    const source = state.videoModules[sourceIndex];
    if (!source || source.locked) return;
    const after = target.classList.contains("drop-after");
    state.videoModules.splice(sourceIndex, 1);
    const targetIndex = state.videoModules.findIndex((module) => module.id === target.dataset.videoModuleId);
    state.videoModules.splice(targetIndex + (after ? 1 : 0), 0, source);
    const targetCard = target;
    targetCard.classList.remove("drop-before", "drop-after");
    if (after) targetCard.after(cardForVideoModule(source.id));
    else targetCard.before(cardForVideoModule(source.id));
    draggedVideoModuleId = null;
    scheduleVideoLayout();
    scheduleSave(0);
  });
  function cardForVideoModule(id) { return container.querySelector(`[data-video-module-id="${id}"]`); }
  scheduleVideoLayout();
}

function setActiveTab(tabName, save = true) {
  const nextTab = tabName === "video" ? "video" : "sliders";
  state.activeTab = nextTab;
  document.querySelectorAll(".tab-button").forEach((button) => {
    const active = button.dataset.tab === nextTab;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    const active = panel.dataset.panel === nextTab;
    panel.classList.toggle("active", active);
    panel.hidden = !active;
  });
  if (nextTab === "video") scheduleVideoLayout();
  if (save) scheduleSave();
}

function hexColor(value) {
  const match = /^#([0-9a-f]{6})$/i.exec(value || "");
  if (!match) return [0, 0, 0, 1];
  const number = Number.parseInt(match[1], 16);
  return [((number >> 16) & 255) / 255, ((number >> 8) & 255) / 255, (number & 255) / 255, 1];
}

function initializeVideo() {
  const videoState = state.video;
  const canvas = document.querySelector("#videoCanvas");
  const outputContext = canvas.getContext("2d", { alpha: false });
  const renderCanvas = document.createElement("canvas");
  const gl = renderCanvas.getContext("webgl2", { alpha: false, antialias: true, preserveDrawingBuffer: true });
  const status = document.querySelector("#webglStatus");
  if (!gl) {
    status.textContent = "WebGL2 unavailable";
    status.classList.add("error");
    return;
  }
  status.textContent = "WebGL2 ready";
  status.classList.add("ready");

  const vertexSource = `#version 300 es
    in vec2 a_position;
    out vec2 v_uv;
    void main() {
      v_uv = a_position * 0.5 + 0.5;
      gl_Position = vec4(a_position, 0.0, 1.0);
    }
  `;
  const fragmentSource = `#version 300 es
    precision highp float;
    in vec2 v_uv;
    out vec4 out_color;
    uniform sampler2D u_texture;
    uniform int u_mode;
    uniform vec2 u_resolution;
    uniform float u_checker_size;
    uniform vec4 u_color_a;
    uniform vec4 u_color_b;
    uniform vec4 u_solid_color;
    uniform vec2 u_tile;
    uniform vec2 u_stretch;
    uniform vec2 u_cross;
    uniform float u_cross_size;
    uniform float u_point_size;
    uniform vec4 u_overlay_color;
    uniform bool u_show_overlay;

    vec4 test_card(vec2 uv, vec2 pixel) {
      vec3 colour;
      if (uv.y > 0.33) {
        float band = floor(uv.x * 7.0);
        if (band < 1.0) colour = vec3(1.0, 1.0, 1.0);
        else if (band < 2.0) colour = vec3(1.0, 1.0, 0.0);
        else if (band < 3.0) colour = vec3(0.0, 1.0, 1.0);
        else if (band < 4.0) colour = vec3(0.0, 1.0, 0.0);
        else if (band < 5.0) colour = vec3(1.0, 0.0, 1.0);
        else if (band < 6.0) colour = vec3(1.0, 0.0, 0.0);
        else colour = vec3(0.0, 0.0, 1.0);
      } else {
        float steps = floor(uv.x * 12.0) / 11.0;
        colour = vec3(steps);
      }
      vec2 grid = abs(fract(pixel / 100.0) - 0.5);
      float grid_line = step(0.485, max(grid.x, grid.y));
      colour = mix(colour, vec3(0.25), grid_line * 0.35);
      float frame = step(0.015, uv.x) * step(0.015, uv.y) * step(uv.x, 0.985) * step(uv.y, 0.985);
      return vec4(mix(vec3(0.0), colour, frame), 1.0);
    }

    void main() {
      vec2 tile_uv = fract(v_uv * max(u_tile, vec2(1.0)));
      vec2 source_uv = clamp((tile_uv - 0.5) / max(u_stretch, vec2(0.01)) + 0.5, 0.0, 1.0);
      vec2 pixel = source_uv * u_resolution;
      vec4 colour;
      if (u_mode == 1) {
        colour = texture(u_texture, source_uv);
      } else if (u_mode == 2) {
        float checker = mod(floor(pixel.x / u_checker_size) + floor(pixel.y / u_checker_size), 2.0);
        colour = mix(u_color_a, u_color_b, checker);
      } else if (u_mode == 3) {
        colour = test_card(source_uv, pixel);
      } else {
        colour = u_solid_color;
      }

      if (u_show_overlay) {
        vec2 centre = u_cross * u_resolution;
        vec2 delta = abs(pixel - centre);
        float thickness = max(1.5, min(u_resolution.x, u_resolution.y) / 900.0);
        float horizontal = (1.0 - step(thickness, delta.y)) * (1.0 - step(u_cross_size, delta.x));
        float vertical = (1.0 - step(thickness, delta.x)) * (1.0 - step(u_cross_size, delta.y));
        float point = 1.0 - smoothstep(u_point_size, u_point_size + thickness, length(pixel - centre));
        float overlay = max(max(horizontal, vertical), point);
        colour = mix(colour, u_overlay_color, overlay);
      }
      out_color = vec4(colour.rgb, 1.0);
    }
  `;

  function compileShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  }

  let program;
  try {
    program = gl.createProgram();
    gl.attachShader(program, compileShader(gl.VERTEX_SHADER, vertexSource));
    gl.attachShader(program, compileShader(gl.FRAGMENT_SHADER, fragmentSource));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  } catch (error) {
    status.textContent = "Shader error";
    status.classList.remove("ready");
    status.classList.add("error");
    addLog("error", "WebGL", error.message);
    return;
  }

  const positions = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positions);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const positionLocation = gl.getAttribLocation(program, "a_position");
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

  const uniforms = {};
  ["u_texture", "u_mode", "u_resolution", "u_checker_size", "u_color_a", "u_color_b", "u_solid_color", "u_tile", "u_stretch", "u_cross", "u_cross_size", "u_point_size", "u_overlay_color", "u_show_overlay"].forEach((name) => {
    uniforms[name] = gl.getUniformLocation(program, name);
  });

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

  const widthInput = document.querySelector("#outputWidth");
  const heightInput = document.querySelector("#outputHeight");
  const resolutionBadge = document.querySelector("#resolutionBadge");
  const sourceSelect = document.querySelector("#videoSourceSelect");
  const video = document.querySelector("#videoElement");
  const timeline = document.querySelector("#videoTimeline");
  const playButton = document.querySelector("#videoPlayButton");
  const loopInput = document.querySelector("#videoLoop");
  const mediaStatus = document.querySelector("#mediaStatus");
  const checkerSize = document.querySelector("#checkerSize");
  const checkerColorA = document.querySelector("#checkerColorA");
  const checkerColorB = document.querySelector("#checkerColorB");
  const solidColor = document.querySelector("#solidColor");
  const generatorText = document.querySelector("#generatorText");
  const generatorTextSize = document.querySelector("#generatorTextSize");
  const generatorTextColor = document.querySelector("#generatorTextColor");
  const generatorTextBackground = document.querySelector("#generatorTextBackground");
  const generatorTextOverlay = document.querySelector("#generatorTextOverlay");
  const generatorTextBox = document.querySelector("#generatorTextBox");
  const generatorTextX = document.querySelector("#generatorTextX");
  const generatorTextY = document.querySelector("#generatorTextY");
  const tileX = document.querySelector("#videoTileX");
  const tileY = document.querySelector("#videoTileY");
  const stretchX = document.querySelector("#videoStretchX");
  const stretchY = document.querySelector("#videoStretchY");
  const drawingCanvas = document.querySelector("#drawingCanvas");
  const drawingContext = drawingCanvas.getContext("2d");
  const brushSize = document.querySelector("#brushSize");
  const brushColor = document.querySelector("#brushColor");
  const xyPad = document.querySelector("#videoXYPad");
  const xyHandle = document.querySelector("#videoXYHandle");
  const crossX = document.querySelector("#videoCrossX");
  const crossY = document.querySelector("#videoCrossY");
  const crossSize = document.querySelector("#videoCrossSize");
  const pointSize = document.querySelector("#videoPointSize");
  const overlayColor = document.querySelector("#videoOverlayColor");
  const overlayVisible = document.querySelector("#videoOverlayVisible");
  const markerName = document.querySelector("#videoMarkerName");
  const markerList = document.querySelector("#videoMarkerList");
  const addMarkerButton = document.querySelector("#addVideoMarkerButton");
  const removeMarkerButton = document.querySelector("#removeVideoMarkerButton");
  const outputDisplaySelect = document.querySelector("#outputDisplaySelect");
  const outputWindowToggle = document.querySelector("#outputWindowToggle");
  const outputWindowStatus = document.querySelector("#outputWindowStatus");
  const captureOutputButton = document.querySelector("#captureOutputButton");
  let videoUrl = null;
  let loadedVideoBuffer = null;
  let loadedVideoType = "video/webm";
  let applyingRemoteTransport = false;
  let pendingRemoteTransport = null;
  let imageUrl = null;
  let loadedImage = null;
  let imageDirty = false;
  let drawing = false;
  const textCanvas = document.createElement("canvas");
  const textContext = textCanvas.getContext("2d");
  let textDirty = true;
  document.fonts.ready.then(() => { textDirty = true; });
  const instanceId = crypto.randomUUID();
  const videoChannel = new BroadcastChannel("oscrvidnode-light-video-output");
  let lastVideoSnapshot = JSON.stringify(videoState);

  function broadcastVideoState() {
    videoChannel.postMessage({ type: "video-state", instanceId, video: structuredClone(videoState) });
  }

  function commitVideo(delay = 180, recordHistory = true) {
    const snapshot = JSON.stringify(videoState);
    if (recordHistory || snapshot !== lastVideoSnapshot) lastVideoSnapshot = snapshot;
    scheduleSave(delay);
    broadcastVideoState();
  }

  function updateResolution(save = true) {
    const maximum = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);
    const width = Math.round(Number(widthInput.value));
    const height = Math.round(Number(heightInput.value));
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 16 || height < 16 || width > maximum || height > maximum) {
      addLog("error", "Video", `resolution must be 16–${maximum}`);
      widthInput.value = videoState.width;
      heightInput.value = videoState.height;
      return;
    }
    videoState.width = width;
    videoState.height = height;
    canvas.width = width;
    canvas.height = height;
    renderCanvas.width = width;
    renderCanvas.height = height;
    canvas.parentElement.style.aspectRatio = `${width} / ${height}`;
    resolutionBadge.textContent = `${width} × ${height}`;
    gl.viewport(0, 0, width, height);
    textDirty = true;
    if (save) commitVideo();
  }

  function selectedMarker() {
    return videoState.markers.find((marker) => marker.id === videoState.selectedMarkerId) || videoState.markers[0];
  }

  function renderMarkerList() {
    markerList.replaceChildren();
    videoState.markers.forEach((marker) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `marker-chip${marker.id === videoState.selectedMarkerId ? " active" : ""}`;
      button.style.setProperty("--marker-colour", marker.color);
      button.innerHTML = '<span class="marker-swatch"></span><span class="marker-chip-name"></span>';
      button.querySelector(".marker-chip-name").textContent = marker.name;
      button.addEventListener("click", () => {
        videoState.selectedMarkerId = marker.id;
        updateXYDisplay();
        renderMarkerList();
        commitVideo();
      });
      markerList.append(button);
    });
    removeMarkerButton.disabled = videoState.markers.length <= 1;
  }

  function updateXYDisplay() {
    const marker = selectedMarker();
    if (!marker) return;
    xyHandle.style.left = `${marker.x * 100}%`;
    xyHandle.style.top = `${(1 - marker.y) * 100}%`;
    xyHandle.style.background = marker.color;
    xyPad.style.setProperty("--cross-left", `${marker.x * 100}%`);
    xyPad.style.setProperty("--cross-top", `${(1 - marker.y) * 100}%`);
    xyPad.style.setProperty("--marker-colour", marker.color);
    crossX.value = marker.x.toFixed(3);
    crossY.value = marker.y.toFixed(3);
    markerName.value = marker.name;
    overlayColor.value = marker.color;
    overlayVisible.checked = marker.visible;
  }

  function setCrossFromEvent(event) {
    const marker = selectedMarker();
    if (!marker) return;
    const bounds = xyPad.getBoundingClientRect();
    marker.x = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    marker.y = Math.max(0, Math.min(1, 1 - (event.clientY - bounds.top) / bounds.height));
    updateXYDisplay();
    commitVideo();
  }

  function setSource(nextSource) {
    videoState.source = nextSource;
    sourceSelect.value = nextSource;
    commitVideo();
  }

  function updateVideoSettings() {
    videoState.checkerSize = Math.max(2, Number(checkerSize.value) || 2);
    videoState.checkerColorA = checkerColorA.value;
    videoState.checkerColorB = checkerColorB.value;
    videoState.solidColor = solidColor.value;
    videoState.text = generatorText.value;
    videoState.textSize = Math.max(8, Number(generatorTextSize.value) || 8);
    videoState.textColor = generatorTextColor.value;
    videoState.textBackground = generatorTextBackground.value;
    videoState.textOverlayVisible = generatorTextOverlay.checked;
    videoState.textBoxVisible = generatorTextBox.checked;
    videoState.textX = Math.max(0, Math.min(1, Number(generatorTextX.value) || 0));
    videoState.textY = Math.max(0, Math.min(1, Number(generatorTextY.value) || 0));
    videoState.tileX = Math.max(1, Math.min(32, Math.round(Number(tileX.value) || 1)));
    videoState.tileY = Math.max(1, Math.min(32, Math.round(Number(tileY.value) || 1)));
    videoState.stretchX = Math.max(0.1, Math.min(10, Number(stretchX.value) || 1));
    videoState.stretchY = Math.max(0.1, Math.min(10, Number(stretchY.value) || 1));
    videoState.loop = loopInput.checked;
    videoState.brushSize = Number(brushSize.value);
    videoState.brushColor = brushColor.value;
    videoState.crossSize = Math.max(2, Number(crossSize.value) || 2);
    videoState.pointSize = Math.max(1, Number(pointSize.value) || 1);
    const marker = selectedMarker();
    if (marker) {
      marker.color = overlayColor.value;
      marker.visible = overlayVisible.checked;
    }
    video.loop = videoState.loop;
    textDirty = true;
    renderMarkerList();
    updateXYDisplay();
    commitVideo();
  }

  function renderTextCard() {
    textCanvas.width = videoState.width;
    textCanvas.height = videoState.height;
    textContext.fillStyle = videoState.textBackground;
    textContext.fillRect(0, 0, textCanvas.width, textCanvas.height);
    textContext.fillStyle = videoState.textColor;
    textContext.font = `650 ${videoState.textSize}px Geist, Arial, sans-serif`;
    textContext.textAlign = "center";
    textContext.textBaseline = "middle";
    const lines = String(videoState.text || " ").split(/\r?\n/).slice(0, 12);
    const lineHeight = videoState.textSize * 1.12;
    const firstY = textCanvas.height / 2 - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((line, index) => textContext.fillText(line, textCanvas.width / 2, firstY + index * lineHeight, textCanvas.width * 0.9));
    textDirty = false;
  }

  function drawTextOverlay() {
    if (!videoState.textOverlayVisible || !String(videoState.text).trim()) return;
    const lines = String(videoState.text).split(/\r?\n/).slice(0, 12);
    const size = videoState.textSize;
    const lineHeight = size * 1.12;
    const x = videoState.textX * canvas.width;
    const centreY = (1 - videoState.textY) * canvas.height;
    const firstY = centreY - ((lines.length - 1) * lineHeight) / 2;
    outputContext.save();
    outputContext.font = `650 ${size}px Geist, Arial, sans-serif`;
    outputContext.textAlign = "center";
    outputContext.textBaseline = "middle";
    if (videoState.textBoxVisible) {
      const widest = Math.min(canvas.width * 0.94, Math.max(...lines.map((line) => outputContext.measureText(line).width)));
      const padding = Math.max(12, size * 0.18);
      outputContext.fillStyle = videoState.textBackground;
      outputContext.fillRect(
        Math.max(0, x - widest / 2 - padding),
        Math.max(0, firstY - lineHeight / 2 - padding),
        Math.min(canvas.width, widest + padding * 2),
        Math.min(canvas.height, lines.length * lineHeight + padding * 2),
      );
    }
    outputContext.fillStyle = videoState.textColor;
    lines.forEach((line, index) => outputContext.fillText(line, x, firstY + index * lineHeight, canvas.width * 0.9));
    outputContext.restore();
  }

  function drawMarkers() {
    const thickness = Math.max(2, Math.min(canvas.width, canvas.height) / 720);
    const labelSize = Math.max(18, Math.round(Math.min(canvas.width, canvas.height) / 48));
    videoState.markers.filter((marker) => marker.visible).forEach((marker) => {
      const x = marker.x * (canvas.width - 1);
      const y = (1 - marker.y) * (canvas.height - 1);
      outputContext.save();
      outputContext.strokeStyle = marker.color;
      outputContext.fillStyle = marker.color;
      outputContext.lineWidth = thickness;
      outputContext.beginPath();
      outputContext.moveTo(x - videoState.crossSize, y);
      outputContext.lineTo(x + videoState.crossSize, y);
      outputContext.moveTo(x, y - videoState.crossSize);
      outputContext.lineTo(x, y + videoState.crossSize);
      outputContext.stroke();
      outputContext.beginPath();
      outputContext.arc(x, y, videoState.pointSize, 0, Math.PI * 2);
      outputContext.fill();

      const label = String(marker.name || "Marker");
      outputContext.font = `650 ${labelSize}px Geist, Arial, sans-serif`;
      outputContext.textBaseline = "middle";
      const paddingX = Math.max(7, labelSize * 0.4);
      const boxWidth = outputContext.measureText(label).width + paddingX * 2;
      const boxHeight = labelSize * 1.55;
      let labelX = x + videoState.pointSize + 12;
      let labelY = y - videoState.pointSize - boxHeight - 8;
      if (labelX + boxWidth > canvas.width) labelX = Math.max(0, x - videoState.pointSize - 12 - boxWidth);
      if (labelY < 0) labelY = Math.min(canvas.height - boxHeight, y + videoState.pointSize + 8);
      outputContext.fillStyle = "rgba(255,255,255,0.92)";
      outputContext.fillRect(labelX, labelY, boxWidth, boxHeight);
      outputContext.strokeStyle = marker.color;
      outputContext.lineWidth = thickness;
      outputContext.strokeRect(labelX, labelY, boxWidth, boxHeight);
      outputContext.fillStyle = "#0a0a0a";
      outputContext.fillText(label, labelX + paddingX, labelY + boxHeight / 2);
      outputContext.restore();
    });
  }

  function clearDrawing() {
    drawingContext.save();
    drawingContext.fillStyle = "#ffffff";
    drawingContext.fillRect(0, 0, drawingCanvas.width, drawingCanvas.height);
    drawingContext.restore();
  }

  function drawingPosition(event) {
    const bounds = drawingCanvas.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) * drawingCanvas.width / bounds.width,
      y: (event.clientY - bounds.top) * drawingCanvas.height / bounds.height,
    };
  }

  drawingCanvas.addEventListener("pointerdown", (event) => {
    drawing = true;
    drawingCanvas.setPointerCapture(event.pointerId);
    const point = drawingPosition(event);
    drawingContext.beginPath();
    drawingContext.moveTo(point.x, point.y);
    setSource("draw");
  });
  drawingCanvas.addEventListener("pointermove", (event) => {
    if (!drawing) return;
    const point = drawingPosition(event);
    drawingContext.lineWidth = videoState.brushSize;
    drawingContext.strokeStyle = videoState.brushColor;
    drawingContext.lineCap = "round";
    drawingContext.lineJoin = "round";
    drawingContext.lineTo(point.x, point.y);
    drawingContext.stroke();
  });
  const stopDrawing = () => {
    if (!drawing) return;
    drawing = false;
    videoState.drawingData = drawingCanvas.toDataURL("image/png");
    commitVideo(0);
  };
  drawingCanvas.addEventListener("pointerup", stopDrawing);
  drawingCanvas.addEventListener("pointercancel", stopDrawing);
  document.querySelector("#clearDrawingButton").addEventListener("click", () => {
    clearDrawing();
    videoState.drawingData = drawingCanvas.toDataURL("image/png");
    setSource("draw");
  });

  let movingCross = false;
  xyPad.addEventListener("pointerdown", (event) => {
    movingCross = true;
    xyPad.setPointerCapture(event.pointerId);
    setCrossFromEvent(event);
  });
  xyPad.addEventListener("pointermove", (event) => { if (movingCross) setCrossFromEvent(event); });
  xyPad.addEventListener("pointerup", () => { movingCross = false; });
  xyPad.addEventListener("pointercancel", () => { movingCross = false; });
  xyPad.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const marker = selectedMarker();
    if (!marker) return;
    const step = event.altKey ? 0.001 : 0.01;
    if (event.key === "ArrowLeft") marker.x = Math.max(0, marker.x - step);
    if (event.key === "ArrowRight") marker.x = Math.min(1, marker.x + step);
    if (event.key === "ArrowDown") marker.y = Math.max(0, marker.y - step);
    if (event.key === "ArrowUp") marker.y = Math.min(1, marker.y + step);
    updateXYDisplay();
    commitVideo();
  });

  document.querySelector("#resolutionForm").addEventListener("submit", (event) => {
    event.preventDefault();
    updateResolution();
  });
  sourceSelect.addEventListener("change", () => setSource(sourceSelect.value));
  [checkerSize, checkerColorA, checkerColorB, solidColor, generatorText, generatorTextSize, generatorTextColor, generatorTextBackground, generatorTextOverlay, generatorTextBox, generatorTextX, generatorTextY, tileX, tileY, stretchX, stretchY, loopInput, brushSize, brushColor, crossSize, pointSize, overlayColor, overlayVisible].forEach((control) => {
    control.addEventListener("input", updateVideoSettings);
    control.addEventListener("change", updateVideoSettings);
  });
  [crossX, crossY].forEach((control) => control.addEventListener("change", () => {
    const marker = selectedMarker();
    if (!marker) return;
    marker.x = Math.max(0, Math.min(1, Number(crossX.value) || 0));
    marker.y = Math.max(0, Math.min(1, Number(crossY.value) || 0));
    updateXYDisplay();
    commitVideo();
  }));
  markerName.addEventListener("input", () => {
    const marker = selectedMarker();
    if (!marker) return;
    marker.name = markerName.value || "Marker";
    renderMarkerList();
    commitVideo();
  });
  addMarkerButton.addEventListener("click", () => {
    const colours = ["#0077ff", "#00a651", "#ff8a00", "#a23cff", "#e10600", "#00a7a7"];
    const marker = {
      id: makeId("video-marker"),
      name: `Marker ${videoState.markers.length + 1}`,
      x: 0.5,
      y: 0.5,
      color: colours[videoState.markers.length % colours.length],
      visible: true,
    };
    videoState.markers.push(marker);
    videoState.selectedMarkerId = marker.id;
    renderMarkerList();
    updateXYDisplay();
    commitVideo(0);
  });
  removeMarkerButton.addEventListener("click", () => {
    if (videoState.markers.length <= 1) return;
    const index = videoState.markers.findIndex((marker) => marker.id === videoState.selectedMarkerId);
    videoState.markers.splice(Math.max(0, index), 1);
    videoState.selectedMarkerId = videoState.markers[Math.min(Math.max(0, index), videoState.markers.length - 1)].id;
    renderMarkerList();
    updateXYDisplay();
    commitVideo(0);
  });

  document.querySelector("#videoFileInput").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    loadedVideoBuffer = await file.arrayBuffer();
    loadedVideoType = file.type || "video/quicktime";
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    videoUrl = URL.createObjectURL(file);
    video.src = videoUrl;
    video.load();
    mediaStatus.textContent = `Loading ${file.name}…`;
    setSource("video");
    videoChannel.postMessage({ type: "video-media", instanceId, buffer: loadedVideoBuffer, mime: loadedVideoType, name: file.name });
  });
  video.addEventListener("loadedmetadata", () => {
    timeline.max = String(video.duration || 1);
    mediaStatus.textContent = `Video ready · ${video.videoWidth} × ${video.videoHeight} · ${video.duration.toFixed(2)} s`;
    if (pendingRemoteTransport) {
      applyingRemoteTransport = true;
      video.loop = pendingRemoteTransport.loop;
      video.currentTime = Math.min(video.duration || 0, pendingRemoteTransport.currentTime || 0);
      if (!pendingRemoteTransport.paused) video.play().catch(() => {});
      else video.pause();
      applyingRemoteTransport = false;
      pendingRemoteTransport = null;
    }
  });
  video.addEventListener("error", () => {
    mediaStatus.textContent = "This video or codec is not supported by the embedded Chromium decoder. Native HAP decoding is not bundled yet.";
    addLog("error", "Video", "unsupported media or codec");
  });
  video.addEventListener("timeupdate", () => { if (!timeline.matches(":active")) timeline.value = String(video.currentTime); });
  function broadcastTransport() {
    if (applyingRemoteTransport) return;
    videoChannel.postMessage({ type: "video-transport", instanceId, paused: video.paused, currentTime: video.currentTime, loop: video.loop });
  }
  video.addEventListener("play", () => { playButton.textContent = "Pause"; broadcastTransport(); });
  video.addEventListener("pause", () => { playButton.textContent = "Play"; broadcastTransport(); });
  playButton.addEventListener("click", async () => {
    if (!video.src) {
      mediaStatus.textContent = "Load a video first.";
      return;
    }
    if (video.paused) await video.play().catch((error) => { mediaStatus.textContent = error.message; });
    else video.pause();
  });
  document.querySelector("#videoStopButton").addEventListener("click", () => {
    video.pause();
    video.currentTime = 0;
  });
  timeline.addEventListener("input", () => { if (video.duration) video.currentTime = Number(timeline.value); });

  document.querySelector("#imageFileInput").addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    imageUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      loadedImage = image;
      imageDirty = true;
      mediaStatus.textContent = `Test image ready · ${image.naturalWidth} × ${image.naturalHeight}`;
      const reader = new FileReader();
      reader.addEventListener("load", () => {
        videoState.imageData = String(reader.result);
        commitVideo(0);
      });
      reader.readAsDataURL(file);
      setSource("image");
    };
    image.onerror = () => { mediaStatus.textContent = "Could not decode that image."; };
    image.src = imageUrl;
  });

  document.querySelector("#fullscreenOutputButton").addEventListener("click", () => {
    canvas.requestFullscreen?.().catch(() => {});
  });

  captureOutputButton.addEventListener("click", async () => {
    const dataUrl = canvas.toDataURL("image/png");
    if (window.oscrnodeDesktop?.saveCapture) {
      const result = await window.oscrnodeDesktop.saveCapture(dataUrl).catch((error) => ({ error: error.message }));
      if (result?.saved) addLog("saved", "Video capture", result.filePath);
      else if (result?.error) addLog("error", "Video capture", result.error);
      return;
    }
    const link = document.createElement("a");
    link.download = `OSCrnode-output-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
    link.href = dataUrl;
    link.click();
  });

  async function initializeDesktopOutput() {
    if (!window.oscrnodeDesktop) {
      outputDisplaySelect.innerHTML = '<option value="">Packaged desktop app only</option>';
      outputWindowStatus.textContent = "Open the packaged desktop app to select a display.";
      return;
    }
    const result = await window.oscrnodeDesktop.listDisplays();
    outputDisplaySelect.replaceChildren();
    result.displays.forEach((display, index) => {
      const option = document.createElement("option");
      option.value = display.id;
      option.textContent = `${display.label || `Display ${index + 1}`}${display.primary ? " · Main" : ""} · ${display.bounds.width} × ${display.bounds.height}`;
      outputDisplaySelect.append(option);
    });
    if (result.displays.some((display) => display.id === videoState.outputDisplayId)) outputDisplaySelect.value = videoState.outputDisplayId;
    else outputDisplaySelect.value = result.displays[0]?.id || "";
    outputWindowToggle.disabled = !outputDisplaySelect.value;
    outputWindowToggle.checked = Boolean(result.open);
    outputWindowStatus.textContent = result.open ? "Clean output is open." : "The output window contains no interface controls.";
    outputDisplaySelect.addEventListener("change", () => {
      videoState.outputDisplayId = outputDisplaySelect.value;
      commitVideo();
    });
    outputWindowToggle.addEventListener("change", async () => {
      videoState.outputDisplayId = outputDisplaySelect.value;
      commitVideo(0);
      await persistState();
      const next = await window.oscrnodeDesktop.toggleOutput(outputDisplaySelect.value);
      outputWindowToggle.checked = Boolean(next.open);
      outputWindowStatus.textContent = next.open ? `Clean output is open on ${next.label}.` : "Clean output closed.";
      if (next.open) broadcastVideoState();
    });
    window.oscrnodeDesktop.onOutputState((next) => {
      outputWindowToggle.checked = Boolean(next.open);
      outputWindowStatus.textContent = next.open ? "Clean output is open." : "Clean output closed.";
    });
  }

  function applyVideoStateToControls() {
    widthInput.value = videoState.width;
    heightInput.value = videoState.height;
    sourceSelect.value = videoState.source;
    checkerSize.value = videoState.checkerSize;
    checkerColorA.value = videoState.checkerColorA;
    checkerColorB.value = videoState.checkerColorB;
    solidColor.value = videoState.solidColor;
    generatorText.value = videoState.text;
    generatorTextSize.value = videoState.textSize;
    generatorTextColor.value = videoState.textColor;
    generatorTextBackground.value = videoState.textBackground;
    generatorTextOverlay.checked = videoState.textOverlayVisible;
    generatorTextBox.checked = videoState.textBoxVisible;
    generatorTextX.value = videoState.textX;
    generatorTextY.value = videoState.textY;
    tileX.value = videoState.tileX;
    tileY.value = videoState.tileY;
    stretchX.value = videoState.stretchX;
    stretchY.value = videoState.stretchY;
    loopInput.checked = videoState.loop;
    brushSize.value = videoState.brushSize;
    brushColor.value = videoState.brushColor;
    crossSize.value = videoState.crossSize;
    pointSize.value = videoState.pointSize;
    video.loop = videoState.loop;
    textDirty = true;
    updateResolution(false);
    renderMarkerList();
    updateXYDisplay();
  }

  function loadDrawingData(dataUrl) {
    if (!dataUrl) return;
    const image = new Image();
    image.addEventListener("load", () => drawingContext.drawImage(image, 0, 0, drawingCanvas.width, drawingCanvas.height));
    image.src = dataUrl;
  }

  function loadImageData(dataUrl) {
    if (!dataUrl) return;
    const image = new Image();
    image.addEventListener("load", () => { loadedImage = image; imageDirty = true; });
    image.src = dataUrl;
  }

  videoChannel.addEventListener("message", (event) => {
    const message = event.data;
    if (!message || message.instanceId === instanceId) return;
    if (message.type === "request-media") {
      if (loadedVideoBuffer) {
        videoChannel.postMessage({
          type: "video-media",
          instanceId,
          buffer: loadedVideoBuffer,
          mime: loadedVideoType,
          paused: video.paused,
          currentTime: video.currentTime,
          loop: video.loop,
        });
      }
      return;
    }
    if (message.type === "video-media" && message.buffer) {
      loadedVideoBuffer = message.buffer;
      loadedVideoType = message.mime || "video/webm";
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      videoUrl = URL.createObjectURL(new Blob([loadedVideoBuffer], { type: loadedVideoType }));
      pendingRemoteTransport = message;
      video.src = videoUrl;
      video.load();
      return;
    }
    if (message.type === "video-transport") {
      applyingRemoteTransport = true;
      video.loop = message.loop;
      if (Number.isFinite(message.currentTime) && Math.abs(video.currentTime - message.currentTime) > 0.3) video.currentTime = message.currentTime;
      if (message.paused) video.pause();
      else video.play().catch(() => {});
      applyingRemoteTransport = false;
      return;
    }
    if (message.type !== "video-state" || !message.video) return;
    const previousDrawing = videoState.drawingData;
    const previousImage = videoState.imageData;
    Object.assign(videoState, message.video, { markers: message.video.markers.map((marker) => ({ ...marker })) });
    lastVideoSnapshot = JSON.stringify(videoState);
    applyVideoStateToControls();
    if (videoState.drawingData && videoState.drawingData !== previousDrawing) loadDrawingData(videoState.drawingData);
    if (videoState.imageData && videoState.imageData !== previousImage) loadImageData(videoState.imageData);
  });
  videoChannel.postMessage({ type: "request-media", instanceId });

  function uploadTexture(source) {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      return true;
    } catch {
      return false;
    }
  }

  function render() {
    if (state.activeTab === "video" || !video.paused) {
      gl.useProgram(program);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      let mode = { solid: 0, video: 1, image: 1, draw: 1, text: 1, checker: 2, test: 3 }[videoState.source] ?? 2;
      if (videoState.source === "video") {
        if (video.readyState >= 2) uploadTexture(video);
        else mode = 2;
      } else if (videoState.source === "image") {
        if (loadedImage && imageDirty) {
          uploadTexture(loadedImage);
          imageDirty = false;
        } else if (!loadedImage) mode = 2;
      } else if (videoState.source === "draw") {
        uploadTexture(drawingCanvas);
      } else if (videoState.source === "text") {
        if (textDirty) renderTextCard();
        uploadTexture(textCanvas);
      }
      gl.uniform1i(uniforms.u_texture, 0);
      gl.uniform1i(uniforms.u_mode, mode);
      gl.uniform2f(uniforms.u_resolution, renderCanvas.width, renderCanvas.height);
      gl.uniform1f(uniforms.u_checker_size, videoState.checkerSize);
      gl.uniform4fv(uniforms.u_color_a, hexColor(videoState.checkerColorA));
      gl.uniform4fv(uniforms.u_color_b, hexColor(videoState.checkerColorB));
      gl.uniform4fv(uniforms.u_solid_color, hexColor(videoState.solidColor));
      gl.uniform2f(uniforms.u_tile, videoState.tileX, videoState.tileY);
      gl.uniform2f(uniforms.u_stretch, videoState.stretchX, videoState.stretchY);
      gl.uniform2f(uniforms.u_cross, 0, 0);
      gl.uniform1f(uniforms.u_cross_size, videoState.crossSize);
      gl.uniform1f(uniforms.u_point_size, videoState.pointSize);
      gl.uniform4fv(uniforms.u_overlay_color, [1, 0, 0, 1]);
      gl.uniform1i(uniforms.u_show_overlay, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      outputContext.drawImage(renderCanvas, 0, 0, canvas.width, canvas.height);
      drawTextOverlay();
      drawMarkers();
    }
    requestAnimationFrame(render);
  }

  applyVideoStateToControls();
  clearDrawing();
  loadDrawingData(videoState.drawingData);
  loadImageData(videoState.imageData);
  initializeDesktopOutput().catch((error) => { outputWindowStatus.textContent = error.message; });
  render();

  window.__oscrnodeVideo = {
    getState: () => ({ ...videoState }),
    samplePixel: (x, y) => {
      const pixel = outputContext.getImageData(x, canvas.height - 1 - y, 1, 1).data;
      return [...pixel];
    },
    captureDataUrl: () => canvas.toDataURL("image/png"),
  };
}

connectionButton.addEventListener("click", () => {
  if (connectionState === "connected" || connectionState === "connecting") disconnect();
  else connect();
});

targetForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const target = await applyTarget(targetHost.value.trim(), Number(targetPort.value));
    state.target = target;
    renderDevices();
    scheduleSave(0);
  } catch (error) {
    addLog("error", "Destination", error.message);
  }
});

addModuleForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const type = newModuleType.value;
  const title = uniqueTitle(newModuleTitle.value, state.modules);
  const slug = suffixName(title.toLowerCase(), "control");
  const module = type === "slider"
    ? makeSlider(title, `/${slug}`)
    : type === "xy1" || type === "xy2"
      ? makeXY(type, title, `/${slug}`)
      : makeButton(type, title, `/${slug}`);
  state.modules.push(module);
  renderModules();
  applyDeletionLock();
  scheduleSave(0);
  document.querySelector(`[data-module-id="${module.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
});

addCustomButton.addEventListener("click", () => {
  const title = uniqueTitle("Custom send", state.customSends);
  state.customSends.push(makeCustom(title));
  renderCustomSends();
  applyDeletionLock();
  scheduleSave(0);
  customContainer.lastElementChild?.scrollIntoView({ behavior: "smooth", block: "center" });
});

titleLockButton.addEventListener("click", () => {
  deletionUnlocked = !deletionUnlocked;
  applyDeletionLock();
});

document.querySelector("#zoomOutButton").addEventListener("click", () => {
  state.zoom = Math.max(0.7, Math.round((state.zoom - 0.1) * 10) / 10);
  applyZoom();
  scheduleSave();
});
document.querySelector("#zoomInButton").addEventListener("click", () => {
  state.zoom = Math.min(1.4, Math.round((state.zoom + 0.1) * 10) / 10);
  applyZoom();
  scheduleSave();
});
logToggleButton.addEventListener("click", () => {
  state.logVisible = !state.logVisible;
  applyLogVisibility();
  scheduleSave();
});
document.querySelector("#clearLogButton").addEventListener("click", showEmptyLog);
document.querySelectorAll(".tab-button").forEach((button) => {
  button.addEventListener("click", () => setActiveTab(button.dataset.tab));
});

window.addEventListener("beforeunload", () => {
  if (!state) return;
  fetch("/api/state", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state }),
    keepalive: true,
  }).catch(() => {});
});

async function boot() {
  showEmptyLog();
  state = await loadState();
  const parameters = new URLSearchParams(window.location.search);
  const requestedTab = parameters.get("tab");
  document.body.classList.toggle("output-only", parameters.get("output") === "1");
  if (requestedTab === "sliders" || requestedTab === "video") state.activeTab = requestedTab;
  targetHost.value = state.target.host;
  targetPort.value = state.target.port;
  applyZoom();
  applyLogVisibility();
  setActiveTab(state.activeTab, false);
  renderModules();
  renderCustomSends();
  applyDeletionLock();
  initializeVideoModules();
  initializeVideo();
  try {
    await applyTarget(state.target.host, Number(state.target.port), false);
  } catch (error) {
    addLog("error", "Destination", error.message);
  }
  connect();
  scheduleSave(0);
}

boot();
