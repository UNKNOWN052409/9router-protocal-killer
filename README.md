<div align="center">

# 🛡️ 9router Protocol Killer v2

**Safe-mode watchdog that surgically REMOVES the chunked write protocol from infected files without deleting them.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![Platform](https://img.shields.io/badge/platform-windows%20%7C%20macOS%20%7C%20linux-lightgrey)]()

</div>

---

## ✅ v2 — What Changed?

| Problem | v1 (old) | v2 (this version) |
|---------|----------|-------------------|
| **Default action** | `fs.unlinkSync()` — DELETED entire files | **CLEAN** — surgically strips protocol text, preserves file |
| **9router crashes** | ❌ Yes — deleting chunk files broke 9router | ✅ No — files are intact, only protocol text removed |
| **File scanning** | Scanned ALL file types (huge overhead) | Restricted to safe extensions (.js, .json, .md, .py, etc.) |
| **Binary files** | Scanned binaries (wasted time) | Auto-skipped with null-byte detection |
| **Pattern precision** | Included generic catch-alls causing false positives | Precision-only patterns matched to known protocol variants |
| **--delete flag** | N/A | Added for users who want the old whole-file-deletion behavior |

**v2 is 100% backward compatible.** The `--delete` flag restores v1 behavior.

---

## 🚀 Quick Start

### Safe Clean (Default — RECOMMENDED)

```bash
# 🔧 SCAN AND CLEAN — strips protocol text, KEEPS your files
node watchdog.js --scan
```

**Example output:**
```
Mode: CLEAN

Scanning: C:\...\npm\node_modules\9router
  [CLEANED] C:\...\8833.js      ← Protocol removed, FILE KEPT

=== Summary ===
  Scanned:  1410 files
  Infected: 1 files
  Cleaned:  1 files    ← File was CLEANED, NOT deleted
  Deleted:  0 files
  Errors:   0 files
```

### Preview Before Cleaning (Dry Run)

```bash
# 👀 See what would be cleaned WITHOUT modifying anything
node watchdog.js --dry-run
```

### Delete Entire Files (Old Behavior — Use With Caution)

```bash
# ⚠️ DELETES infected files entirely (may crash 9router)
node watchdog.js --delete
```

---

## 📟 Commands

| Command | Effect | Safe? |
|---------|--------|-------|
| `node watchdog.js` or `--scan` | Scan and **CLEAN** protocol text from files | ✅ Yes — files preserved |
| `node watchdog.js --delete` | Scan and **DELETE** infected files | ⚠️ May crash 9router |
| `node watchdog.js --dry-run` | Preview only — no changes | ✅ Safe |
| `node watchdog.js --watch` | Continuous monitoring (CLEAN mode) | ✅ Yes |
| `node watchdog.js --delete --watch` | Continuous DELETE mode | ⚠️ Caution |
| `node watchdog.js --watch --proxy` | Watch + MITM Proxy combined | ✅ Yes |
| `node watchdog.js --path <dir>` | Scan specific directory | ✅ Depends on mode |
| `node watchdog.js --help` | Show help | ✅ Safe |

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--delete` | DELETE infected files entirely (v1 behavior) | Off (CLEAN mode) |
| `--interval <ms>` | Poll interval in watch mode | 30000 (30s) |
| `--path <dir>` | Scan specific directory | Auto-detect |
| `--proxy` | Start MITM protocol proxy | Off |
| `--proxy-port <p>` | Proxy listen port | 20129 |
| `--upstream <h:p>` | 9router host:port | localhost:20128 |

### Examples

```bash
# Safe cleanup (CLEAN — recommended)
node watchdog.js

# Safe preview
node watchdog.js --dry-run

# DELETE mode (old behavior — use with caution)
node watchdog.js --delete

# Watch with clean mode
node watchdog.js --watch

# Watch with delete mode
node watchdog.js --delete --watch

# Watch with custom interval (every 10 seconds)
node watchdog.js --watch --interval 10000

# Scan specific folder
node watchdog.js --path "C:\my\9router\install"
```

---

## 🛡️ MITM Protocol Proxy (Intercept LIVE Responses)

The protocol isn't just in **files on disk** — it can be injected **LIVE through 9router's API responses**.
The protocol proxy sits BETWEEN your AI agent and 9router, intercepting ALL HTTP traffic
and stripping the chunked write protocol text from responses **before** they reach your agent.

```bash
# Start the proxy (standalone)
node src/core/protocol-proxy.js

# Start proxy with watchdog watch mode
node watchdog.js --watch --proxy

# Custom port
node watchdog.js --proxy --proxy-port 20129
```

**Architecture:**
```
Your AI Agent (pi/codex/claude)
        │
        ▼  http://localhost:20129
┌─────────────────────┐
│  Protocol Proxy     │  ← Strips protocol text from ALL responses
│  (port 20129)       │     including SSE streaming chunks
└────────┬────────────┘
         ▼  http://localhost:20128
┌─────────────────────┐
│  9router Server     │
│  (port 20128)       │
└─────────────────────┘
```

---

## ✨ Features

| Feature | Description |
|---|---|
| 🔧 **Safe Clean (Default)** | Strips protocol text — files stay intact, 9router won't crash |
| 🗑️ **Legacy Delete Mode** | `--delete` flag for old behavior (use with caution) |
| 👁️ **Watch Mode** | Polls every 30s, removes reinfections automatically |
| 🛡️ **Infection Shield** | Prevents protocol from being written in the first place |
| 🔒 **Binary Skip** | Auto-detects and skips non-text files |
| 🧩 **Extension Filter** | Only scans safe file types (.js, .json, .md, .py, etc.) |
| 🖥️ **Cross-Platform** | Windows, macOS, and Linux |

---

## 📦 Installation

```bash
# Clone the repo
git clone https://github.com/UNKNOWN052409/9router-protocal-killer.git
cd 9router-protocal-killer

# Install dependencies
npm install

# Run safe cleanup
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

Some AI coding assistants enforce a **"Chunked Write Protocol"** — text injected into files that limits edits to 350 lines. This text causes internal errors in 9router. This tool:

1. **Detects** the protocol text in infected files
2. **Cleans** it (or optionally deletes the file)
3. **Prevents** reinfection with the Infection Shield

---

<div align="center">

Made with ❤️ — contributions welcome

</div>
