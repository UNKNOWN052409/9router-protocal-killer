"use strict";

/**
 * 9Router Watchdog Service
 *
 * Main orchestrator for the cross-platform 9router watchdog service.
 * Coordinates service management, detection, and integrated operations.
 */

const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

const ServiceManager = require('./managers/service-manager');
const WatchdogCore = require('./core/watchdog-core');
const InfectionShield = require('./core/shield');

class NineRouterWatchdogService extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = {
      // Core options
      configPath: path.join(process.cwd(), 'config.json'),
      logFile: path.join(process.cwd(), 'service.log'),
      pidFile: path.join(process.cwd(), 'service.pid'),
      healthCheckInterval: 60000, // 1 minute
      isDev: process.env.NODE_ENV !== 'production',
      isCI: process.env.CI === 'true',

      // WatchDog options
      watchPath: null, // Will be set by NinerouterManager
      maxFileSize: 50 * 1024 * 1024, // 50MB
      maxDepth: 10,
      extensions: ['.js', '.json', '.md'],
      patterns: [
        /CRITICAL:\s*CHUNKED\s*WRITE\s*PROTOCOL/i,
        /CHUNKED\s*WRITE\s*PROTOCOL\s*\(MANDATORY\)/i,
        /MAXIMUM\s+350\s+LINES/i,
        /MANDATORY\s+CHUNKED\s+WRITE\s+STRATEGY/i,
      ],

      // NineRouter options
      ninerouter: {},

      // Service options
      serviceName: '9router-watchdog',

      // Cloudflare options
      cloudflareEnabled: false,
      cloudflare: {},

