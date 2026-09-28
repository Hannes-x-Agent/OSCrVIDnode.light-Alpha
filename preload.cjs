const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("oscrnodeDesktop", {
  listDisplays: () => ipcRenderer.invoke("output:list-displays"),
  toggleOutput: (displayId) => ipcRenderer.invoke("output:toggle", displayId),
  saveCapture: (dataUrl) => ipcRenderer.invoke("capture:save", dataUrl),
  onOutputState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("output:state", listener);
    return () => ipcRenderer.removeListener("output:state", listener);
  },
});
