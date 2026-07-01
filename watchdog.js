#!/usr/bin/env node
/**
 * 9router Protocol Killer — Watchdog
 *
 * Scans 9router files for the "CRITICAL: CHUNKED WRITE PROTOCOL (MANDATORY)"
 * and removes it. In watch mode, monitors for changes and auto-removes it.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Patterns that identify the chunked write protocol
const PROTOCOL_PATTERNS = [
  /CRITICAL:\s*CHUNKED\s*WRITE\s*PROTOCOL/i,
  /MAXIMUM\s+350\s+LINES/i,
  /CHUNKED\s*WRITE\s*STRATEGY/i,
];

// Platform-specific 9router install paths to scan
function get9routerPaths() {
  const paths = new Set();

  // Global npm installation
  if (process.platform === 'win32') {
    paths.add(path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'npm', 'node_modules', '9router'));
  } else {
    // Unix: check common npm global locations
    paths.add('/usr/local/lib/node_modules/9router');
    paths.add('/usr/lib/node_modules/9router');
    paths.add(path.join(os.homedir(), '.npm-global', 'lib', 'node_modules', '9router'));
    paths.add(path.join(os.homedir(), '.nvm', 'versions', 'node', '*', 'lib', 'node_modules', '9router'));
  }

  // Also check npx/pnpm/yarn paths
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    paths.add(path.join(localAppData, 'pnpm', 'global', '5', 'node_modules', '9router'));
  }

  // Check the user's current installation
  const current = 'C:\\Users\\Unkno\\AppData\\Roaming\\npm\\node_modules\\9router';
  if (fs.existsSync(current)) paths.add(current);

  return [...paths].filter(p => fs.existsSync(p));
}

// Find all .js files in a 9router install
function findTargetFiles(basePath) {
  const results = [];
  const dirs = [
    'app/.next-cli-build/server/chunks',
    'app/.next/server/chunks',
    'app/src',
    'src',
  ];

  for (const dir of dirs) {
    const fullPath = path.join(basePath, dir);
    if (!fs.existsSync(fullPath)) continue;
    try {
      const files = fs.readdirSync(fullPath, { recursive: true })
        .filter(f => f.endsWith('.js'))
        .map(f => path.join(fullPath, f));
      results.push(...files);
    } catch {
      // recursive not available in older Node — fallback
      try {
        const walk = (dir) => {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (entry.name.endsWith('.js')) results.push(full);
          }
        };
        walk(fullPath);
      } catch {}
    }
  }

  // Also scan the base dir for .js files
  try {
    const walk = (dir, depth = 0) => {
      if (depth > 5) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') walk(full, depth + 1);
        else if (entry.name.endsWith('.js')) results.push(full);
      }
    };
    walk(basePath);
  } catch {}

  return [...new Set(results)];
}

// Check if a file contains protocol patterns
function hasProtocol(content) {
  return PROTOCOL_PATTERNS.some(p => p.test(content));
}

// Remove the protocol from file content
function removeProtocol(content) {
  // Pattern 1: `let i=\`...protocol...\`.trim();` → `let i=\`\`.trim();`
  const result1 = content.replace(
    /let\s+i\s*=\s*`[\s\S]*?CRITICAL:\s*CHUNKED\s*WRITE\s*PROTOCOL[\s\S]*?REMEMBER:[\s\S]*?`\s*\.trim\s*\(\s*\)\s*;?\s*/i,
    'let i=``.trim();'
  );

  if (result1 !== content) return result1;

  // Pattern 2: Alternative formatting
  const result2 = content.replace(
    /let\s+i\s*=\s*`[\s\S]*?CRITICAL:\s*CHUNKED\s*WRITE[\s\S]*?`\s*\.trim\s*\(\s*\)\s*/i,
    'let i=``.trim()'
  );

  if (result2 !== content) return result2;

  // Pattern 3: Generic - any backtick string containing "350 LINES"
  const result3 = content.replace(
    /let\s+i\s*=\s*`[\s\S]*?350\s*LINES[\s\S]*?`\s*\.trim\s*\(\s*\)\s*/i,
    'let i=``.trim()'
  );

  if (result3 !== content) return result3;

  // Pattern 4: Embedded as a string somewhere else
  const result4 = content.replace(
    /# CRITICAL: CHUNKED WRITE PROTOCOL[\s\S]*?REMEMBER: When in doubt, write LESS per operation\./g,
    ''
  );

  return result4;
}

