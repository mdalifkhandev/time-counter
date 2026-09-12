const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
    isElectron: true,
    minimize: () => ipcRenderer.send("minimize-window"),
    close: () => ipcRenderer.send("close-window"),
    toggleAlwaysOnTop: () => ipcRenderer.invoke("toggle-always-on-top"),
    getAlwaysOnTop: () => ipcRenderer.invoke("get-always-on-top"),
    notifyTimeUp: () => ipcRenderer.send("notify-time-up"),
    setWindowSize: (width, height) => ipcRenderer.send("set-window-size", { width, height }),
    onWindowResize: (callback) => {
        const listener = (event, data) => callback(data);
        ipcRenderer.on("window-resized", listener);
        return () => ipcRenderer.removeListener("window-resized", listener);
    },
});
