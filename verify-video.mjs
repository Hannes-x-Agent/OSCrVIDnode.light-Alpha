import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import WebSocket from "ws";

const run = promisify(execFile);
const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const httpPort = 43177;
const debugPort = 49228;
const externalUrl = process.env.OSC_SENDER_VERIFY_URL;
const baseUrl = externalUrl || `http://127.0.0.1:${httpPort}`;
const root = path.dirname(fileURLToPath(import.meta.url));
const verificationRoot = path.join(root, ".verification");
await mkdir(verificationRoot, { recursive: true });
const workspace = await mkdtemp(path.join(verificationRoot, "video-"));
const profile = path.join(workspace, "chrome");
const stateFile = path.join(workspace, "state.json");
const testVideo = path.join(workspace, "test-pattern.webm");

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function poll(action, label, attempts = 100) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const result = await action();
      if (result) return result;
    } catch {}
    await delay(100);
  }
  throw new Error(`${label} timed out`);
}

await run("/opt/homebrew/bin/ffmpeg", [
  "-hide_banner", "-loglevel", "error", "-y",
  "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=30",
  "-t", "1.5", "-c:v", "libvpx-vp9", "-pix_fmt", "yuv420p", testVideo,
]);

const server = externalUrl
  ? null
  : spawn(process.execPath, ["server.mjs"], {
      cwd: new URL(".", import.meta.url),
      env: {
        ...process.env,
        OSC_SENDER_HTTP_PORT: String(httpPort),
        OSCRVIDNODE_LIGHT_STATE_FILE: stateFile,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

const chrome = spawn(chromePath, [
  "--headless=new",
  "--no-sandbox",
  "--enable-unsafe-swiftshader",
  "--window-size=1440,1000",
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profile}`,
  `${baseUrl}/?tab=video`,
], { stdio: "ignore" });

async function openCdp() {
  const page = await poll(async () => {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
    const pages = await response.json();
    return pages.find((entry) => entry.type === "page" && entry.url.includes("tab=video"));
  }, "Chrome page");

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
  return { socket, call };
}

function waitForExit(child) {
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null) resolve();
    else {
      child.once("exit", resolve);
      setTimeout(resolve, 2000);
    }
  });
}

try {
  await poll(async () => (await fetch(`${baseUrl}/api/status`)).ok, "OSC server");
  const { socket, call } = await openCdp();
  await call("Runtime.enable");
  await call("DOM.enable");
  const evaluate = async (expression) => {
    const result = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };

  await poll(async () => evaluate("Boolean(window.__oscrnodeVideo)"), "Video renderer");
  assert.equal(await evaluate("document.querySelector('#videoPanel').hidden"), false);
  assert.equal(await evaluate("document.querySelector('#webglStatus').textContent"), "WebGL2 ready");
  assert.equal(await evaluate("document.fonts.ready.then(() => document.fonts.check('16px Geist'))"), true);
  assert.equal(await evaluate(`[...document.fonts].some((font) => font.family.includes('Geist') && font.status === 'loaded')`), true);
  assert.ok((await evaluate(`performance.getEntriesByType('resource').filter((entry) => entry.name.includes('/fonts/Geist-Variable.woff2')).length`)) >= 1);
  assert.deepEqual(await evaluate(`(() => {
    const canvas = document.querySelector('#videoCanvas');
    return [canvas.width, canvas.height, document.querySelector('#resolutionBadge').textContent];
  })()`), [1920, 1080, "1920 × 1080"]);
  const layout = await evaluate(`(() => {
    const workspace = document.querySelector('.video-workspace').getBoundingClientRect();
    const controls = document.querySelector('.video-controls').getBoundingClientRect();
    const preview = document.querySelector('.video-stage-wrap').getBoundingClientRect();
    return {
      ratio: preview.width / workspace.width,
      columns: getComputedStyle(document.querySelector('.video-controls')).gridTemplateColumns.split(' ').length,
      sticky: getComputedStyle(document.querySelector('.video-stage')).position,
      controlWidth: controls.width,
    };
  })()`);
  assert.ok(layout.ratio > 0.45 && layout.ratio < 0.55, `preview ratio was ${layout.ratio}`);
  assert.equal(layout.columns, 2);
  assert.equal(layout.sticky, "sticky");
  assert.equal(await evaluate(`(() => {
    const card = document.querySelector('[data-video-module-id="video-transform"]');
    card.querySelector('.module-lock-button').click();
    card.querySelector('.settings-lock-button').click();
    card.querySelector('.control-lock-button').click();
    const allLocked = card.classList.contains('is-all-locked') && getComputedStyle(card).backgroundColor === 'rgb(255, 0, 0)';
    card.querySelector('.control-lock-button').click();
    card.querySelector('.settings-lock-button').click();
    card.querySelector('.module-lock-button').click();
    card.querySelector('.collapse-button').click();
    const collapsed = card.classList.contains('is-collapsed') && getComputedStyle(card.querySelector('.video-module-content')).display === 'none';
    card.querySelector('.collapse-button').click();
    return allLocked && collapsed;
  })()`), true);

  await poll(async () => {
    const samples = await evaluate(`[
      window.__oscrnodeVideo.samplePixel(50, 50),
      window.__oscrnodeVideo.samplePixel(150, 50)
    ]`);
    return samples[0][0] > 230 && samples[1][0] < 30;
  }, "Checkerboard pixels");

  const xyBounds = await evaluate(`(() => {
    document.querySelector('#videoXYPad').scrollIntoView({ block: 'center' });
    const rect = document.querySelector('#videoXYPad').getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  })()`);
  const x = xyBounds.left + xyBounds.width * 0.75;
  const y = xyBounds.top + xyBounds.height * 0.75;
  await call("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await call("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  await delay(100);
  const cross = await evaluate("window.__oscrnodeVideo.getState()");
  assert.ok(Math.abs(cross.markers[0].x - 0.75) < 0.02);
  assert.ok(Math.abs(cross.markers[0].y - 0.25) < 0.02);
  const crossPixel = await evaluate("window.__oscrnodeVideo.samplePixel(Math.round(1920 * .75), Math.round(1080 * .25))");
  assert.ok(crossPixel[0] > 230 && crossPixel[1] < 40 && crossPixel[2] < 40, `cross pixel was ${crossPixel}`);

  await evaluate(`(() => {
    document.querySelector('#outputWidth').value = '1280';
    document.querySelector('#outputHeight').value = '720';
    document.querySelector('#resolutionForm').requestSubmit();
  })()`);
  assert.deepEqual(await evaluate(`(() => {
    const canvas = document.querySelector('#videoCanvas');
    return [canvas.width, canvas.height, document.querySelector('#resolutionBadge').textContent];
  })()`), [1280, 720, "1280 × 720"]);

  await evaluate(`(() => {
    const set = (selector, value) => {
      const control = document.querySelector(selector);
      control.value = value;
      control.dispatchEvent(new Event('input', { bubbles: true }));
      control.dispatchEvent(new Event('change', { bubbles: true }));
    };
    set('#generatorText', 'CALIBRATION');
    set('#generatorTextSize', '100');
    set('#generatorTextBackground', '#123456');
    set('#videoTileX', '3');
    set('#videoTileY', '2');
    set('#videoStretchX', '1.5');
    set('#videoStretchY', '0.75');
    document.querySelector('#videoOverlayVisible').checked = false;
    document.querySelector('#videoOverlayVisible').dispatchEvent(new Event('change', { bubbles: true }));
    document.querySelector('#generatorTextOverlay').checked = true;
    document.querySelector('#generatorTextOverlay').dispatchEvent(new Event('change', { bubbles: true }));
    document.querySelector('#generatorTextBox').checked = true;
    document.querySelector('#generatorTextBox').dispatchEvent(new Event('change', { bubbles: true }));
    set('#videoSourceSelect', 'checker');
  })()`);
  await poll(async () => {
    const pixel = await evaluate("window.__oscrnodeVideo.samplePixel(640, 420)");
    return Math.abs(pixel[0] - 18) < 5 && Math.abs(pixel[1] - 52) < 5 && Math.abs(pixel[2] - 86) < 5;
  }, "Composited text background");
  assert.deepEqual(await evaluate(`(() => {
    const value = window.__oscrnodeVideo.getState();
    return [value.source, value.textOverlayVisible, value.text, value.tileX, value.tileY, value.stretchX, value.stretchY];
  })()`), ["checker", true, "CALIBRATION", 3, 2, 1.5, 0.75]);

  await evaluate(`(() => {
    document.querySelector('#addVideoMarkerButton').click();
    const set = (selector, value) => {
      const control = document.querySelector(selector);
      control.value = value;
      control.dispatchEvent(new Event('input', { bubbles: true }));
      control.dispatchEvent(new Event('change', { bubbles: true }));
    };
    set('#videoMarkerName', 'Blue edge');
    set('#videoOverlayColor', '#0077ff');
    set('#videoCrossX', '1');
    set('#videoCrossY', '0');
  })()`);
  await poll(async () => {
    const pixel = await evaluate("window.__oscrnodeVideo.samplePixel(1279, 0)");
    return pixel[2] > 220 && pixel[0] < 30;
  }, "Edge marker render");
  assert.deepEqual(await evaluate(`window.__oscrnodeVideo.getState().markers.map(({ name, color, x, y }) => [name, color, x, y])`), [
    ["Marker 1", "#ff0000", cross.markers[0].x, cross.markers[0].y],
    ["Blue edge", "#0077ff", 1, 0],
  ]);
  assert.ok((await evaluate("window.__oscrnodeVideo.captureDataUrl().length")) > 10_000);

  const drawBounds = await evaluate(`(() => {
    document.querySelector('#drawingCanvas').scrollIntoView({ block: 'center' });
    const rect = document.querySelector('#drawingCanvas').getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  })()`);
  const drawX = drawBounds.left + drawBounds.width * 0.3;
  const drawY = drawBounds.top + drawBounds.height * 0.5;
  await call("Input.dispatchMouseEvent", { type: "mousePressed", x: drawX, y: drawY, button: "left", clickCount: 1 });
  await call("Input.dispatchMouseEvent", { type: "mouseMoved", x: drawX + 80, y: drawY + 25, button: "left", buttons: 1 });
  await call("Input.dispatchMouseEvent", { type: "mouseReleased", x: drawX + 80, y: drawY + 25, button: "left", clickCount: 1 });
  assert.equal(await evaluate("window.__oscrnodeVideo.getState().source"), "draw");

  const documentNode = await call("DOM.getDocument", { depth: 1 });
  const fileInput = await call("DOM.querySelector", { nodeId: documentNode.root.nodeId, selector: "#videoFileInput" });
  await call("DOM.setFileInputFiles", { nodeId: fileInput.nodeId, files: [testVideo] });
  await poll(async () => (await evaluate("document.querySelector('#mediaStatus').textContent")).startsWith("Video ready"), "Video decode");
  await evaluate("document.querySelector('#videoPlayButton').click()");
  await poll(async () => evaluate("!document.querySelector('#videoElement').paused && document.querySelector('#videoElement').currentTime > .05"), "Video playback");
  assert.match(await evaluate("document.querySelector('#mediaStatus').textContent"), /320 × 180/);

  socket.close();
  console.log("PASS: Geist, standardized video locks/collapse, responsive 50/50 layout, composition, markers, capture, and video playback");
} finally {
  chrome.kill("SIGTERM");
  server?.kill("SIGTERM");
  await Promise.all([waitForExit(chrome), waitForExit(server)]);
  await rm(workspace, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