      ...options
    };

    this.core = null;
    this.serviceManager = null;
    this.shield = null;
    this.isRunning = false;
    this.startTime = null;
    this.stats = {
      started: 0,
      stopped: 0,
      errors: 0,
      lastHealthCheck: null
    };

    this.setupSignalHandlers();
    this.loadConfig();
  }

  async initialize() {
    try {
      this.log('INFO', 'Initializing 9Router Watchdog Service...');

      // Activate infection shield to prevent protocol from being written
      this.shield = new InfectionShield({
        protectOwnFiles: true,
        scanTargetDirs: [],
        verbose: this.options.isDev
      });
      this.shield.activate();

      // Initialize core watchdog
      this.core = new WatchdogCore({
        watchPath: this.options.watchPath,
        onFileFound: (file, details) => {
          this.emit('fileFound', file, details);
          this.log('INFO', `Protocol detected in: ${file}`);
        },
        onFileCleaned: (file) => {
          this.emit('fileCleaned', file);
          this.log('INFO', `Protocol eliminated from: ${file}`);
        }
      });

      // Initialize service manager
      this.serviceManager = new ServiceManager(this.options);

      this.startTime = Date.now();
      this.isRunning = true;

      this.log('INFO', 'Service initialized successfully');
      this.emit('initialized');

      return this;
    } catch (error) {
      this.stats.errors++;
      this.log('ERROR', `Failed to initialize service: ${error.message}`);
      this.emit('error', error);
      throw error;
    }
  }

  async start() {
    try {
      if (this.isRunning) {
        this.log('WARN', 'Service is already running');
        return this;
      }

      this.log('INFO', 'Starting 9router Watchdog Service...');

      // Start the core watchdog
      await this.core.start();

      // Shield is already active from initialize()

      // Start health check interval
      this.healthCheckInterval = setInterval(() => {
        this.performHealthCheck();
      }, this.options.healthCheckInterval);

      this.stats.started++;
      this.isRunning = true;

      this.log('INFO', '9router Watchdog Service started successfully');
      this.emit('started');

      return this;
    } catch (error) {
      this.stats.errors++;
      this.log('ERROR', `Failed to start service: ${error.message}`);
      this.emit('error', error);
      await this.stop();
      throw error;
    }
  }

  async stop() {
    try {
      this.log('INFO', 'Stopping 9router Watchdog Service...');

      // Stop health check
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
        this.healthCheckInterval = null;
      }

      // Deactivate shield
      if (this.shield) {
        this.shield.deactivate();
      }

      // Stop core watchdog
      if (this.core) {
        await this.core.stop();
      }

      this.isRunning = false;
      this.stats.stopped++;

      this.log('INFO', '9router Watchdog Service stopped successfully');
      this.emit('stopped');

      return this;
    } catch (error) {
      this.stats.errors++;
      this.log('ERROR', `Failed to stop service: ${error.message}`);
      this.emit('error', error);
      throw error;
    }
  }

  async restart() {
    this.log('INFO', 'Restarting 9router Watchdog Service...');
    await this.stop();
    await this.start();
    this.log('INFO', 'Service restarted successfully');
  }

  performHealthCheck() {
    try {
      const health = {
        timestamp: Date.now(),
        uptime: this.startTime ? Date.now() - this.startTime : 0,
        coreStatus: this.core ? this.core.getStatus() : 'unknown',
        serviceStatus: this.serviceManager ? 'running' : 'stopped',
        shieldStatus: this.shield ? this.shield.getStatus() : 'inactive',
        issues: []
      };

      // Check core health
      if (this.core) {
        const coreStatus = this.core.getStatus();
        health.coreStatus = coreStatus;
        if (coreStatus?.isRunning !== true) {
          health.issues.push(`Core watchdog is ${coreStatus?.isRunning ? 'stopped' : 'unknown'}`);
        }
      }

      // Check shield status
      if (this.shield) {
        health.shieldStatus = this.shield.getStatus();
      }

      this.stats.lastHealthCheck = health;
      this.emit('healthCheck', health);

      if (health.issues.length > 0) {
        this.log('WARN', `Health check issues: ${health.issues.join(', ')}`);
      } else {
        this.log('INFO', 'Health check passed');
      }

      return health;
    } catch (error) {
      this.stats.errors++;
      this.log('ERROR', `Health check failed: ${error.message}`);
    }
  }

  loadConfig() {
    try {
      if (fs.existsSync(this.options.configPath)) {
        const configData = fs.readFileSync(this.options.configPath, 'utf8');
        const config = JSON.parse(configData);
        Object.assign(this.options, config);
        this.log('INFO', 'Configuration loaded from file');
      } else {
        this.log('WARN', 'No configuration file found, using defaults');
        this.saveConfig();
      }
    } catch (error) {
      this.log('ERROR', `Failed to load configuration: ${error.message}`);
      throw error;
    }
  }

  saveConfig() {
    try {
      const configDir = path.dirname(this.options.configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      fs.writeFileSync(this.options.configPath, JSON.stringify(this.options, null, 2), 'utf8');
      this.log('INFO', 'Configuration saved to file');
    } catch (error) {
      this.log('ERROR', `Failed to save configuration: ${error.message}`);
    }
  }

  log(level, message) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${level}] ${message}\n`;
    console.log(logEntry);

    try {
      fs.appendFileSync(this.options.logFile, logEntry, 'utf8');
    } catch (error) {
      // Silently fail if log file cannot be written
    }
  }

  setupSignalHandlers() {
    const gracefulShutdown = async (signal) => {
      this.log('INFO', `Received ${signal}, shutting down gracefully...`);
      await this.stop();
      process.exit(0);
    };

    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

    if (process.platform === 'win32') {
      process.on('SIGBREAK', () => gracefulShutdown('SIGBREAK'));
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      uptime: this.startTime ? Date.now() - this.startTime : 0,
      stats: { ...this.stats },
      health: this.stats.lastHealthCheck,
      coreStatus: this.core ? this.core.getStatus() : 'unknown',
      serviceStatus: this.serviceManager ? 'registered' : 'not registered',
      shieldStatus: this.shield ? this.shield.getStatus() : 'disabled'
    };
  }
}

module.exports = NineRouterWatchdogService;

// CLI entry point
if (require.main === module) {
  (async () => {
    const service = new NineRouterWatchdogService(process.argv);

    try {
      await service.initialize();

      // Handle CLI commands
      const command = process.argv.find(arg => arg.startsWith('--command='))?.split('=')[1];

      switch (command) {
        case 'start':
          await service.start();
          break;
        case 'stop':
          await service.stop();
          break;
        case 'restart':
          await service.restart();
          break;
        case 'status':
          console.log(JSON.stringify(service.getStatus(), null, 2));
          break;
        case 'health':
          const health = service.performHealthCheck();
          console.log(JSON.stringify(health, null, 2));
          break;
        case 'install':
          await service.serviceManager.install();
          break;
        case 'uninstall':
          await service.serviceManager.uninstall();
          break;
        default:
          if (process.argv.includes('--help') || process.argv.includes('-h')) {
            console.log('\n9router Watchdog Service CLI');
            console.log('===========================');
            console.log('\nCommands:');
            console.log('  --command=start     Start the service');
            console.log('  --command=stop      Stop the service');
            console.log('  --command=restart   Restart the service');
            console.log('  --command=status    Get service status');
            console.log('  --command=health    Perform health check');
            console.log('  --command=install   Install as system service');
            console.log('  --command=uninstall Uninstall system service');
            console.log('\nOptions:');
            console.log('  --help, -h         Show this help');
            console.log('  --config <path>    Configuration file path');
            console.log('  --log <path>       Log file path');
            console.log('\nExample:');
            console.log('  node index.js --command=start --config=./config.json');
          } else {
            await service.start();
          }
      }
    } catch (error) {
      console.error('Fatal error:', error.message);
      process.exit(1);
    }
  })();
}