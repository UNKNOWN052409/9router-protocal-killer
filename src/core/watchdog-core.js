"use strict";

/**
 * Core Watchdog
 *
 * The core watchdog functionality that detects and eliminates the
 * "CRITICAL: CHUNKED WRITE PROTOCOL (MANDATORY)" from 9router installations.
 */

const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

class WatchdogCore extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = {
      configPath: null,
      watchPath: null,
      maxFileSize: 50 * 1024 * 1024, // 50MB
      maxDepth: 10,
      extensions: ['.js', '.json', '.md'],
      patterns: [
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
      ],
      onFileFound: null,
      onFileCleaned: null,
      ...options
    };

    this.stats = {
      scanned: 0,
      infected: 0,
      cleaned: 0,
      errors: 0
    };

    this.setupEventHandlers();
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      stats: { ...this.stats },
      config: this.options
    };
  }

  async start() {
    try {
      this.log('INFO', 'Core watchdog starting...');

      // Initialize based on available options
      if (this.options.watchPath) {
        await this.watchDirectory(this.options.watchPath);
      }

      this.log('INFO', 'Core watchdog started successfully');
      this.emit('started');
      return this;
    } catch (error) {
      this.stats.errors++;
      this.log('ERROR', `Core watchdog failed to start: ${error.message}`);
      this.emit('error', error);
      throw error;
    }
  }

  async stop() {
    try {
      this.log('INFO', 'Core watchdog stopping...');
      this.log('INFO', 'Core watchdog stopped successfully');
      this.emit('stopped');
      return this;
    } catch (error) {
      this.stats.errors++;
      this.log('ERROR', `Core watchdog failed to stop: ${error.message}`);
      this.emit('error', error);
      throw error;
    }
  }

  // Scan a directory recursively
  async scanDirectory(dirPath, depth = 0) {
    if (depth > this.options.maxDepth) {
      return;
    }

    try {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          // Skip hidden directories and node_modules
          if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
            await this.scanDirectory(fullPath, depth + 1);
          }
        } else if (this.isTargetFile(fullPath)) {
          await this.scanFile(fullPath);
        }
      }
    } catch (error) {
      this.stats.errors++;
      this.log('ERROR', `Error scanning directory ${dirPath}: ${error.message}`);
    }
  }

  async watchDirectory(dirPath) {
    this.log('INFO', `Starting scan of directory: ${dirPath}`);
    await this.scanDirectory(dirPath);
    this.log('INFO', `Scan completed. Stats: ${JSON.stringify(this.stats, null, 2)}`);
  }

  isTargetFile(filePath) {
    return this.options.extensions.some(ext => filePath.endsWith(ext));
  }

  async scanFile(filePath) {
    // Skip the watchdog project's own source files to avoid false positives
    const ownDir = path.resolve(__dirname, '..', '..');
    if (path.resolve(filePath).startsWith(ownDir)) return;

    this.stats.scanned++;

    try {
      const stats = await fs.promises.stat(filePath);
      if (stats.size > this.options.maxFileSize) {
        this.log('WARN', `Skipping large file: ${filePath} (${stats.size} bytes)`);
        return;
      }

      const content = await fs.promises.readFile(filePath, 'utf8');

      if (this.hasProtocol(content)) {
        this.stats.infected++;
        this.log('INFO', `Protocol detected in: ${filePath}`);

        if (this.options.onFileFound) {
          this.options.onFileFound(filePath, { content, size: stats.size });
        }

        await this.cleanFile(filePath, content);
      }
    } catch (error) {
      this.stats.errors++;
      this.log('ERROR', `Error scanning file ${filePath}: ${error.message}`);
    }
  }

  hasProtocol(content) {
    return this.options.patterns.some(pattern => pattern.test(content));
  }

  async cleanFile(filePath, content) {
    try {
      // Remove all protocol patterns
      let cleanedContent = content;
      this.options.patterns.forEach(pattern => {
        cleanedContent = cleanedContent.replace(pattern, '');
      });

      // Clean up extra whitespace and newlines
      cleanedContent = cleanedContent.replace(/\n\s*\n\s*\n/g, '\n\n').trim();
      if (cleanedContent !== content) {
        await fs.promises.writeFile(filePath, cleanedContent, 'utf8');
        this.stats.cleaned++;
        this.log('INFO', `Protocol eliminated from: ${filePath}`);

        if (this.options.onFileCleaned) {
          this.options.onFileCleaned(filePath);
        }
      }
    } catch (error) {
      this.stats.errors++;
      this.log('ERROR', `Failed to clean file ${filePath}: ${error.message}`);
    }
  }

  log(level, message) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${level}] [${this.constructor.name}] ${message}`);
  }

  setupEventHandlers() {
    process.on('SIGINT', () => this.stop());
    process.on('SIGTERM', () => this.stop());

    if (process.platform === 'win32') {
      process.on('SIGBREAK', () => this.stop());
    }
  }
}

module.exports = WatchdogCore;
