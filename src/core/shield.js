"use strict";

/**
 * Infection Shield
 *
 * Self-protection module that prevents the chunked write protocol
 * from infecting this project's own source files.
 *
 * Two layered defenses:
 *   1. FS write wrappers — blocks protocol from being written to ANY file
 *   2. Self-integrity check — scans own source files for signs of tampering
 *      (only targets actual 9router installation dirs, not project source)
 */

const fs = require('fs');
const path = require('path');

// Patterns that appear in infected files (actual protocol content, not regex patterns)
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

class InfectionShield {
  constructor(options = {}) {
    this.options = {
      protectOwnFiles: true,
      scanTargetDirs: [],
      verbose: false,
      ...options
    };

    this.stats = { scanned: 0, blocked: 0, cleaned: 0 };
    this.originalWriteFileSync = null;
    this.originalWriteFile = null;
    this.originalAppendFileSync = null;
    this.originalAppendFile = null;
  }

  /**
   * Activate the shield:
   *   1. Scan target directories (9router installations) for infections
   *   2. Wrap fs write operations to intercept protocol data
   */
  activate() {
    if (this.options.verbose) console.log('[SHIELD] Activating...');

    // Scan specified target directories (e.g., 9router installs)
    if (this.options.scanTargetDirs.length > 0) {
      for (const dir of this.options.scanTargetDirs) {
        if (fs.existsSync(dir)) {
          if (this.options.verbose) console.log(`[SHIELD] Scanning: ${dir}`);
          this.scanDir(dir, 5);
        }
      }
    }

    // Install fs wrappers to block protocol writes
    if (this.options.protectOwnFiles) {
      this.installFsWrappers();
    }

    if (this.options.verbose) console.log('[SHIELD] Active');
    return this.getStatus();
  }

  deactivate() {
    this.uninstallFsWrappers();
  }

  /** Scan a directory for infected files */
  scanDir(dirPath, maxDepth, depth = 0) {
    if (depth > maxDepth) return;

    let entries;
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const full = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        this.scanDir(full, maxDepth, depth + 1);
      } else {
        // Scan ALL file types — protocol can appear in any file
        this.scanFile(full);
      }
    }
  }

  scanFile(filePath) {
    // Skip the watchdog project's own source files to avoid false positives
    const ownDir = path.resolve(__dirname, '..', '..');
    if (path.resolve(filePath).startsWith(ownDir)) return;

    this.stats.scanned++;
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      if (this.containsProtocol(content)) {
        this.stats.cleaned++;
        console.log(`[SHIELD] Cleaning: ${filePath}`);
        const cleaned = this.removeProtocol(content);
        fs.writeFileSync(filePath, cleaned, 'utf8');
      }
    } catch {
      // skip unreadable files
    }
  }

  /** Wrap fs write operations to intercept protocol content */
  installFsWrappers() {
    this.originalWriteFileSync = fs.writeFileSync;
    this.originalWriteFile = fs.writeFile;
    this.originalAppendFileSync = fs.appendFileSync;
    this.originalAppendFile = fs.appendFile;

    const self = this;

    fs.writeFileSync = function(filePath, data, options) {
      if (typeof data === 'string' && self.containsProtocol(data)) {
        data = self.removeProtocol(data);
        self.stats.blocked++;
      }
      return self.originalWriteFileSync.call(fs, filePath, data, options);
    };

    fs.writeFile = function(filePath, data, options, cb) {
      if (typeof options === 'function') { cb = options; options = undefined; }
      if (typeof data === 'string' && self.containsProtocol(data)) {
        data = self.removeProtocol(data);
        self.stats.blocked++;
      }
      return self.originalWriteFile.call(fs, filePath, data, options, cb);
    };

    fs.appendFileSync = function(filePath, data, options) {
      if (typeof data === 'string' && self.containsProtocol(data)) {
        self.stats.blocked++;
        return; // silently drop protocol appends
      }
      return self.originalAppendFileSync.call(fs, filePath, data, options);
    };

    fs.appendFile = function(filePath, data, options, cb) {
      if (typeof options === 'function') { cb = options; options = undefined; }
      if (typeof data === 'string' && self.containsProtocol(data)) {
        self.stats.blocked++;
        if (cb) process.nextTick(cb);
        return;
      }
      return self.originalAppendFile.call(fs, filePath, data, options, cb);
    };
  }

  uninstallFsWrappers() {
    if (this.originalWriteFileSync) {
      fs.writeFileSync = this.originalWriteFileSync;
      fs.writeFile = this.originalWriteFile;
      fs.appendFileSync = this.originalAppendFileSync;
      fs.appendFile = this.originalAppendFile;
    }
  }

  containsProtocol(content) {
    return PROTOCOL_SIGNATURES.some(sig => sig.test(content));
  }

  removeProtocol(content) {
    let cleaned = content;
    for (const sig of PROTOCOL_SIGNATURES) {
      cleaned = cleaned.replace(sig, '');
    }
    return cleaned.replace(/\n{3,}/g, '\n\n').trim();
  }

  getStatus() {
    return { active: this.options.protectOwnFiles, stats: { ...this.stats } };
  }
}

module.exports = InfectionShield;
