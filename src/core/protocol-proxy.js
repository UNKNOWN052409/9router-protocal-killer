#!/usr/bin/env node
/**
 * Protocol Proxy — MITM for 9router
 *
 * Sits BETWEEN your AI agents (pi, codex, claude, etc.) and the 9router server.
 * Intercepts ALL HTTP responses (including SSE streams) and strips the
 * "CRITICAL CHUNKED WRITE PROTOCOL" text BEFORE it reaches your agent.
 *
 * Architecture:
 *   Agent (pi/codex/etc.)  ──→  Protocol Proxy (:20129)  ──→  9router (:20128)
 *                                     ↓
 *                          Strips protocol from ALL responses
 *
 * Usage:
 *   standalone:  node src/core/protocol-proxy.js [--port 20129] [--upstream localhost:20128]
 *   integrated:  node watchdog.js --proxy (starts alongside --watch)
 */

const http = require('http');
const https = require('https');
const { Transform, PassThrough } = require('stream');

// ─── Protocol Signatures ──────────────────────────────────────────────────────
// Matches the patterns in shield.js + watchdog.js

const PROTOCOL_SIGNATURES = [
  // ---- Original exact patterns ----
  /CRITICAL:\s*CHUNKED\s*WRITE\s*PROTOCOL(?!\s*\/)/gi,
  /CHUNKED\s*WRITE\s*PROTOCOL\s*\(MANDATORY\)/gi,
  /MANDATORY\s+CHUNKED\s+WRITE\s+STRATEGY/gi,

  // ---- New variants: plain text descriptions ----
  /never\s*writing\s*more\s*than\s*350\s*lines\s*in\s*a\s*single\s*operation/gi,
  /preferring\s*surgical\s*edits\s*over\s*bulk\s*operations/gi,

  // ---- ABSOLUTE LIMITS block ----
  /MAXIMUM\s+350\s+LINES\s+per\s+single\s+write/gi,
  /RECOMMENDED\s+300\s+LINES\s+or\s+less/gi,
  /NEVER\s+write\s+entire\s+files\s+in\s+one\s+operation/gi,
  /Write\s+initial\s+chunk\s*\(?first\s+250/gi,
  /Append\s+remaining\s+content\s+in\s+250/gi,
  /Use\s+surgical\s+edits\s*-\s*change\s+ONLY/gi,
  /Split\s+large\s+refactors\s+into\s+multiple\s+small/gi,

  // ---- CRITICAL: Always create NEW commits ----
  /CRITICAL:\s*Always\s+create\s+NEW\s+commits/gi,
  /CRITICAL:\s*Always\s+create\s+new\s+commits\s+rather\s+than\s+amending/gi,

  // ---- Variant spellings ----
  /chunk\s+written\s+protocal/gi,
  /chunk\s+write\s+350\s/gi,

  // ---- ABSOLUTE LIMITS header (tight anchor) ----
  /ABSOLUTE\s+LIMITS:?\s*-\s*MAXIMUM\s+350/gi,
];

/**
 * Check if text contains protocol content.
 * Uses fresh copies of regexes to avoid lastIndex issues.
 */
function hasProtocol(text) {
  const blockPat = /CRITICAL:\s*CHUNKED\s*WRITE\s*PROTOCOL[\s\S]*?(?:task failure\.|NO EXCEPTIONS\.|end of protocol\.)/i;
  if (blockPat.test(text)) return true;
  const pats = [
    /CRITICAL:\s*CHUNKED\s*WRITE\s*PROTOCOL/i,
    /CHUNKED\s*WRITE\s*PROTOCOL\s*\(MANDATORY\)/i,
    /MANDATORY\s+CHUNKED\s+WRITE\s+STRATEGY/i,
    /never\s*writing\s*more\s*than\s*350\s*lines\s*in\s*a\s*single\s*operation/i,
    /preferring\s*surgical\s*edits\s*over\s*bulk\s*operations/i,
    /MAXIMUM\s+350\s+LINES\s+per\s+single\s+write/i,
    /RECOMMENDED\s+300\s+LINES\s+or\s+less/i,
    /NEVER\s+write\s+entire\s+files\s+in\s+one\s+operation/i,
    /Write\s+initial\s+chunk\s*\(?first\s+250/i,
    /Append\s+remaining\s+content\s+in\s+250/i,
    /Use\s+surgical\s+edits\s*-\s*change\s+ONLY/i,
    /Split\s+large\s+refactors\s+into\s+multiple\s+small/i,
    /CRITICAL:\s*Always\s+create\s+NEW\s+commits/i,
    /CRITICAL:\s*Always\s+create\s+new\s+commits\s+rather\s+than\s+amending/i,
    /chunk\s+written\s+protocal/i,
    /chunk\s+write\s+350\s/i,
    /write(?:n)?\s+more\s+than\s+\d+\s+lines/i,
    /\d{2,4}\s+lines\s+per\s+single\s+write/i,
    /surgical\s+edits?\s*-\s*change/i,
    /ABSOLUTE\s+LIMITS?:?\s*-\s*MAXIMUM/i,
  ];
  for (const p of pats) {
    if (p.test(text)) return true;
  }
  return false;
}

/**
 * Get all protocol regexes (fresh instances to avoid lastIndex issues).
 */
function getProtocolPatterns() {
  return [
    /CRITICAL:\s*CHUNKED\s*WRITE\s*PROTOCOL/gi,
    /CHUNKED\s*WRITE\s*PROTOCOL\s*\(MANDATORY\)/gi,
    /MANDATORY\s+CHUNKED\s+WRITE\s+STRATEGY/gi,
    /never\s*writing\s*more\s*than\s*350\s*lines\s*in\s*a\s*single\s*operation/gi,
    /preferring\s*surgical\s*edits\s*over\s*bulk\s*operations/gi,
    /MAXIMUM\s+350\s+LINES\s+per\s+single\s+write/gi,
    /RECOMMENDED\s+300\s+LINES\s+or\s+less/gi,
    /NEVER\s+write\s+entire\s+files\s+in\s+one\s+operation/gi,
    /Write\s+initial\s+chunk\s*\(?first\s+250[^\n]*/gi,
    /Append\s+remaining\s+content\s+in\s+250/gi,
    /Use\s+surgical\s+edits\s*-\s*change\s+ONLY/gi,
    /Split\s+large\s+refactors\s+into\s+multiple\s+small(?:\s+changes?)?/gi,
    /CRITICAL:\s*Always\s+create\s+NEW\s+commits/gi,
    /CRITICAL:\s*Always\s+create\s+new\s+commits\s+rather\s+than\s+amending/gi,
    /chunk\s+written\s+protocal/gi,
    /chunk\s+write\s+350\s/gi,
    /write(?:n)?\s+more\s+than\s+\d+\s+lines/gi,
    /\d{2,4}\s+lines\s+per\s+single\s+write/gi,
    /surgical\s+edits?\s*-\s*change/gi,
    /ABSOLUTE\s+LIMITS?:?\s*-\s*MAXIMUM/gi,
  ];
}

/**
 * Strip ALL protocol text from content.
 * Removes protocol blocks AND individual signature lines.
 */
function stripProtocol(text) {
  let cleaned = text;

  // First remove full protocol blocks (using fresh regex)
  const blockPat = /CRITICAL:\s*CHUNKED\s*WRITE\s*PROTOCOL[\s\S]*?(?:task failure\.|NO EXCEPTIONS\.|end of protocol\.)/gi;
  cleaned = cleaned.replace(blockPat, '');

  // Then remove individual signature lines
  const patterns = getProtocolPatterns();
  for (const sig of patterns) {
    cleaned = cleaned.replace(sig, '');
  }

  // Remove orphaned fragments left after partial stripping
  // e.g., "// (MANDATORY)", "// /edit operation - ", "// NO EXCEP"
  const fragmentPats = [
    // Comment-line fragments
    /\/\/\s*\(MANDATORY\)[^\n]*\n?/gi,
    /\/\/\s*NO\s+EXCEPTIONS?\.?[^\n]*\n?/gi,
    /\/\/\s*-\s*change\s+ONLY[^\n]*\n?/gi,
    /\/\/\s*[\/]?\s*edit\s+operation[^\n]*\n?/gi,
    /\/\/\s*[\/]?\s*write[^\n]*\n?/gi,
    /\/\/\s*[\/]?\s*split\s+large[^\n]*\n?/gi,
    // Inline fragments (no // prefix)
    /\(MANDATORY\)[^\n]*\n?/gi,
    /NO\s+EXCEPTIONS?\.?/gi,
    /[\/]?\s*edit\s+operation[^\n]*\n?/gi,
    /[\/]?\s*surgical\s+edit[^\n]*\n?/gi,
    /[\/]?\s*what\s+needs\s+changing[^\n]*/gi,
    /[\/]?\s*bulk\s+operation[^\n]*\n?/gi,
  ];
  for (const fp of fragmentPats) {
    cleaned = cleaned.replace(fp, '');
  }

  // Remove empty comment lines and lines with only leftover slashes
  cleaned = cleaned.replace(/^[ \t]*\/\/[ \t\/]*\n/gm, '');
  cleaned = cleaned.replace(/^[ \t]*\/\/[ \t]*\/.*\n/gm, '');

  // Clean up artifacts: multiple blank lines, trailing whitespace
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  cleaned = cleaned.replace(/[ \t]+\n/g, '\n');

  // Trim leading/trailing whitespace
  cleaned = cleaned.trim();

  return cleaned;
}

/**
 * The MITM Proxy Server
 */
class ProtocolProxy {
  constructor(options = {}) {
    this.options = {
      proxyPort: parseInt(options.proxyPort) || 20129,
      upstreamHost: options.upstreamHost || 'localhost',
      upstreamPort: parseInt(options.upstreamPort) || 20128,
      upstreamProtocol: options.upstreamProtocol || 'http:',
      verbose: options.verbose || false,
      ...options
    };

    this.server = null;
    this.upstreamReady = false;
    this.retryInterval = null;
    this.stats = {
      requests: 0,
      responses: 0,
      cleaned: 0,
      sseChunksCleaned: 0,
      errors: 0,
      upstreamRetries: 0
    };
  }

  log(level, msg) {
    const ts = new Date().toISOString();
    console.log(`[${ts}] [PROXY:${level}] ${msg}`);
  }

  /** Create and start the proxy server */
  start() {
    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      this.server.listen(this.options.proxyPort, '127.0.0.1', () => {
        this.log('INFO', `Protocol Proxy listening on 127.0.0.1:${this.options.proxyPort}`);
        this.log('INFO', `Upstream: ${this.options.upstreamProtocol}//${this.options.upstreamHost}:${this.options.upstreamPort}`);
        if (this.options.verbose) {
          this.log('INFO', `Will strip protocol text from ALL responses`);
        }
        
        // Start checking upstream availability (silent)
        this.checkUpstream();
        
        resolve();
      });
    });
  }

  /** Stop the proxy */
  stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.log('INFO', 'Protocol Proxy stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /** Periodically check if upstream (9router) is reachable */
  checkUpstream() {
    const check = () => {
      const upReq = http.request({
        hostname: this.options.upstreamHost,
        port: this.options.upstreamPort,
        path: '/v1/models',
        method: 'HEAD',
        timeout: 2000
      }, (res) => {
        if (!this.upstreamReady) {
          this.upstreamReady = true;
          this.log('INFO', `Upstream 9router is reachable (port ${this.options.upstreamPort})`);
        }
        res.resume();
      });
      upReq.on('error', () => {
        if (this.upstreamReady) {
          this.log('WARN', `Upstream 9router not reachable yet, will retry...`);
          this.upstreamReady = false;
        }
      });
      upReq.end();
    };

    // Check immediately, then every 5s until connected
    check();
    this.retryInterval = setInterval(() => {
      if (!this.upstreamReady) {
        this.stats.upstreamRetries++;
        check();
      }
    }, 5000);
  }

  /** Handle an incoming request: forward to upstream, intercept response */
  handleRequest(clientReq, clientRes) {
    this.stats.requests++;
    const reqId = this.stats.requests;
    const url = clientReq.url || '/';

    if (this.options.verbose) {
      this.log('REQ', `#${reqId} ${clientReq.method} ${url}`);
    }

    // Build upstream request options
    const upstreamOptions = {
      hostname: this.options.upstreamHost,
      port: this.options.upstreamPort,
      path: url,
      method: clientReq.method,
      headers: { ...clientReq.headers },
      rejectUnauthorized: false
    };

    // Remove hop-by-hop headers
    const hopByHop = ['connection', 'keep-alive', 'transfer-encoding', 'te', 'trailer',
                       'proxy-authorization', 'proxy-authenticate', 'upgrade'];
    for (const h of hopByHop) {
      delete upstreamOptions.headers[h];
    }
    // Fix host header to upstream
    upstreamOptions.headers['host'] = `${this.options.upstreamHost}:${this.options.upstreamPort}`;

    const upstreamModule = this.options.upstreamProtocol === 'https:' ? https : http;

    const upstreamReq = upstreamModule.request(upstreamOptions, (upstreamRes) => {
      this.stats.responses++;

      // Determine content type
      const contentType = (upstreamRes.headers['content-type'] || '').toLowerCase();
      const isSSE = contentType.includes('text/event-stream');
      const isJSON = contentType.includes('application/json') || contentType.includes('text/plain');

      // Copy status and headers to client (filtering out problematic ones)
      const cleanHeaders = { ...upstreamRes.headers };
      delete cleanHeaders['content-encoding'];
      delete cleanHeaders['content-length'];
      delete cleanHeaders['transfer-encoding'];
      cleanHeaders['x-protocol-proxy'] = `cleaned=${this.stats.cleaned}`;
      cleanHeaders['x-protocol-proxy-sse'] = `${isSSE}`;
      clientRes.writeHead(upstreamRes.statusCode, cleanHeaders);

      if (isSSE) {
        // ── SSE streaming: intercept each data chunk ──
        if (this.options.verbose) {
          this.log('SSE', `#${reqId} Streaming SSE response from ${url}`);
        }

        // Create a transform stream to intercept and clean SSE data
        const sseCleaner = new Transform({
          readableObjectMode: false,
          writableObjectMode: false,
          transform: (chunk, encoding, callback) => {
            const str = chunk.toString('utf8');
            const cleaned = stripProtocol(str);

            if (cleaned !== str) {
              this.stats.sseChunksCleaned++;
              this.stats.cleaned++;
              if (this.options.verbose) {
                this.log('STRIP', `#${reqId} Stripped protocol from SSE chunk`);
              }
            }

            callback(null, cleaned);
          }
        });

        upstreamRes.pipe(sseCleaner).pipe(clientRes);

        sseCleaner.on('error', (err) => {
          this.stats.errors++;
          this.log('ERROR', `#${reqId} SSE cleaner error: ${err.message}`);
        });

      } else {
        // ── Non-streaming: buffer full response, strip, then send ──
        const chunks = [];

        upstreamRes.on('data', (chunk) => {
          chunks.push(chunk);
        });

        upstreamRes.on('end', () => {
          let body = Buffer.concat(chunks);

          // Only try to strip if it's text content
          if (isJSON || contentType.includes('text/') || contentType.includes('javascript') ||
              contentType.includes('json') || contentType.includes('xml') || !contentType) {
            try {
              const bodyStr = body.toString('utf8');
              if (hasProtocol(bodyStr)) {
                const cleaned = stripProtocol(bodyStr);
                if (cleaned !== bodyStr) {
                  this.stats.cleaned++;
                  this.log('STRIP', `#${reqId} Stripped protocol from ${url} (${(bodyStr.length - cleaned.length)} chars removed)`);
                  clientRes.end(cleaned);
                  return;
                }
              }
            } catch (e) {
              // Binary data, skip
            }
          }

          clientRes.end(body);
        });

        upstreamRes.on('error', (err) => {
          this.stats.errors++;
          this.log('ERROR', `#${reqId} Upstream response error: ${err.message}`);
          clientRes.end();
        });
      }
    });

    // Forward the request body to upstream
    clientReq.pipe(upstreamReq);

    upstreamReq.on('error', (err) => {
      this.stats.errors++;
      
      // Provide a helpful message instead of a scary error
      const msg = this.upstreamReady 
        ? `Upstream error: ${err.message}` 
        : `9router not ready yet (port ${this.options.upstreamPort}). Make sure 9router is running first.`;
      
      if (this.options.verbose) {
        this.log('ERROR', `#${reqId} ${msg}`);
      }

      // Send friendly response to client
      if (!clientRes.headersSent) {
        clientRes.writeHead(502, { 'Content-Type': 'text/plain' });
        clientRes.end(`Protocol Proxy: ${msg}\n`);
      }
    });

    // Handle client request errors
    clientReq.on('error', (err) => {
      this.stats.errors++;
      this.log('ERROR', `#${reqId} Client request error: ${err.message}`);
    });
  }

  /** Get proxy status */
  getStatus() {
    return {
      running: this.server && this.server.listening,
      proxyPort: this.options.proxyPort,
      upstream: `${this.options.upstreamHost}:${this.options.upstreamPort}`,
      stats: { ...this.stats }
    };
  }
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

function printHelp() {
  console.log(`
9router Protocol Proxy — MITM for live response interception
=================================================================
Intercepts ALL HTTP traffic through 9router and strips the
chunked write protocol from responses BEFORE they reach your agent.

Usage:
  node src/core/protocol-proxy.js                  Start (default port 20129)
  node src/core/protocol-proxy.js --port 2020      Custom port
  node src/core/protocol-proxy.js --upstream localhost:20128  Custom upstream
  node src/core/protocol-proxy.js --verbose        Verbose logging
  node src/core/protocol-proxy.js --help           This help

Setup:
  1. Start the proxy:     node src/core/protocol-proxy.js
  2. Configure YOUR agent to use http://localhost:20129 instead of :20128

  For pi-agent (if you have it):
       ~/.pi/agent/models.json → change baseUrl to "http://localhost:20129/v1"

  For Codex CLI:
       ~/.codex/config.toml → base_url = "http://localhost:20129/v1"

  For Claude Code:
       export ANTHROPIC_BASE_URL=http://localhost:20129/v1

  For OpenCode:
       opencode config set baseURL http://localhost:20129/v1

  3. The proxy forwards EVERYTHING to 9router (localhost:20128)
  4. Protocol text is stripped from ALL responses (including SSE streams)
  5. No pi required — works with ANY coding agent
  `);
}

if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  const portIdx = args.indexOf('--port');
  const port = portIdx >= 0 ? parseInt(args[portIdx + 1]) || 20129 : 20129;

  const upstreamIdx = args.indexOf('--upstream');
  let upstreamHost = 'localhost';
  let upstreamPort = 20128;
  if (upstreamIdx >= 0 && args[upstreamIdx + 1]) {
    const parts = args[upstreamIdx + 1].split(':');
    upstreamHost = parts[0] || 'localhost';
    upstreamPort = parseInt(parts[1]) || 20128;
  }

  const verbose = args.includes('--verbose') || args.includes('-v');

  const proxy = new ProtocolProxy({
    proxyPort: port,
    upstreamHost,
    upstreamPort,
    verbose
  });

  proxy.start().then(() => {
    console.log(`\n✅ Protocol Proxy running on :${port} → ${upstreamHost}:${upstreamPort}`);
    console.log(`   Configure your AI agent to use http://localhost:${port} instead of :20128`);
    console.log(``);
    console.log(`   Setup for common tools:`);
    console.log(`     pi-agent:   ~/.pi/agent/models.json → baseUrl: "http://localhost:${port}/v1"`);
    console.log(`     Codex CLI:  ~/.codex/config.toml  → base_url = "http://localhost:${port}/v1"`);
    console.log(`     Claude CLI: export ANTHROPIC_BASE_URL=http://localhost:${port}/v1`);
    console.log(`     OpenCode:   opencode config set baseURL http://localhost:${port}/v1`);
    console.log(`     OpenClaw:   providers.9router.baseUrl in openclaw.json → http://localhost:${port}/v1`);
    console.log(``);
    console.log(`   Press Ctrl+C to stop.\n`);
  });

  // Signal handlers
  process.on('SIGINT', async () => {
    console.log('\nShutting down Protocol Proxy...');
    await proxy.stop();
    process.exit(0);
  });
  process.on('SIGTERM', async () => {
    await proxy.stop();
    process.exit(0);
  });
}

module.exports = ProtocolProxy;
module.exports.hasProtocol = hasProtocol;
module.exports.stripProtocol = stripProtocol;
module.exports.getProtocolPatterns = getProtocolPatterns;
