import assert from "node:assert/strict";
import WebSocket from "ws";

const debugPort = Number(process.env.OSCRVIDNODE_DEBUG_PORT || 49229);
const pages = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
const page = pages.find((entry) => entry.type === "page" && entry.title.includes("OSCrVIDnode.light"));
assert.ok(page, "packaged Electron page was not found");

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.once("open", resolve);
  socket.once("error", reject);
});
let commandId = 0;
const pending = new Map();
socket.on("message", (data) => {
  const message = JSON.parse(data.toString());
  if (!message.id || !pending.has(message.id)) return;
  const handlers = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) handlers.reject(new Error(message.error.message));
  else handlers.resolve(message.result);
});
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++commandId;
  pending.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => {
  const result = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
};

await call("Runtime.enable");
await evaluate("document.querySelector('[data-tab=video]').click()");
await new Promise((resolve) => setTimeout(resolve, 250));
assert.deepEqual(await evaluate(`(async () => ({
  title: document.title,
  webgl: document.querySelector('#webglStatus').textContent,
  width: document.querySelector('#videoCanvas').width,
  height: document.querySelector('#videoCanvas').height,
  textSource: Boolean(document.querySelector('#videoSourceSelect option[value=text]')),
  tileControls: Boolean(document.querySelector('#videoTileX') && document.querySelector('#videoStretchY')),
  markerControls: Boolean(document.querySelector('#addVideoMarkerButton') && document.querySelector('#videoMarkerName')),
  desktopBridge: Boolean(window.oscrnodeDesktop?.listDisplays && window.oscrnodeDesktop?.toggleOutput && window.oscrnodeDesktop?.saveCapture),
  fontRoute: performance.getEntriesByType('resource').some((entry) => entry.name.includes('/fonts/Geist-Variable.woff2')),
  font: document.fonts.check('16px Geist'),
}))()`), {
  title: "OSCrVIDnode.light (Alpha)",
  webgl: "WebGL2 ready",
  width: 1920,
  height: 1080,
  textSource: true,
  tileControls: true,
  markerControls: true,
  desktopBridge: true,
  fontRoute: true,
  font: true,
});
const displayState = await evaluate("window.oscrnodeDesktop.listDisplays()");
assert.ok(displayState.displays.length >= 1);
assert.ok(displayState.displays.every((display) => display.id && display.bounds.width > 0 && display.bounds.height > 0));
const outputState = await evaluate(`window.oscrnodeDesktop.toggleOutput(${JSON.stringify(displayState.displays[0]?.id)})`);
assert.equal(outputState.open, true);
await new Promise((resolve) => setTimeout(resolve, 800));
const outputPages = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
assert.ok(outputPages.some((entry) => entry.type === "page" && entry.url.includes("output=1")), "clean output window was not created");
assert.equal((await evaluate(`window.oscrnodeDesktop.toggleOutput(${JSON.stringify(displayState.displays[0]?.id)})`)).open, false);
await evaluate("document.querySelector('[data-tab=sliders]').click()");
socket.close();
console.log("PASS: packaged runtime loaded both tabs, WebGL composition, desktop capture bridge, display enumeration, and clean output window");
