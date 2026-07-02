"use strict";

/**
 * Cloudflare Tunnel Manager
 *
 * Manages Cloudflare tunnels for persistent, secure access to 9router services.
 * Provides automatic reconnection, health monitoring, and failover capabilities.
 */
const { exec, spawn } = require('child_process');
const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');

class CloudflareManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = {
      tunnelId: null,
      tunnelToken: null,
      accountId: null,
      apiKey: null,
      hostname: null,
      port: 8080,
      healthCheckInterval: 30000,
      maxRetries: 5,
      retryDelay: 5000,
      configPath: options.configPath || path.join(process.cwd(), 'cloudflare-tunnel-config.json'),
      ...options
    };

    this.tunnelProcess = null;
    this.healthCheckInterval = null;
    this.retryCount = 0;
    this.isRunning = false;
    this.health = {
      status: 'unknown',
      healthy: false,
      lastCheck: null,
      reason: null
    };

    this.setupEventHandlers();
  }

  async initialize() {
    try {
      this.validateConfiguration();
      this.loadTunnelConfig();
      this.setupHealthMonitoring();
      this.log('INFO', 'Cloudflare tunnel manager initialized');
      this.emit('initialized');
      return this;
    } catch (error) {
      this.log('ERROR', `Failed to initialize Cloudflare tunnel manager: ${error.message}`);
      this.health.status = 'failed';
      this.health.reason = error.message;
      this.emit('error', error);
      throw error;
    }
  }

  validateConfiguration() {
    const { tunnelId, accountId, apiKey } = this.options;
    if (!tunnelId || !accountId || !apiKey) {
      throw new Error('Missing required Cloudflare configuration: tunnelId, accountId, or apiKey');
    }
  }

  loadTunnelConfig() {
    if (!this.options.tunnelId) {
      this.options.tunnelId = this.generateTunnelId();
    }
  }

  generateTunnelId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 16; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `9router-${result}`;
  }

  async start() {
    try {
      if (this.isRunning) {
        this.log('WARN', 'Cloudflare tunnel manager is already running');
        return this;
      }

      this.log('INFO', 'Starting Cloudflare tunnel manager');

      if (this.isTunnelAvailable()) {
        this.log('INFO', 'Existing tunnel detected, using it');
        await this.validateExistingTunnel();
      } else {
        await this.createNewTunnel();
      }

      await this.configureTunnel();
      this.setupHealthMonitoring();

      this.isRunning = true;
      this.retryCount = 0;

      this.log('INFO', 'Cloudflare tunnel manager started successfully');
      this.emit('started');

      return this;
    } catch (error) {
      this.health.status = 'failed';
      this.health.reason = error.message;
      this.retryCount++;

      if (this.retryCount < this.options.maxRetries) {
        this.log('WARN', `Tunnel start failed (attempt ${this.retryCount}): ${error.message}`);
        setTimeout(() => this.start(), this.options.retryDelay);
      } else {
        this.log('ERROR', `Max retries exceeded: ${error.message}`);
        this.emit('error', error);
        throw error;
      }
    }
  }

  async stop() {
    try {
      this.log('INFO', 'Stopping Cloudflare tunnel manager');

      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
        this.healthCheckInterval = null;
      }

      if (this.tunnelProcess) {
        this.tunnelProcess.kill();
        this.tunnelProcess = null;
      }

      await this.cleanupTunnelConfig();

      this.isRunning = false;

      this.log('INFO', 'Cloudflare tunnel manager stopped successfully');
      this.emit('stopped');

      return this;
    } catch (error) {
      this.log('ERROR', `Failed to stop Cloudflare tunnel manager: ${error.message}`);
      this.emit('error', error);
      throw error;
    }
  }

  async createNewTunnel() {
    this.log('INFO', 'Creating new Cloudflare tunnel');

    const command = this.getCloudflareCommand('tunnel', 'create');
    const args = [
      this.options.tunnelId,
      '--account-id', this.options.accountId,
      '--name', this.options.hostname || '9router'
    ];

    const result = await this.runCommand(command, args);
    const tunnelData = JSON.parse(result.stdout);

    this.options.tunnelToken = tunnelData.tunnel.token;
    await this.saveTunnelConfig();

    this.log('INFO', `Created tunnel: ${this.options.tunnelId}`);
    this.log('INFO', 'Tunnel token: ' + this.options.tunnelToken.substring(0, 10) + '...');
  }

  async configureTunnel() {
    this.log('INFO', 'Configuring tunnel');

    const command = this.getCloudflareCommand('tunnel', 'config', 'create');
    const args = [
      this.options.tunnelId,
      '--token', this.options.tunnelToken,
      '--hostname', this.options.hostname,
      '--port', this.options.port.toString()
    ];

    await this.runCommand(command, args);

    this.log('INFO', `Tunnel configured: ${this.options.hostname}:${this.options.port}`);
  }

  async isTunnelAvailable() {
    try {
      const command = this.getCloudflareCommand('tunnel', 'list');
      const result = await this.runCommand(command, ['--account-id', this.options.accountId]);
      const tunnels = JSON.parse(result.stdout);
      return tunnels.some(tunnel => tunnel.id === this.options.tunnelId);
    } catch {
      return false;
    }
  }

  async validateExistingTunnel() {
    this.log('INFO', 'Validating existing tunnel');

    const command = this.getCloudflareCommand('tunnel', 'list');
    const result = await this.runCommand(command, ['--account-id', this.options.accountId]);
    const tunnels = JSON.parse(result.stdout);

    const existingTunnel = tunnels.find(tunnel => tunnel.id === this.options.tunnelId);
    if (!existingTunnel) {
      throw new Error(`Tunnel not found: ${this.options.tunnelId}`);
    }

    this.options.tunnelToken = existingTunnel.token;
    await this.saveTunnelConfig();

    this.log('INFO', `Validated existing tunnel: ${this.options.tunnelId}`);
  }

  getCloudflareCommand(...args) {
    const base = 'cloudflared';
    return process.platform === 'win32' ? `${base}.exe` : base;
  }

  async runCommand(command, args) {
    return new Promise((resolve, reject) => {
      const childProcess = spawn(command, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, PATH: process.env.PATH }
      });

      let stdout = '';
      let stderr = '';

      childProcess.stdout.on('data', (data) => {
        stdout += data;
      });

      childProcess.stderr.on('data', (data) => {
        stderr += data;
      });

      childProcess.on('close', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(new Error(`Command failed with code ${code}: ${stderr || 'Unknown error'}`));
        }
      });

      childProcess.on('error', (error) => {
        reject(error);
      });
    });
  }

  setupHealthMonitoring() {
    const healthCheck = async () => {
      try {
        const healthy = await this.isTunnelHealthy();
        this.health = {
          status: healthy ? 'healthy' : 'unhealthy',
          healthy,
          lastCheck: Date.now(),
          reason: healthy ? null : 'Tunnel connectivity test failed'
        };

        this.emit('healthCheck', this.health);

        if (!healthy) {
          this.log('WARN', 'Tunnel health check failed');
        }
      } catch (error) {
        this.health = {
          status: 'error',
          healthy: false,
          lastCheck: Date.now(),
          reason: error.message
        };
        this.log('ERROR', `Health check error: ${error.message}`);
      }
    };

    this.healthCheckInterval = setInterval(healthCheck, this.options.healthCheckInterval);
    healthCheck();
  }

  async isTunnelHealthy() {
    try {
      const command = this.getCloudflareCommand('tunnel', 'peek');
      const args = [
        this.options.tunnelId,
        '--token', this.options.tunnelToken,
        '--host', this.options.hostname,
        '--port', this.options.port.toString()
      ];

      await this.runCommand(command, args);
      return true;
    } catch {
      return false;
    }
  }

  async saveTunnelConfig() {
    try {
      const configDir = path.dirname(this.options.configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      const config = {
        tunnelId: this.options.tunnelId,
        tunnelToken: this.options.tunnelToken,
        accountId: this.options.accountId,
        lastUpdated: Date.now()
      };

      fs.writeFileSync(this.options.configPath, JSON.stringify(config, null, 2), 'utf8');
      this.log('INFO', 'Cloudflare tunnel configuration saved');
    } catch (error) {
      this.log('ERROR', `Failed to save tunnel configuration: ${error.message}`);
    }
  }

  async cleanupTunnelConfig() {
    try {
      if (fs.existsSync(this.options.configPath)) {
        fs.unlinkSync(this.options.configPath);
        this.log('INFO', 'Cloudflare tunnel configuration cleaned up');
      }
    } catch (error) {
      this.log('WARN', `Failed to cleanup tunnel configuration: ${error.message}`);
    }
  }

  log(level, message) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${level}] [${this.constructor.name}] ${message}`);
  }

  setupEventHandlers() {
    process.on('SIGINT', () => this.stop());
    process.on('SIGTERM', () => this.stop());
  }
}

module.exports = CloudflareManager;