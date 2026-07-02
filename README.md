<div align="center">

# 🛡️ 9router Protocol Killer

**Automated watchdog that detects and ELIMINATES the chunked write protocol from 9router installations.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![Platform](https://img.shields.io/badge/platform-windows%20%7C%20macOS%20%7C%20linux-lightgrey)]()

</div>

---

## ⚠️ IMPORTANT: How It Works

| Command | What Happens |
|---------|--------------|
| `node watchdog.js --scan` | **SCAN + DELETE** — Finds infected files and **DELETES them immediately** |
| `node watchdog.js --dry-run` | **SCAN ONLY** — Shows infected files but does NOT delete |
| `node watchdog.js --watch` | **AUTO-DELETE** — Runs forever, deletes infections every 30 seconds |

> 🚨 **Running `--scan` WILL DELETE infected files.** Use `--dry-run` first to preview what will be removed.

---

## 📋 Table of Contents

- [Quick Start](#-quick-start)
- [Auto-Start Setup](#-auto-start-setup)
- [Commands](#-commands)
- [Features](#-features)
- [Installation](#-installation)
- [Testing](#-testing)
- [Why This Exists](#-why-this-exists)

---

## 🚀 Quick Start

### Delete All Infections (One-Time Cleanup)

```bash
# ⚡ SCAN AND DELETE all infected files
node watchdog.js --scan
```

**Example output:**
```
Scanning: C:\Users\You\AppData\Roaming\npm\node_modules\9router
  [DELETED] C:\...\8833.js

=== Summary ===
  Scanned:  614 files
  Infected: 1 files
  Deleted:  1 files    ← File was DELETED
  Errors:   0 files

All infected files have been eliminated.
```

### Preview Before Deleting (Safe Mode)

```bash
# 👀 See what would be deleted WITHOUT deleting
node watchdog.js --dry-run
```

**Example output:**
```
Scanning: C:\Users\You\AppData\Roaming\npm\node_modules\9router
  [FOUND] C:\...\8833.js      ← Found but NOT deleted

=== Summary ===
  Scanned:  614 files
  Infected: 1 files
  Deleted:  0 files    ← Nothing deleted (dry-run)
  Errors:   0 files
```

### Continuous Auto-Protection

```bash
# 🔄 Run forever, auto-delete new infections
node watchdog.js --watch
```

---

## 🖥️ Auto-Start Setup

**Want the watchdog to start automatically when 9router runs?** Use the auto-start service:

### Windows (PowerShell)

```powershell
# Run as Administrator
node bin/service.js --install
```

This creates a Windows Scheduled Task that:
- ✅ Starts when 9router starts
- ✅ Runs in the background
- ✅ Auto-restarts if it crashes
- ✅ Scans every 30 seconds

### Manual Auto-Start (Without Service)

Add to your PowerShell profile (`$PROFILE`):

```powershell
# Add to $PROFILE
Start-Process -NoNewWindow -FilePath "node" -ArgumentList "C:\path\to\watchdog.js --watch"
```

### Check Service Status

```bash
node bin/service.js --status
```

### Uninstall Service

```bash
node bin/service.js --uninstall
```

---

## 📟 Commands

| Command | Effect | Deletes Files? |
|---------|--------|----------------|
| `node watchdog.js --scan` | Scan all 9router installations | ✅ **YES** |
| `node watchdog.js --dry-run` | Preview infected files only | ❌ No |
| `node watchdog.js --watch` | Continuous monitoring | ✅ **YES** (every 30s) |
| `node watchdog.js --path <dir>` | Scan specific directory | Depends on flag |
| `node watchdog.js --help` | Show help | N/A |

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--interval <ms>` | Poll interval in watch mode | 30000 (30s) |
| `--path <dir>` | Scan specific directory | Auto-detect |

### Examples

```bash
# Quick cleanup
node watchdog.js --scan

# Safe preview
node watchdog.js --dry-run

# Watch with custom interval (every 10 seconds)
node watchdog.js --watch --interval 10000

# Scan specific folder
node watchdog.js --scan --path "C:\my\9router\install"
```

---

## ✨ Features

| Feature | Description |
|---|---|
| 🔍 **Auto-Detect** | Finds 9router via npm global, nvm, asdf, Volta, pnpm, Docker |
| 🗑️ **Auto-Delete** | Deletes infected files immediately when found |
| 👁️ **Watch Mode** | Polls every 30s, kills reinfections automatically |
| 🛡️ **Infection Shield** | Prevents protocol from being written in the first place |
| 🖥️ **Cross-Platform** | Windows, macOS, and Linux |
| ⚙️ **Auto-Start** | Install as a service that starts with 9router |

---

## 📦 Installation

```bash
# Clone the repo
git clone https://github.com/UNKNOWN052409/9router-protocal-killer.git
cd 9router-protocal-killer

# Install dependencies
npm install

# Run cleanup
node watchdog.js --scan
```

---

## 🛡️ Infection Shield

Runtime protection that intercepts file writes:

```js
const Shield = require('./src/core/shield');
const shield = new Shield();
shield.activate();   // All fs writes now protected
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

Some AI coding assistants enforce a **"Chunked Write Protocol"** — text injected into files that limits edits to 350 lines. This tool:

1. **Detects** the protocol text in infected files
2. **Deletes** those files immediately
3. **Prevents** reinfection with the Infection Shield

---

<div align="center">

Made with ❤️ — contributions welcome

</div>
