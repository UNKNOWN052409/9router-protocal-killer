<div align="center">

# 🛡️ 9router Protocol Killer v2

**Safe-mode watchdog that surgically removes the chunked write protocol from infected files without deleting them.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![Platform](https://img.shields.io/badge/platform-windows%20%7C%20macOS%20%7C%20linux-lightgrey)]()

</div>

---

## ❌ v1 Problem (Old Behavior)

The old watchdog called `fs.unlinkSync()` — it **deleted entire files** when it found protocol text. This included essential 9router chunk files (e.g., `8833.js`). After deletion, 9router would crash with an **"internal error"** on startup.

**v2 fixes this:** The watchdog now **only strips the protocol text** from files. Files are preserved. 9router stays intact.

---

## 🚀 Quick Start (Windows)

### 1️⃣ One-Time Cleanup (Safe Mode)

```cmd
cd C:\Users\Unkno\9router-protocal-killer
node watchdog.js
```

Sample output:
```
Mode: CLEAN
Scanning: C:\...\npm\node_modules\9router
  [CLEANED] C:\...\8833.js      ← Protocol removed, FILE KEPT
Summary: Scanned 1410 files, Cleaned 1 files, Deleted 0 files
```

### 2️⃣ Run Watchdog Continuously (Background)

Double-click `watchdog-start.bat`, or run:

```powershell
Start-Process -WindowStyle Hidden -FilePath "node" -ArgumentList "C:\Users\Unkno\9router-protocal-killer\watchdog.js --watch"
```

The watchdog will **check all files every 30 seconds** and automatically clean any new protocol infections.

### 3️⃣ Auto-Start on Boot

Place `watchdog-start.bat` (or a shortcut to it) in your **Startup folder**:
1. Press `Win + R`, type `shell:startup`, press Enter
2. Create a shortcut to `watchdog-start.bat` in that folder

Or run the PowerShell script once:
```powershell
powershell -ExecutionPolicy Bypass -File "C:\Users\Unkno\9router-protocal-killer\watchdog-start.ps1"
```

---

## 📟 Commands

| Command | Description | Safe? |
|---------|-------------|-------|
| `node watchdog.js` | Scan and **CLEAN** protocol text from files | ✅ Files preserved |
| `node watchdog.js --dry-run` | Preview only — no modifications | ✅ 100% safe |
| `node watchdog.js --watch` | Run in background, auto-clean every 30s | ✅ Best option |
| `node watchdog.js --delete` | **⚠️ Legacy mode** — delete entire infected files | ❌ May crash 9router |
| `node watchdog.js --help` | Show help | ✅ |

| Option | Description | Default |
|--------|-------------|---------|
| `--interval <ms>` | Poll interval in watch mode | 30000 (30s) |
| `--path <dir>` | Scan a specific directory | Auto-detect |
| `--proxy` | Start MITM protocol proxy | Off |
| `--proxy-port <p>` | Proxy listen port | 20129 |
| `--upstream <h:p>` | 9router host:port | localhost:20128 |

---

## 🪟 Windows Activation Methods

### Method 1: Double-Click (Simplest)
Double-click `watchdog-start.bat` — a visible console window opens and watchdog runs.

### Method 2: PowerShell (Hidden Window)
```powershell
cd C:\Users\Unkno\9router-protocal-killer
.\watchdog-start.ps1
```
This starts watchdog as a **hidden background process** with no visible window. PID is saved to `%TEMP%\9router-watchdog.pid`.

### Method 3: Task Scheduler (Automatic on Every Boot)
```powershell
schtasks /create /tn "9routerProtocolKiller" /tr "node C:\Users\Unkno\9router-protocal-killer\watchdog.js --watch" /sc onlogon /ru %USERNAME% /f
```
Watchdog will start automatically every time you log into Windows.

---

## 🛡️ Features

| Feature | Description |
|---------|-------------|
| 🔧 **Safe Clean (Default)** | Strips only the protocol text — all file content preserved |
| 🗑️ **Delete Mode** | `--delete` flag restores old behavior (risky) |
| 👁️ **Watch Mode** | Polls every 30s, auto-cleans new infections |
| 🔒 **Binary Skip** | Automatically skips binary files (.exe, .dll, etc.) |
| 🧩 **Extension Filter** | Only scans safe file types (.js, .json, .md, .py, .html, .css, etc.) |
| 🖥️ **Cross-Platform** | Windows, macOS, and Linux |

---

## 📦 Installation

```bash
git clone https://github.com/UNKNOWN052409/9router-protocal-killer.git
cd 9router-protocal-killer
npm install
node watchdog.js
```

---

## ✅ Testing

```bash
# Quick test
node test-watchdog-simple.js

# Full end-to-end test
node test-end-to-end.js
```

---

## 🤔 Why This Exists

Some AI coding assistants (pi, Codex, Claude, etc.) inject a **"Chunked Write Protocol"** text into files that enforces a 350-line limit on edits. This text causes internal parsing errors in 9router.

**9router Protocol Killer** detects and removes this text — so 9router runs cleanly without errors.

---

## ⚙️ Project Info

```
Author:  UNKNOWN052409
License: MIT
Repo:    https://github.com/UNKNOWN052409/9router-protocal-killer
```

---

<div align="center">

**Made with ❤️ — contributions welcome**

</div>