// Stats tracking
const stats = { scanned: 0, infected: 0, cleaned: 0, errors: 0 };

// Scan and clean a single file
function scanFile(filePath, dryRun = false) {
  stats.scanned++;
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    if (!hasProtocol(content)) return false;

    stats.infected++;
    if (dryRun) {
      console.log(`  [FOUND] ${filePath}`);
      return true;
    }

    const cleaned = removeProtocol(content);
    if (cleaned === content) {
      console.log(`  [SKIP]  ${filePath} — could not remove protocol (unknown format)`);
      return false;
    }

    fs.writeFileSync(filePath, cleaned, 'utf8');
    stats.cleaned++;
    console.log(`  [CLEAN] ${filePath}`);
    return true;
  } catch (err) {
    stats.errors++;
    console.error(`  [ERROR] ${filePath}: ${err.message}`);
    return false;
  }
}

// Scan all 9router installations
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
    const files = findTargetFiles(inst);
    for (const file of files) {
      scanFile(file, dryRun);
    }
  }

  console.log('');
  console.log('=== Summary ===');
  console.log(`  Scanned:  ${stats.scanned} files`);
  console.log(`  Infected: ${stats.infected} files`);
  console.log(`  Cleaned:  ${stats.cleaned} files`);
  console.log(`  Errors:   ${stats.errors} files`);
}

// === Watch Mode ===

function watchMode(interval = 30000) {
  console.log(`Starting watchdog (poll every ${interval / 1000}s)...`);
  console.log('Press Ctrl+C to stop.\n');

  // Do an initial scan
  scanAll(false);

  // Poll for changes
  const pollInterval = setInterval(() => {
    const installs = get9routerPaths();
    let changed = false;

    for (const inst of installs) {
      const files = findTargetFiles(inst);
      for (const file of files) {
        try {
          const content = fs.readFileSync(file, 'utf8');
          if (hasProtocol(content)) {
            console.log(`[WATCH] Protocol detected in: ${file}`);
            const cleaned = removeProtocol(content);
            if (cleaned !== content) {
              fs.writeFileSync(file, cleaned, 'utf8');
              console.log(`[WATCH] Protocol removed from: ${file}`);
              changed = true;
            }
          }
        } catch {}
      }
    }

    if (changed) {
      console.log('[WATCH] All cleaned.\n');
    }
  }, interval);

  // Handle cleanup
  process.on('SIGINT', () => {
    clearInterval(pollInterval);
    console.log('\nWatchdog stopped.');
    process.exit(0);
  });
}

// === CLI ===

function printHelp() {
  console.log(`
9router Protocol Killer — Watchdog

Usage:
  node watchdog.js --scan        One-time scan and clean
  node watchdog.js --watch       Persistent watch mode (polls every 30s)
  node watchdog.js --dry-run     Scan without modifying files
  node watchdog.js --path ./dir  Specify a custom 9router path
  node watchdog.js --help        Show this help

Options:
  --interval <ms>  Polling interval in ms (default: 30000, watch mode only)
  --path <dir>     Scan a specific directory instead of auto-detecting
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
    if (!customPath) {
      console.error('Error: --path requires a directory argument');
      process.exit(1);
    }
    addCustomPath(customPath);
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

function addCustomPath(p) {
  const exists = fs.existsSync(p);
  if (!exists) {
    console.error(`Error: path not found: ${p}`);
    process.exit(1);
  }
  // Override the auto-detection
  const orig = get9routerPaths;
  get9routerPaths = () => [p];
}

main();
