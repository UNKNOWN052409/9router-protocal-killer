<div align="center">

# 🛡️ 9router Protocol Killer v2

**Safe-mode watchdog — ab koi file delete nahi hogi, sirf protocol text hatega. 9router ab nahi karega crash ❌➡️✅**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![Platform](https://img.shields.io/badge/platform-windows%20%7C%20macOS%20%7C%20linux-lightgrey)]()

</div>

---

## ❌ Pehle Kya Problem Thi? (v1 — Old)

**Watchdog puri files delete kar deta tha** — `fs.unlinkSync()` — jiski wajah se 9router ka **essential chunk file** (jaise `8833.js`) delete ho jata tha. Fir 9router kholte hi **"internal error"** dekar crash ho jata tha. Isliye aapne use karna band kar diya tha.

✅ **Ab v2 me:** Watchdog **SIRF protocol text** hata deta hai, file ko **delete nahi karta**. 9router perfectly chalta rahega.

---

## 🚀 Quick Start (Windows)

### 1️⃣ Ek Baar Clean Karo (Safe Mode)

```cmd
cd C:\Users\Unkno\9router-protocal-killer
node watchdog.js
```

Output kuch aisa hoga:
```
Mode: CLEAN
Scanning: C:\...\npm\node_modules\9router
  [CLEANED] C:\...\8833.js      ← Protocol removed, FILE KEPT
Summary: Scanned 1410 files, Cleaned 1 files, Deleted 0 files
```

### 2️⃣ Watchdog Ko Active Rakho (Background Me)

**Double-click karo** `watchdog-start.bat` — ya yeh command chalao:

```powershell
Start-Process -WindowStyle Hidden -FilePath "node" -ArgumentList "C:\Users\Unkno\9router-protocal-killer\watchdog.js --watch"
```

Watchdog ab **har 30 second me** sab files check karega. Agar koi protocol text dikhega to turant clean kar dega. Aap kuch karo mat — background me chalta rahega.

### 3️⃣ Auto-Start on Boot (Jab bhi PC on karo)

`watchdog-start.bat` ko **Startup folder** me daal do:
1. `Win + R` → `shell:startup` → Enter
2. `watchdog-start.bat` ka **shortcut** bana ke waha rakh do

Ya PowerShell me yeh ek baar chalao:
```powershell
powershell -ExecutionPolicy Bypass -File "C:\Users\Unkno\9router-protocal-killer\watchdog-start.ps1"
```

---

## 📟 Saare Commands

| Command | Matlab | Safe? |
|---------|--------|-------|
| `node watchdog.js` | Scan karo + protocol text **CLEAN** karo | ✅ Files safe |
| `node watchdog.js --dry-run` | Sirf dekho kya milega — kuch mat karo | ✅ 100% safe |
| `node watchdog.js --watch` | Background me chalo, apne aap clean karte raho | ✅ Best option |
| `node watchdog.js --delete` | **⚠️ Purana tareeka** — poora file delete karo | ❌ Crash ho sakta hai |
| `node watchdog.js --help` | Help dikhao | ✅ |

---

## 🪟 Windows Me Watchdog Active Kaise Rakhein

### Tarika 1: Double-Click (Simple)
Bus `watchdog-start.bat` pe double-click karo — ek hidden CMD window me watchdog chal jayega.

### Tarika 2: PowerShell (Recommended)
```powershell
cd C:\Users\Unkno\9router-protocal-killer
.\watchdog-start.ps1
```

### Tarika 3: Task Scheduler (Advanced — Har boot pe automatic)
```powershell
schtasks /create /tn "9routerProtocolKiller" /tr "node C:\Users\Unkno\9router-protocal-killer\watchdog.js --watch" /sc onlogon /ru %USERNAME% /f
```
Iske baad **har baar PC on karte hi** watchdog apne aap start ho jayega.

---

## 🛡️ Features (Kya Kya Hai)

| Feature | Explanation |
|---------|-------------|
| 🔧 **Safe Clean (Default)** | Sirf protocol text hatao, file ko mat chhedo |
| 🗑️ **Delete Mode** | `--delete` se old behavior — but risky |
| 👁️ **Watch Mode** | Har 30s me check karo, apne aap clean karo |
| 🔒 **Binary Skip** | Binary files (.exe, .dll) skip karo — waste nahi |
| 🧩 **Extension Filter** | Sirf .js .json .md .py .html etc. check karo |
| 🖥️ **Windows, Mac, Linux** | Sab pe chalega |

---

## 📦 Installation (Pehli Baar)

```bash
git clone https://github.com/UNKNOWN052409/9router-protocal-killer.git
cd 9router-protocal-killer
npm install
node watchdog.js
```

---

## ⚙️ Developer Info

```
Author:  UNKNOWN052409
License: MIT
Repo:    https://github.com/UNKNOWN052409/9router-protocal-killer
```

---

## 🤔 Yeh Tool Kyu Hai?

Kuch AI coding assistants (jaise pi, Codex, Claude) apne responses me ek **"Chunked Write Protocol"** text inject karte hain — jo files me 350 lines ka limit enforce karta hai. Yeh text 9router ki internal parsing me **error** kar deta hai.

**9router Protocol Killer** exactly is text ko detect karta hai aur hata deta hai — taaki 9router bina kisi problem ke chalta rahe.

---

<div align="center">

**Made with ❤️ — contributions welcome**

**Sawaal ho to khulo pucho 🙏**

</div>
