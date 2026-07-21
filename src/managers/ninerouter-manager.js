"use strict";

/**
 * 9Router Integration Manager
 *
 * Manages 9Router service lifecycle, status monitoring, and recovery.
 * Integrates with the watchdog to ensure persistent protection.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec, spawn } = require('child_process');

class NineRouterManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = {
      serviceName: '9router',
      binaryPath: null,
      configPath: null,
      dataPath: null,
      logPath: null,
      healthCheckInterval: 30000,
      restartOnFailure: true,
      maxRestarts: 3,
      restartDelay: 5000,
      ...options
    };

    this.process = null;
    this.healthCheckInterval = null;
    this.restartCount = 0;
    this.isRunning = false;
    this.isInstalled = false;
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
      this.detectInstallation();
      this.setupPaths();
      this.validateEnvironment();
      this.setupHealthMonitoring();

      this.log('INFO', '9Router integration manager initialized');
      this.emit('initialized');
      return this;
    } catch (error) {
      this.log('ERROR', `Failed to initialize 9Router integration manager: ${error.message}`);
      this.health.status = 'failed';
      this.health.reason = error.message;
      this.emit('error', error);
      throw error;
    }
  }

  detectInstallation() {
    const possiblePaths = [
      // npm global install
      path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'npm', 'node_modules', '9router', 'cli.js'),
      path.join(os.homedir(), '.npm-global', 'bin', '9router'),
      path.join(os.homedir(), 'node_modules', '.bin', '9router'),
      // Docker/container paths
      '/usr/local/bin/9router',
      '/usr/bin/9router',
      '/app/bin/9router',
      // Development paths
      path.join(process.cwd(), 'cli.js'),
      path.join(__dirname, '../../../cli.js'),
      path.join(__dirname, '../../../../cli.js')
    ];

    for (const testPath of possiblePaths) {
      if (fs.existsSync(testPath) && this.isExecutable(testPath)) {
        this.options.binaryPath = testPath;
        this.isInstalled = true;
        this.log('INFO', `Found 9Router binary at: ${this.options.binaryPath}`);
        return;
      }
    }

    this.log('WARN', 'No 9Router installation found in standard locations');
    this.isInstalled = false;
  }

  isExecutable(filePath) {
    try {
      fs.accessSync(filePath, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }

  setupPaths() {
    if (!this.options.binaryPath) {
      throw new Error('9Router binary not found');
    }

    const binaryDir = path.dirname(this.options.binaryPath);

    // Determine config and data directories
    if (process.platform === 'win32') {
      const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
      this.options.configPath = path.join(appData, '9router', 'config.json');
      this.options.dataPath = path.join(appData, '9router', 'data');
      this.options.logPath = path.join(appData, '9router', 'logs');
    } else {
      this.options.configPath = path.join(os.homedir(), '.9router', 'config.json');
      this.options.dataPath = path.join(os.homedir(), '.9router', 'data');
      this.options.logPath = path.join(os.homedir(), '.9router', 'logs');
    }

    // Create directories if they don't exist
    [this.options.configPath, this.options.dataPath, this.options.logPath].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  validateEnvironment() {
    if (process.platform === 'win32') {
      // Windows-specific validation
      if (!process.env.NODE_HOME && !process.env.NNODE_HOME) {
        this.log('WARN', 'NODE_HOME not set, trying to find Node.js')
      }
    } else {
      // Unix-like validation
      try {
        const execSync = require('child_process').execSync;
        execSync('node --version');
        execSync('npm --version');
      } catch {
        throw new Error('Node.js or npm not found in PATH');
      }
    }

    // Check if 9Router dependencies are available
    try {
      const execSync = require('child_process').execSync;
      execSync('npm list 9router --depth=0', { stdio: 'pipe' });
    } catch {
      this.log('WARN', '9Router may not be installed globally');
    }
  }

  async start() {
    try {
      if (this.isRunning) {
        this.log('WARN', '9Router integration is already running');
        return this;
      }

      if (!this.isInstalled) {
        throw new Error('9Router is not installed. Cannot start integration.');
      }

      this.log('INFO', 'Starting 9Router integration');

      // Start 9Router process
      this.process = spawn(this.options.binaryPath, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
        cwd: path.dirname(this.options.binaryPath)
      });

      this.setupProcessHandlers();

      // Wait for process to start
      await this.waitForProcessReady();

      this.isRunning = true;
      this.restartCount = 0;

      this.log('INFO', '9Router integration started successfully');
      this.emit('started');

      return this;
    } catch (error) {
      this.health.status = 'failed';
      this.health.reason = error.message;
      this.restartCount++;

      this.log('ERROR', `Failed to start 9Router integration: ${error.message}`);

      if (this.options.restartOnFailure && this.restartCount < this.options.maxRestarts) {
        this.log('WARN', `Restarting integration (attempt ${this.restartCount}/${this.options.maxRestarts})`);
        setTimeout(() => this.start(), this.options.restartDelay);
      } else {
        this.emit('error', error);
        throw error;
      }
    }
  }

  async stop() {
    try {
      this.log('INFO', 'Stopping 9Router integration');

      if (this.process) {
        this.process.kill();
        this.process = null;
      }

      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
        this.healthCheckInterval = null;
      }

      this.isRunning = false;

      this.log('INFO', '9Router integration stopped successfully');
      this.emit('stopped');

      return this;
    } catch (error) {
      this.log('ERROR', `Failed to stop 9Router integration: ${error.message}`);
      this.emit('error', error);
      throw error;
    }
  }

  setupProcessHandlers() {
    if (!this.process) return;

    this.process.stdout.on('data', (data) => {
      const output = data.toString().trim();
      if (output) {
        this.log('INFO', `9Router stdout: ${output}`);
      }
    });

    this.process.stderr.on('data', (data) => {
      const error = data.toString().trim();
      this.log('ERROR', `9Router stderr: ${error}`);
    });

    this.process.on('close', (code, signal) => {
      this.isRunning = false;
      if (code !== 0 && this.options.restartOnFailure) {
        this.restartCount++;
        if (this.restartCount < this.options.maxRestarts) {
          this.log('WARN', `9Router process exited with code ${code}, restarting (${this.restartCount}/${this.options.maxRestarts})`);
          setTimeout(() => this.start(), this.options.restartDelay);
        }
      } else if (code !== 0) {
        this.log('WARN', `9Router process exited with code ${code}`);
      } else {
        this.log('INFO', `9Router process exited normally`);
      }
    });

    this.process.on('error', (error) => {
      this.log('ERROR', `9Router process error: ${error.message}`);
      this.emit('error', error);
    });
  }

  async waitForProcessReady(timeout = 30000) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      const checkReady = async () => {
        if (Date.now() - startTime > timeout) {
          reject(new Error(`Timeout waiting for 9Router to be ready after ${timeout}ms`));
          return;
        }

        try {
          // Check if process is still running
          if (!this.process || this.process.killed) {
            return;
          }

          // Check if 9Router is responding (if it has health endpoints)
          const isHealthy = await this.checkHealth();
          if (isHealthy) {
            resolve();
          } else {
            setTimeout(checkReady, 1000);
          }
        } catch (error) {
          setTimeout(checkReady, 1000);
        }
      };

      checkReady();
    });
  }

  setupHealthMonitoring() {
    const healthCheck = async () => {
      try {
        const healthy = await this.checkHealth();
        this.health = {
          status: healthy ? 'healthy' : 'unhealthy',
          healthy,
          lastCheck: Date.now(),
          reason: healthy ? null : 'Health check failed'
        };

        this.emit('healthCheck', this.health);

        if (!healthy) {
          this.log('WARN', '9Router health check failed');
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

  async checkHealth() {
    if (!this.isRunning || !this.process) {
      return false;
    }

    return new Promise((resolve) => {
      // Simple health check - check if process is still alive
      resolve(!this.process.killed && this.process.exitCode === null);
    });
  }

  getHealth() {
    return { ...this.health };
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

module.exports = NineRouterManager;