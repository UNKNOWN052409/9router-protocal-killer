<div align="center">

# 🛡️ 9router Protocol Killer

**Automated watchdog that detects and eliminates the chunked write protocol from 9router installations.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![Platform](https://img.shields.io/badge/platform-windows%20%7C%20macOS%20%7C%20linux-lightgrey)]()

</div>

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Features](#-features)
- [Installation](#-installation)
- [Quick Start](#-quick-start)
- [Usage](#-usage)
- [Commands](#-commands)
- [Infection Shield](#-infection-shield)
- [Testing](#-testing)
- [Why This Exists](#-why-this-exists)

---

## 📌 Overview

The **9router Protocol Killer** is a cross-platform watchdog that scans your 9router installation for files containing the *"CRITICAL: CHUNKED WRITE PROTOCOL (MANDATORY)"* text and **deletes them** instantly. It also includes an **Infection Shield** that prevents the protocol from being written to any file in the first place.

> ⚡ **One command, zero trace.**

---

## ✨ Features

| Feature | Description |
|---|---|
| 🔍 **Auto-Detect** | Finds 9router installations via npm global, nvm, asdf, Volta, pnpm, and Docker |
| 🗑️ **Auto-Delete** | Deletes infected files on sight — not just cleans them |
| 👁️ **Watch Mode** | Polls every 30s and kills reinfections (e.g., after updates) |
| 🛡️ **Infection Shield** | Wraps `fs.writeFile` to strip protocol before it's ever written |
| 🖥️ **Cross-Platform** | Windows, macOS, and Linux |
| ⚙️ **System Service** | Install as a permanent watchdog via PowerShell, LaunchDaemon, or systemd |

---

## 📦 Installation

```bash
# Clone the repo
git clone https://github.com/UNKNOWN052409/9router-protocal-killer.git
cd 9router-protocal-killer

# No dependencies needed — it's pure Node.js
```

> No npm install required. It uses only built-in Node.js modules (`fs`, `path`, `child_process`).

---

## 🚀 Quick Start

### Scan all 9router installations

```bash
node watchdog.js --scan
```

### Watch mode (keeps running)

```bash
node watchdog.js --watch
```

### Dry run (see what would be deleted)

```bash
node watchdog.js --dry-run
```

---

## 🧰 Usage

### Scan a specific directory

```bash
node watchdog.js --scan --path ./my-9router-folder
```

### Custom poll interval (watch mode)

```bash
node watchdog.js --watch --interval 10000   # every 10 seconds
```

### Help

```bash
node watchdog.js --help
```

---

## 📟 Commands

```
Usage:
  node watchdog.js --scan        Scan and delete infected files
  node watchdog.js --watch       Watch mode (polls every 30s)
  node watchdog.js --dry-run     Scan without deleting
  node watchdog.js --path <dir>  Scan a specific directory
  node watchdog.js --help        Show this help

Options:
  --interval <ms>   Poll interval in ms (watch mode, default: 30000)
  --path <dir>      Scan a specific directory instead of auto-detecting
```

---

## 🛡️ Infection Shield

The shield is a runtime protection layer that intercepts all file write operations:

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│  Any Process  │ ──▶ │  FS Write    │ ──▶ │  Protocol?   │
│  writing file │     │  Intercepted │     │  Check       │
└─────────────┘     └──────────────┘     └──────┬───────┘
                                                │
                        ┌───────────────────────┼──────────┐
                        ▼                       ▼          │
                 ┌──────────────┐       ┌──────────────┐    │
                 │  Yes: Strip  │       │  No: Pass    │    │
                 │  Protocol    │       │  Through     │    │
                 └──────┬───────┘       └──────┬───────┘    │
                        └──────────┬───────────┘            │
                                   ▼                        │
                          ┌──────────────┐                  │
                          │  Write Clean │                  │
                          │  File        │                  │
                          └──────────────┘                  │
```

Activate it in your script:

```js
const Shield = require('./src/core/shield');
const shield = new Shield();
shield.activate();   // Now all fs writes are protected
```

---

## ✅ Testing

```bash
# Quick test
node test-watchdog-simple.js

# Full end-to-end test (8 tests)
node test-end-to-end.js
```

**Expected output:**
```
Passed: 8
Warnings: 0
Failed: 0
Success Rate: 100%
All critical tests passed!
```

---

## 🤔 Why This Exists

Some AI coding assistants enforce a **"Chunked Write Protocol"** — a text injected into files that limits edits to 350 lines maximum. This tool detects that protocol text and **eliminates it**, so no tool can enforce arbitrary restrictions on your codebase.

The Infection Shield takes it one step further: it prevents the protocol from ever being written, acting as a permanent barrier against reinfection.

---

<div align="center">

Made with ❤️ — contributions welcome

</div>
