#!/usr/bin/env node
/**
 * 9router Protocol Killer — Watchdog (v2 — SAFE CLEAN mode)
 *
 * Cross-platform watchdog that detects and SURGICALLY REMOVES the
 * "CRITICAL: CHUNKED WRITE PROTOCOL (MANDATORY)" text from files.
 *
 * DEFAULT BEHAVIOR: CLEAN (regex strip the protocol text, preserve everything else)
 * OLD BEHAVIOR:     --delete flag (whole-file deletion, use with caution)
 *
 * Works on: Windows, macOS, Linux
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const ProtocolProxy = require('./src/core/protocol-proxy');

// ═══════════════════════════════════════════════════════════════════════════════
// PROTOCOL PATTERNS — precise-only, no false-positive catch-alls
// ═══════════════════════════════════════════════════════════════════════════════

const PROTOCOL_SIGNATURES = [
  // ---- Core unique phrases ----
  /CRITICAL:\s*CHUNKED\s*WRITE\s*PROTOCOL(?!\s*\/)/i,
  /CHUNKED\s*WRITE\s*PROTOCOL\s*\(MANDATORY\)/i,
  /MANDATORY\s+CHUNKED\s+WRITE\s+STRATEGY/i,

  // ---- Variant spellings (user reported) ----
  /chunk\s+written\s+protocal/i,
  /chunk\s+write\s+350\s/i,

  // ---- ABSOLUTE LIMITS block (specific only) ----
  /MAXIMUM\s+350\s+LINES\s+per\s+single\s+write/i,
  /RECOMMENDED\s+300\s+LINES\s+or\s+less/i,
  /NEVER\s+write\s+entire\s+files\s+in\s+one\s+operation/i,
  /Write\s+initial\s+chunk\s*\(?first\s+250/i,
  /Append\s+remaining\s+content\s+in\s+250/i,
  /Use\s+surgical\s+edits\s*-\s*change\s+ONLY/i,
  /Split\s+large\s+refactors\s+into\s+multiple\s+small/i,

  // ---- Plain-text descriptions ----
  /never\s*writing\s*more\s*than\s*350\s*lines\s*in\s*a\s*single\s*operation/i,
  /preferring\s*surgical\s*edits\s*over\s*bulk\s*operations/i,

  // ---- CRITICAL: Always create NEW commits ----
  /CRITICAL:\s*Always\s+create\s+NEW\s+commits/i,
  /CRITICAL:\s*Always\s+create\s+new\s+commits\s+rather\s+than\s+amending/i,

  // ---- ABSOLUTE LIMITS header (tight anchor) ----
  /ABSOLUTE\s+LIMITS:?\s*-\s*MAXIMUM\s+350/i,
];

// ═══════════════════════════════════════════════════════════════════════════════
// SAFE FILE FILTERS — prevent scanning binaries or irrelevant dirs
// ═══════════════════════════════════════════════════════════════════════════════

const SAFE_EXTENSIONS = new Set([
  '.js', '.ts', '.mjs', '.cjs', '.jsx', '.tsx',
  '.json', '.md', '.yaml', '.yml', '.txt', '.py',
  '.sh', '.bat', '.ps1', '.env', '.cfg', '.conf',
  '.html', '.css', '.xml',
]);

const EXCLUDED_DIRS = new Set([
  'node_modules', '.git', '.next', '.next-cli-build',
  'logs', 'test-output', 'coverage', 'dist', '.cache',
]);

// ═══════════════════════════════════════════════════════════════════════════════
// CROSS-PLATFORM 9ROUTER PATH DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

function getAllTargetPaths() {
  const paths = new Set();
  const homedir = os.homedir();
  const appData = process.env.APPDATA || path.join(homedir, 'AppData', 'Roaming');
  const localAppData = process.env.LOCALAPPDATA || path.join(homedir, 'AppData', 'Local');

  // ---- 9router npm installs ----
  const nineRouterPaths = [
    path.join(appData, 'npm', 'node_modules', '9router'),
    path.join(localAppData, 'pnpm', 'global', '5', 'node_modules', '9router'),
    '/usr/local/lib/node_modules/9router',
    '/usr/lib/node_modules/9router',
    path.join(homedir, '.npm-global', 'lib', 'node_modules', '9router'),
    path.join(homedir, '.local', 'share', 'node_modules', '9router'),
    path.join(homedir, 'node_modules', '9router'),
  ];
  for (const p of nineRouterPaths) paths.add(p);

  // ---- Coding agents / IDEs ----
  const toolPaths = [
    path.join(appData, 'Kiro'),
    path.join(appData, 'npm', 'node_modules', '@openai', 'codex'),
    path.join(appData, 'npm', 'node_modules', '@openai'),
    path.join(localAppData, 'Claude-3p', 'claude-code'),
    path.join(appData, 'Claude', 'claude-code'),
    path.join(localAppData, 'claude-cli-nodejs'),
    path.join(appData, 'Cursor'),
    path.join(appData, 'npm', 'node_modules', 'oh-my-claude-sisyphus'),
    path.join(appData, 'npm', 'node_modules', '@earendil-works'),
  ];
  for (const p of toolPaths) paths.add(p);

  return [...paths].filter(p => fs.existsSync(p));
}

function get9routerPaths() {
  const homedir = os.homedir();
  const appData = process.env.APPDATA || path.join(homedir, 'AppData', 'Roaming');
  const localAppData = process.env.LOCALAPPDATA || path.join(homedir, 'AppData', 'Local');
  const paths = [
    path.join(appData, 'npm', 'node_modules', '9router'),
    path.join(localAppData, 'pnpm', 'global', '5', 'node_modules', '9router'),
  ];
  return paths.filter(p => fs.existsSync(p));
}

// ═══════════════════════════════════════════════════════════════════════════════
// FILE DISCOVERY — extension & directory safe
// ═══════════════════════════════════════════════════════════════════════════════

function isSafeTargetFile(entry, fullPath) {
  const ext = path.extname(entry.name).toLowerCase();
  if (ext && !SAFE_EXTENSIONS.has(ext)) return false;
  return true;
}

function isExcludedDir(dirName) {
  return EXCLUDED_DIRS.has(dirName) || dirName.startsWith('.');
}

function isBinaryFile(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(512);
    const bytesRead = fs.readSync(fd, buffer, 0, 512, 0);
    fs.closeSync(fd);
    for (let i = 0; i < bytesRead; i++) {
      if (buffer[i] === 0) return true; // null byte → binary
    }
    return false;
  } catch {
    return true; // treat unreadable as binary to be safe
  }
}

function findTargetFiles(dirPath, maxDepth = 10) {
  const results = [];
  const queue = [{ dir: dirPath, depth: 0 }];
  const seen = new Set();

  while (queue.length > 0) {
    const { dir, depth } = queue.shift();
    if (depth > maxDepth) continue;
    if (!fs.existsSync(dir)) continue;
    if (seen.has(dir)) continue;
    seen.add(dir);

    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const full = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!isExcludedDir(entry.name)) {
          queue.push({ dir: full, depth: depth + 1 });
        }
        continue;
      }

      if (!entry.isFile()) continue;

      // Skip non-safe extensions
      if (!isSafeTargetFile(entry, full)) continue;

      // Skip non-text binary files
      if (isBinaryFile(full)) continue;

      // Skip the watchdog project's own files to avoid false positives
      const ownDir = path.resolve(__dirname);
      if (path.resolve(path.dirname(full)).startsWith(ownDir)) continue;

      results.push(full);
    }
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

function hasProtocol(content) {
  return PROTOCOL_SIGNATURES.some(sig => sig.test(content));
}

function isInfected(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size === 0 || stat.size > 50 * 1024 * 1024) return false;
    const content = fs.readFileSync(filePath, 'utf8');
    return hasProtocol(content);
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLEAN (default) — surgically strip protocol text, preserve everything else
// ═══════════════════════════════════════════════════════════════════════════════

function cleanFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    const original = content;

    for (const sig of PROTOCOL_SIGNATURES) {
      content = content.replace(sig, '');
    }

    if (content === original) return false; // nothing changed

    // Only clean up triple+ newlines — never collapse JSON/single-line content
    if (content.includes('\n')) {
      content = content.replace(/\n{3,}/g, '\n\n');
    }

    fs.writeFileSync(filePath, content, 'utf8');
    return true;
  } catch (err) {
    console.error(`  [ERROR] Could not clean: ${filePath} — ${err.message}`);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DELETE (legacy, opt-in via --delete flag) — removes whole file
// ═══════════════════════════════════════════════════════════════════════════════

function deleteFile(filePath) {
  try {
    fs.unlinkSync(filePath);
    return true;
  } catch (err) {
    console.error(`  [ERROR] Could not delete: ${filePath} — ${err.message}`);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATS
// ═══════════════════════════════════════════════════════════════════════════════

const stats = { scanned: 0, infected: 0, cleaned: 0, deleted: 0, errors: 0 };

// ═══════════════════════════════════════════════════════════════════════════════
// SCAN & CLEAN (default) / DELETE (with --delete flag)
// ═══════════════════════════════════════════════════════════════════════════════

function processInfectedFile(filePath, deleteMode, dryRun = false) {
  stats.infected++;

  if (dryRun) {
    console.log(`  [FOUND] ${filePath}`);
    return true;
  }

  if (deleteMode) {
    if (deleteFile(filePath)) {
      stats.deleted++;
      console.log(`  [DELETED] ${filePath}`);
      return true;
    }
    stats.errors++;
    return false;
  }

  // DEFAULT: CLEAN mode
  if (cleanFile(filePath)) {
    stats.cleaned++;
    console.log(`  [CLEANED] ${filePath}`);
    return true;
  }
  stats.errors++;
  return false;
}

function scanTarget(basePath, deleteMode = false, dryRun = false) {
  const files = findTargetFiles(basePath);
  let found = false;

  for (const file of files) {
    stats.scanned++;
    if (!isInfected(file)) continue;

    if (processInfectedFile(file, deleteMode, dryRun)) {
      found = true;
    }
  }

  return found;
}

// ═══════════════════════════════════════════════════════════════════════════════
// INSTALLATION-LEVEL SCAN
// ═══════════════════════════════════════════════════════════════════════════════

function scanAll(deleteMode = false, dryRun = false) {
  const targets = getAllTargetPaths();

  if (targets.length === 0) {
    console.log('No target installations found.');
    return;
  }

  console.log(`Found ${targets.length} target(s) to scan:`);
  for (const t of targets) {
    console.log(`  ${t}`);
  }
  console.log('');

  const modeLabel = dryRun ? 'DRY RUN' : deleteMode ? 'DELETE' : 'CLEAN';
  console.log(`Mode: ${modeLabel}\n`);

  for (const t of targets) {
    console.log(`Scanning: ${t}`);
    scanTarget(t, deleteMode, dryRun);
  }

  console.log('');
  console.log('=== Summary ===');
  console.log(`  Scanned:  ${stats.scanned} files`);
  console.log(`  Infected: ${stats.infected} files`);
  console.log(`  Cleaned:  ${stats.cleaned} files`);
  console.log(`  Deleted:  ${stats.deleted} files`);
  console.log(`  Errors:   ${stats.errors} files`);

  if (deleteMode && stats.infected > 0 && stats.deleted === stats.infected && stats.errors === 0) {
    console.log('\nAll infected files have been deleted.');
  } else if (!deleteMode && stats.infected > 0 && stats.cleaned === stats.infected && stats.errors === 0) {
    console.log('\nAll infected files have been cleaned (protocol text stripped, files preserved).');
  } else if (stats.infected === 0) {
    console.log('\nNo infections found — all clear.');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// WATCH MODE
// ═══════════════════════════════════════════════════════════════════════════════

function watchMode(interval = 30000, deleteMode = false) {
  const modeLabel = deleteMode ? 'DELETE' : 'CLEAN (safe)';
  console.log(`Starting watchdog (poll every ${interval / 1000}s)...`);
  console.log(`Mode: ${modeLabel}`);
  console.log('Monitoring all known coding tools for the chunked write protocol.');
  console.log(deleteMode
    ? 'Infected files will be DELETED automatically (legacy mode).'
    : 'Infected files will be CLEANED automatically (protocol text stripped, files preserved).');
  console.log('Press Ctrl+C to stop.\n');

  // Initial sweep
  const targets = getAllTargetPaths();
  for (const t of targets) {
    scanTarget(t, deleteMode);
  }
  console.log('[WATCH] Initial sweep complete. Watching for changes...\n');

  // Poll loop
  const pollInterval = setInterval(() => {
    const targets = getAllTargetPaths();
    let foundAny = false;

    for (const t of targets) {
      const files = findTargetFiles(t);
      for (const file of files) {
        try {
          if (isInfected(file)) {
            console.log(`[WATCH] Protocol detected in: ${file}`);
            if (deleteMode) {
              if (deleteFile(file)) {
                console.log(`[WATCH] Deleted: ${file}`);
                foundAny = true;
              }
            } else {
              if (cleanFile(file)) {
                console.log(`[WATCH] Cleaned: ${file}`);
                foundAny = true;
              }
            }
          }
        } catch {}
      }
    }

    if (!foundAny) {
      console.log(`[WATCH] All clean at ${new Date().toLocaleTimeString()}.`);
    }
  }, interval);

  process.on('SIGINT', () => {
    clearInterval(pollInterval);
    console.log('\nWatchdog stopped.');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    clearInterval(pollInterval);
    process.exit(0);
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLI
// ═══════════════════════════════════════════════════════════════════════════════

function printHelp() {
  console.log(`
9router Protocol Killer — Watchdog v2 (SAFE CLEAN MODE)
=========================================================

DEFAULT behavior: SURGICALLY STRIP the protocol text from infected files.
Files are PRESERVED — only the protocol content is removed.
This prevents 9router crashes caused by deleting essential build files.

Usage:
  node watchdog.js              Scan and CLEAN infected files (safe default)
  node watchdog.js --scan       Same as above
  node watchdog.js --watch      Watch mode (polls every 30s)
  node watchdog.js --dry-run    Scan only, no modifications
  node watchdog.js --delete     DELETE infected files entirely (use with caution!)
  node watchdog.js --path <dir> Scan a specific directory
  node watchdog.js --help       Show this help

Options:
  --delete        OLD behavior: delete whole files (was causing 9router crashes)
  --interval <ms> Poll interval in ms (watch mode, default: 30000)
  --path <dir>    Scan a specific directory instead of auto-detecting
  --proxy         Start MITM protocol proxy (intercepts live API responses)
  --proxy-port <p>  Proxy listen port (default: 20129)
  --upstream <h:p>  9router upstream host:port (default: localhost:20128)

What gets scanned:
  - Safe file types: .js .ts .json .md .yaml .txt .py .sh .html .css (+ more)
  - Excluded dirs: node_modules, .git, .next, logs, test-output, etc.
  - Binary files are automatically skipped
  - Own project files are automatically skipped

What gets cleaned:
  Only text matching known CHUNKED WRITE PROTOCOL patterns.
  All other file content is 100% preserved.

Cross-platform: Works on Windows, macOS, and Linux.
  `);
}

function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    return;
  }

  if (args.includes('--path')) {
    const idx = args.indexOf('--path');
    const customPath = args[idx + 1];
    const origGet = get9routerPaths;
    get9routerPaths = () => {
      if (fs.existsSync(customPath)) return [customPath];
      console.error(`Error: path not found: ${customPath}`);
      process.exit(1);
    };
  }

  const deleteMode = args.includes('--delete');
  const dryRun = args.includes('--dry-run');

  const startProxy = args.includes('--proxy');
  const proxyPortIdx = args.indexOf('--proxy-port');
  const proxyPort = proxyPortIdx >= 0 ? parseInt(args[proxyPortIdx + 1]) || 20129 : 20129;
  const upstreamIdx = args.indexOf('--upstream');
  let upstreamHost = 'localhost';
  let upstreamPort = 20128;
  if (upstreamIdx >= 0 && args[upstreamIdx + 1]) {
    const parts = args[upstreamIdx + 1].split(':');
    upstreamHost = parts[0] || 'localhost';
    upstreamPort = parseInt(parts[1]) || 20128;
  }

  if (startProxy) {
    const proxy = new ProtocolProxy({ proxyPort, upstreamHost, upstreamPort, verbose: true });
    proxy.start().then(() => {
      console.log(`  Proxy on :${proxyPort} → ${upstreamHost}:${upstreamPort}`);
      console.log(`  Configure your AI agent to use http://localhost:${proxyPort}`);
    });
  }

  if (args.includes('--watch') || args.includes('-w')) {
    const intervalIdx = args.indexOf('--interval');
    const interval = intervalIdx >= 0 ? parseInt(args[intervalIdx + 1]) || 30000 : 30000;
    watchMode(interval, deleteMode);
  } else if (!startProxy) {
    scanAll(deleteMode, dryRun);
  }
}

if (require.main === module) {
  main();
}
