const { app, BrowserWindow, ipcMain, screen } = require("electron");
const path = require("path");
const fs = require("fs");
const http = require("http");

// Disable Chromium GPU shader and HTTP disk caching to prevent Windows cache lock conflicts
app.commandLine.appendSwitch("disable-gpu-shader-disk-cache");
app.commandLine.appendSwitch("disable-http-cache");
app.commandLine.appendSwitch("log-level", "3");

// Ensure only one instance of the app runs at a time
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    process.exit(0);
} else {
    app.on("second-instance", () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
            mainWindow.setAlwaysOnTop(true, "screen-saver");
        }
    });
}

let mainWindow = null;
let localServer = null;

const mimeTypes = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
};

function startLocalServer(distDir) {
    return new Promise((resolve, reject) => {
        const server = http.createServer((req, res) => {
            try {
                const parsedUrl = new URL(req.url, "http://localhost");
                let safePath = path.normalize(parsedUrl.pathname).replace(/^(\.\.[\/\\])+/, "");
                if (safePath === "/" || safePath === "\\") safePath = "/index.html";

                const filePath = path.join(distDir, safePath);
                if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
                    const ext = path.extname(filePath).toLowerCase();
                    res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
                    fs.createReadStream(filePath).pipe(res);
                } else {
                    const indexPath = path.join(distDir, "index.html");
                    res.writeHead(200, { "Content-Type": "text/html" });
                    fs.createReadStream(indexPath).pipe(res);
                }
            } catch (err) {
                res.writeHead(500);
                res.end("Server error: " + err.message);
            }
        });

        server.listen(0, "127.0.0.1", () => {
            localServer = server;
            resolve(server.address().port);
        });

        server.on("error", reject);
    });
}

async function createWindow() {
    mainWindow = new BrowserWindow({
        title: "Time Management",
        width: 390,
        height: 640,
        minWidth: 200,
        minHeight: 70,
        frame: false,
        alwaysOnTop: true, // Always float on top of all screens
        backgroundColor: "#090D16",
        resizable: true,
        minimizable: true,
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    // Ensure it restores on top after being minimized
    mainWindow.on("restore", () => {
        if (mainWindow) {
            mainWindow.setAlwaysOnTop(true, "screen-saver");
        }
    });

    // Broadcast window resize to frontend
    mainWindow.on("resize", () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            const [width, height] = mainWindow.getSize();
            mainWindow.webContents.send("window-resized", { width, height });
        }
    });

    const distDir = path.join(__dirname, "..", "dist");

    if (process.env.ELECTRON_START_URL) {
        mainWindow.loadURL(process.env.ELECTRON_START_URL);
    } else if (fs.existsSync(path.join(distDir, "index.html"))) {
        const port = await startLocalServer(distDir);
        mainWindow.loadURL(`http://127.0.0.1:${port}`);
    } else {
        mainWindow.loadURL("http://localhost:8081");
    }

    mainWindow.on("closed", () => {
        mainWindow = null;
        if (localServer) {
            localServer.close();
            localServer = null;
        }
    });
}

// IPC Handlers for custom titlebar controls
ipcMain.on("minimize-window", () => {
    if (mainWindow) mainWindow.minimize();
});

ipcMain.on("close-window", () => {
    if (mainWindow) mainWindow.close();
});

ipcMain.handle("toggle-always-on-top", () => {
    if (!mainWindow) return false;
    const current = mainWindow.isAlwaysOnTop();
    const nextState = !current;
    mainWindow.setAlwaysOnTop(nextState, "screen-saver");
    return nextState;
});

ipcMain.handle("get-always-on-top", () => {
    return mainWindow ? mainWindow.isAlwaysOnTop() : true;
});

ipcMain.on("notify-time-up", () => {
    if (mainWindow) {
        mainWindow.flashFrame(true);
        mainWindow.show();
        mainWindow.focus();
        mainWindow.setAlwaysOnTop(true, "screen-saver");
    }
});

ipcMain.on("set-window-size", (event, { width, height }) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        try {
            const bounds = mainWindow.getBounds();
            const currentDisplay = screen.getDisplayMatching(bounds);
            const workArea = currentDisplay ? currentDisplay.workArea : { x: 0, y: 0, width: 1920, height: 1080 };

            let newX = bounds.x;
            let newY = bounds.y;

            // Ensure window stays within screen workarea boundary
            if (newX + width > workArea.x + workArea.width) {
                newX = workArea.x + workArea.width - width;
            }
            if (newY + height > workArea.y + workArea.height) {
                newY = workArea.y + workArea.height - height;
            }
            if (newX < workArea.x) newX = workArea.x;
            if (newY < workArea.y) newY = workArea.y;

            mainWindow.setBounds({
                x: Math.round(newX),
                y: Math.round(newY),
                width: Math.round(width),
                height: Math.round(height),
            });
        } catch (e) {
            mainWindow.setSize(Math.round(width), Math.round(height));
        }
    }
});

if (gotTheLock) {
    app.whenReady().then(createWindow);
}

app.on("window-all-closed", () => {
    if (localServer) {
        localServer.close();
        localServer = null;
    }
    if (process.platform !== "darwin") {
        app.quit();
    }
});

app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
