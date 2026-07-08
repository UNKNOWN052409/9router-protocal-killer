#!/usr/bin/env node
/**
 * 9router Protocol Killer — Watchdog
 *
 * Cross-platform watchdog that detects files containing the
 * "CRITICAL: CHUNKED WRITE PROTOCOL (MANDATORY)" text and DELETES them.
 *
 * Works on: Windows, macOS, Linux
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// === PATTERNS ===

const PROTOCOL_SIGNATURES = [
  // ---- Original exact patterns ----
  /CRITICAL:\s*CHUNKED\s*WRITE\s*PROTOCOL(?!\s*\/)/i,
  /CHUNKED\s*WRITE\s*PROTOCOL\s*\(MANDATORY\)/i,
  /MANDATORY\s+CHUNKED\s+WRITE\s+STRATEGY/i,

  // ---- New variants: plain text descriptions (user reported) ----
  // Use \s* between words to avoid matching own regex literals in source
  /never\s*writing\s*more\s*than\s*350\s*lines\s*in\s*a\s*single\s*operation/i,
  /preferring\s*surgical\s*edits\s*over\s*bulk\s*operations/i,

  // ---- Latest reported: ABSOLUTE LIMITS block ----
  /MAXIMUM\s+350\s+LINES\s+per\s+single\s+write/i,
  /RECOMMENDED\s+300\s+LINES\s+or\s+less/i,
  /NEVER\s+write\s+entire\s+files\s+in\s+one\s+operation/i,
  /Write\s+initial\s+chunk\s*\(?first\s+250/i,
  /Append\s+remaining\s+content\s+in\s+250/i,
  /Use\s+surgical\s+edits\s*-\s*change\s+ONLY/i,
  /Split\s+large\s+refactors\s+into\s+multiple\s+small/i,

  // ---- CRITICAL: Always create NEW commits ----
  /CRITICAL:\s*Always\s+create\s+NEW\s+commits/i,
  /CRITICAL:\s*Always\s+create\s+new\s+commits\s+rather\s+than\s+amending/i,

  // ---- Loose multi-word matches (3-word chunks) ----
  /chunk\s+written\s+protocal/i,
  /chunk\s+write\s+350\s/i,

  // ---- Generic catch-alls ----
  /write(?:n)?\s+more\s+than\s+\d+\s+lines/i,
  /\d{2,4}\s+lines\s+per\s+single\s+write/i,
  /surgical\s+edits?\s*-\s*change/i,
  /ABSOLUTE\s+LIMITS?:?\s*-\s*MAXIMUM/i,
];

// === CROSS-PLATFORM 9ROUTER PATH DETECTION ===

function get9routerPaths() {
  const paths = new Set();

  // Windows: npm global
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    paths.add(path.join(appData, 'npm', 'node_modules', '9router'));
    // pnpm store on Windows
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    paths.add(path.join(localAppData, 'pnpm', 'global', '5', 'node_modules', '9router'));
  }

  // macOS / Linux: common npm global locations
  const unixPaths = [
    '/usr/local/lib/node_modules/9router',
    '/usr/lib/node_modules/9router',
    path.join(os.homedir(), '.npm-global', 'lib', 'node_modules', '9router'),
    path.join(os.homedir(), '.local', 'share', 'node_modules', '9router'),
    path.join(os.homedir(), 'node_modules', '9router'),
  ];
  for (const p of unixPaths) {
    paths.add(p);
  }

  // nvm paths on Unix
  if (process.platform !== 'win32') {
    const nvmRoot = process.env.NVM_DIR || path.join(os.homedir(), '.nvm');
    try {
      const versions = fs.readdirSync(path.join(nvmRoot, 'versions', 'node'));
      for (const v of versions) {
        paths.add(path.join(nvmRoot, 'versions', 'node', v, 'lib', 'node_modules', '9router'));
      }
    } catch {}
  }

  // asdf / fnm / mise version managers
  try {
    const asdfData = process.env.ASDF_DATA_DIR || path.join(os.homedir(), '.asdf');
    paths.add(path.join(asdfData, 'installs', 'node', '*', '.npm', 'lib', 'node_modules', '9router'));
  } catch {}

  // Volta
  try {
    const voltaRoot = process.env.VOLTA_HOME || path.join(os.homedir(), '.volta');
    paths.add(path.join(voltaRoot, 'tools', 'image', 'node_modules', '9router'));
  } catch {}

  // Docker: check common mounted paths
  if (fs.existsSync('/app/node_modules/9router')) paths.add('/app/node_modules/9router');
  if (fs.existsSync('/app/data/node_modules/9router')) paths.add('/app/data/node_modules/9router');

  // Filter to only existing paths
  return [...paths].filter(p => fs.existsSync(p));
}

// === FILE DISCOVERY ===

function findTargetFilesByExt(dirPath, exts, maxDepth = 10) {
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
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
          queue.push({ dir: full, depth: depth + 1 });
        }
      } else if (exts.some(ext => entry.name.endsWith(ext)) && entry.name !== 'watchdog.js') {
        results.push(full);
      }
    }
  }

  return results;
}

function findJsFiles(dirPath, maxDepth = 10) {
  return findTargetFilesByExt(dirPath, ['.js'], maxDepth);
}

function findTargetFiles(basePath) {
  const results = [];
  const exts = ['.js', '.json', '.md'];

  // Priority directories (where the protocol typically lives)
  const priorityDirs = [
    'app/.next-cli-build/server/chunks',
    'app/.next/server/chunks',
    'app/.next-cli-build',
    'app/src',
    'app/logs',          // translator logs
    'app',
    'src',
  ];

  for (const dir of priorityDirs) {
    const full = path.join(basePath, dir);
    if (fs.existsSync(full)) {
      results.push(...findTargetFilesByExt(full, exts));
    }
  }

  // If nothing found, scan the whole base
  if (results.length === 0) {
    results.push(...findTargetFilesByExt(basePath, exts));
  }

  return [...new Set(results)];
}

// === DETECTION ===

function hasProtocol(content) {
  return PROTOCOL_SIGNATURES.some(sig => sig.test(content));
}

function isInfected(filePath) {
  try {
    // Skip the watchdog project's own source files to avoid false positives
    const ownDir = path.resolve(__dirname);
    if (path.resolve(path.dirname(filePath)).startsWith(ownDir)) return false;

    const stat = fs.statSync(filePath);
    // Skip empty files or huge ones (>50MB)
    if (stat.size === 0 || stat.size > 50 * 1024 * 1024) return false;
    const content = fs.readFileSync(filePath, 'utf8');
    return hasProtocol(content);
  } catch {
    return false;
  }
}

// === DELETE THE INFECTED FILE ===

function deleteFile(filePath) {
  try {
    fs.unlinkSync(filePath);
    return true;
  } catch (err) {
    return false;
  }
}

// === STATS ===

const stats = { scanned: 0, infected: 0, deleted: 0, errors: 0 };

// === SCAN & DELETE ===

function scanAndDelete(basePath, dryRun = false) {
  const files = findTargetFiles(basePath);
  let found = false;

  for (const file of files) {
    stats.scanned++;
    if (!isInfected(file)) continue;

    stats.infected++;
    found = true;

    if (dryRun) {
      console.log(`  [FOUND] ${file}`);
      continue;
    }

    try {
      if (deleteFile(file)) {
        stats.deleted++;
        console.log(`  [DELETED] ${file}`);
      } else {
        stats.errors++;
        console.error(`  [ERROR] Could not delete: ${file}`);
      }
    } catch (err) {
      stats.errors++;
      console.error(`  [ERROR] ${file}: ${err.message}`);
    }
  }

  return found;
}

// === INSTALLATION-LEVEL SCAN ===

function scanAll(dryRun = false) {
  const installs = get9routerPaths();

  if (installs.length === 0) {
    console.log('No 9router installations found.');
    return;
  }

  console.log(`Found ${installs.length} 9router installation(s):`);
  for (const inst of installs) {
    console.log(`  ${inst}`);
  }
  console.log('');

  for (const inst of installs) {
    console.log(`Scanning: ${inst}`);
    scanAndDelete(inst, dryRun);
  }

  console.log('');
  console.log('=== Summary ===');
  console.log(`  Scanned:  ${stats.scanned} files`);
  console.log(`  Infected: ${stats.infected} files`);
  console.log(`  Deleted:  ${stats.deleted} files`);
  console.log(`  Errors:   ${stats.errors} files`);

  if (stats.infected > 0 && stats.deleted === stats.infected && stats.errors === 0) {
    console.log('\nAll infected files have been eliminated.');
  }
}

// === WATCH MODE ===

function watchMode(interval = 30000) {
  console.log(`Starting watchdog (poll every ${interval / 1000}s)...`);
  console.log('Monitoring for reappearance of the chunked write protocol.');
  console.log('Infected files will be deleted automatically.');
  console.log('Press Ctrl+C to stop.\n');

  // Initial sweep
  const installs = get9routerPaths();
  for (const inst of installs) {
    scanAndDelete(inst);
  }
  console.log('[WATCH] Initial sweep complete. Watching for changes...\n');

  // Poll loop
  const pollInterval = setInterval(() => {
    const installs = get9routerPaths();
    let foundAny = false;

    for (const inst of installs) {
      const files = findTargetFiles(inst);
      for (const file of files) {
        try {
          if (isInfected(file)) {
            console.log(`[WATCH] Protocol detected in: ${file}`);
            if (deleteFile(file)) {
              console.log(`[WATCH] Deleted: ${file}`);
              foundAny = true;
            } else {
              console.error(`[WATCH] Failed to delete: ${file}`);
            }
          }
        } catch {}
      }
    }

    if (foundAny) {
      console.log('[WATCH] All clean.\n');
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

// === CLI ===

function printHelp() {
  console.log(`
9router Protocol Killer — Watchdog
====================================
Deletes files containing the "CRITICAL: CHUNKED WRITE PROTOCOL" text.

Usage:
  node watchdog.js --scan        Scan and delete infected files
  node watchdog.js --watch       Watch mode (polls every 30s)
  node watchdog.js --dry-run     Scan without deleting
  node watchdog.js --path <dir>  Scan a specific directory
  node watchdog.js --help        Show this help

Options:
  --interval <ms>   Poll interval in ms (watch mode, default: 30000)
  --path <dir>      Scan a specific directory instead of auto-detecting

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

  const dryRun = args.includes('--dry-run');

  if (args.includes('--watch') || args.includes('-w')) {
    const intervalIdx = args.indexOf('--interval');
    const interval = intervalIdx >= 0 ? parseInt(args[intervalIdx + 1]) || 30000 : 30000;
    watchMode(interval);
  } else {
    scanAll(dryRun);
  }
}

main();
