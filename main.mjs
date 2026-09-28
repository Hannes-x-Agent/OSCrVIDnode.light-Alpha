import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";
import { app, BrowserWindow, dialog, ipcMain, Menu, screen, shell } from "electron";

const root = path.dirname(fileURLToPath(import.meta.url));
let mainWindow = null;
let outputWindow = null;
let bridge = null;
let bridgeUrl = null;
let quitting = false;

const hasLock = app.requestSingleInstanceLock();
if (!hasLock) app.quit();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 920,
    minHeight: 620,
    show: false,
    backgroundColor: "#f1efe9",
    title: "OSCrVIDnode.light (Alpha)",
    icon: path.join(root, "assets", "icon.png"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(root, "preload.cjs"),
    },
  });

  mainWindow.loadURL(bridgeUrl);
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://")) shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function displayPayload() {
  const primaryId = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((display, index) => ({
    id: String(display.id),
    label: display.label || `Display ${index + 1}`,
    primary: display.id === primaryId,
    bounds: display.bounds,
    scaleFactor: display.scaleFactor,
  }));
}

function closeOutputWindow() {
  if (!outputWindow) return;
  outputWindow.close();
  outputWindow = null;
}

function openOutputWindow(displayId) {
  const displays = screen.getAllDisplays();
  const target = displays.find((display) => String(display.id) === String(displayId)) || screen.getPrimaryDisplay();
  closeOutputWindow();
  outputWindow = new BrowserWindow({
    x: target.bounds.x,
    y: target.bounds.y,
    width: target.bounds.width,
    height: target.bounds.height,
    frame: false,
    fullscreen: true,
    autoHideMenuBar: true,
    skipTaskbar: true,
    backgroundColor: "#000000",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(root, "preload.cjs"),
    },
  });
  outputWindow.loadURL(`${bridgeUrl}/?output=1&tab=video`);
  outputWindow.once("ready-to-show", () => outputWindow?.show());
  outputWindow.on("closed", () => {
    outputWindow = null;
    mainWindow?.webContents.send("output:state", { open: false });
  });
  return target;
}

ipcMain.handle("output:list-displays", () => ({ displays: displayPayload(), open: Boolean(outputWindow) }));
ipcMain.handle("output:toggle", (_event, displayId) => {
  if (outputWindow) {
    closeOutputWindow();
    return { open: false };
  }
  const target = openOutputWindow(displayId);
  return { open: true, displayId: String(target.id), label: target.label || "Display" };
});
ipcMain.handle("capture:save", async (_event, dataUrl) => {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/png;base64,") || dataUrl.length > 100_000_000) throw new Error("Invalid PNG capture");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const result = await dialog.showSaveDialog(mainWindow || undefined, {
    title: "Save output capture",
    defaultPath: `OSCrVIDnode-output-${stamp}.png`,
    filters: [{ name: "PNG image", extensions: ["png"] }],
  });
  if (result.canceled || !result.filePath) return { saved: false };
  await writeFile(result.filePath, Buffer.from(dataUrl.slice("data:image/png;base64,".length), "base64"));
  return { saved: true, filePath: result.filePath };
});

app.on("second-instance", () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

app.whenReady().then(async () => {
  try {
    Menu.setApplicationMenu(null);
    process.env.OSC_SENDER_HTTP_PORT = "0";
    process.env.OSCRVIDNODE_LIGHT_STATE_FILE = path.join(app.getPath("userData"), "state.json");
    bridge = await import("./server.mjs");
    ({ url: bridgeUrl } = await bridge.serverReady);
    createWindow();
  } catch (error) {
    dialog.showErrorBox("OSCrVIDnode.light (Alpha) could not start", error.message);
    app.quit();
  }
});

app.on("activate", () => {
  if (!mainWindow && bridgeUrl) createWindow();
});

app.on("window-all-closed", () => app.quit());

app.on("before-quit", (event) => {
  if (!bridge || quitting) return;
  event.preventDefault();
  quitting = true;
  closeOutputWindow();
  bridge.stopServer().finally(() => app.quit());
});
