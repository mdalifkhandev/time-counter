# Time Management ⏱️

A unified cross-platform Countdown Timer built with **React Native (Expo)** and **Electron.js**.
Runs on **PC Desktop (Windows / macOS / Linux)** with an **Always-On-Top floating window**, and natively on **Mobile (Android & iOS)**.

---

## 🚀 Features

- **📌 Always On Top (Desktop)**: Floats above all other applications, editors (VS Code), browsers, and full-screen games.
- **➖ Minimize to Taskbar**: Minimizes when needed, and when opened/restored, automatically resumes floating on top.
- **⏱️ Live Device Clock Sync**: Shows live PC/device local clock in real-time.
- **🎯 Target Time Picker**: Set target time (e.g. `04:00 PM`) or use quick presets (`+15m`, `+30m`, `+1h`, `+2h`).
- **⏳ Real-Time Countdown**: Displays remaining `Hours : Minutes : Seconds` counting down every second.
- **📊 Visual Progress Bar**: Real-time gauge of elapsed vs total time.
- **🔔 Audio & Visual Alarm**: Harmonious chime sounds via Web Audio API and visual card alert when time arrives.
- **📱 100% Shared Cross-Platform Code**: The exact same React Native code runs on Mobile (iOS / Android), PC (Electron), and Web.

---

## 💻 How to Run

### 1. Run on PC Desktop (Electron Always-On-Top Window)
```powershell
npm run electron
```
*(Or in dev mode with live reload: `npm run electron:dev`)*

### 2. Run on Mobile (Android / iOS via Expo)
```powershell
npm start
```
- Open **Expo Go** on your Android or iPhone and scan the QR code displayed in the terminal!

### 3. Run in Web Browser
```powershell
npm run web
```

---

## 🛠️ Tech Stack
- **Framework**: React Native 0.86, React 19, Expo SDK 57
- **Web Engine**: `react-native-web`
- **Desktop Runtime**: Electron 44
- **Audio Engine**: Web Audio API (cross-platform audio synthesizer)
