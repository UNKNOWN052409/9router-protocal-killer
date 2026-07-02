"use strict";

/**
 * Service Manager
 *
 * Manages service lifecycle across all platforms (Windows, macOS, Linux, Docker).
 * Handles installation, registration, and unregistration of the watchdog service.
 */

const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec, spawn } = require('child_process');

class ServiceManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = {
      serviceName: '9router-watchdog',
      serviceDescription: 'Persistent 9router Protocol Killer Watchdog',
      serviceUser: null,
      autoStart: true,
      restartPolicy: 'always',
      workingDirectory: process.cwd(),
      ...options
    };

    this.isInstalled = false;
    this.isRunning = false;

    this.setupPlatformHandlers();
  }

  setupPlatformHandlers() {
    switch (process.platform) {
      case 'win32':
        this.handler = new WindowsServiceHandler(this.options);
        break;
      case 'darwin':
        this.handler = new MacOSServiceHandler(this.options);
        break;
      case 'linux':
        this.handler = new LinuxServiceHandler(this.options);
        break;
      default:
        this.handler = new GenericServiceHandler(this.options);
        break;
    }
  }

  async install() {
    try {
      this.log('INFO', 'Installing service...');
      await this.handler.install();
      this.isInstalled = true;
      this.log('INFO', 'Service installed successfully');
      this.emit('installed');
      return this;
    } catch (error) {
      this.log('ERROR', `Failed to install service: ${error.message}`);
      this.emit('error', error);
      throw error;
    }
  }

  async uninstall() {
    try {
      this.log('INFO', 'Uninstalling service...');
      await this.handler.uninstall();
      this.isInstalled = false;
      this.log('INFO', 'Service uninstalled successfully');
      this.emit('uninstalled');
      return this;
    } catch (error) {
      this.log('ERROR', `Failed to uninstall service: ${error.message}`);
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

      this.log('INFO', 'Starting service...');
      await this.handler.start();
      this.isRunning = true;
      this.log('INFO', 'Service started successfully');
      this.emit('started');
      return this;
    } catch (error) {
      this.log('ERROR', `Failed to start service: ${error.message}`);
      this.emit('error', error);
      throw error;
    }
  }

  async stop() {
    try {
      this.log('INFO', 'Stopping service...');
      await this.handler.stop();
      this.isRunning = false;
      this.log('INFO', 'Service stopped successfully');
      this.emit('stopped');
      return this;
    } catch (error) {
      this.log('ERROR', `Failed to stop service: ${error.message}`);
      this.emit('error', error);
      throw error;
    }
  }

  async restart() {
    this.log('INFO', 'Restarting service...');
    await this.stop();
    await this.start();
    this.log('INFO', 'Service restarted successfully');
  }

  getStatus() {
    return {
      installed: this.isInstalled,
      running: this.isRunning,
      handlerStatus: this.handler ? this.handler.getStatus() : null
    };
  }

  log(level, message) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${level}] [${this.constructor.name}] ${message}`);
  }
}

// Platform-specific service handlers

class WindowsServiceHandler {
  constructor(options) {
    this.options = {
      serviceName: '9router-watchdog',
      serviceDisplayName: '9router Protocol Killer Watchdog',
      serviceDescription: 'Persistent 9router Protocol Killer Watchdog',
      ...options
    };
    this._isInstalled = false;
  }

  async install() {
    this.log('INFO', 'Installing Windows service...');

    const scriptPath = path.join(__dirname, '..', '..', 'bin', 'service.js');
    const configPath = path.join(process.cwd(), 'config.json');

    const installCommand = `
      $serviceName = "${this.options.serviceName}";
      $displayName = "${this.options.serviceDisplayName}";
      $description = "${this.options.serviceDescription}";
      $binaryPath = "${scriptPath}";
      $arguments = "--service";
      $workingDirectory = "${this.options.workingDirectory}";

      # Create service
      $service = Get-Service $serviceName -ErrorAction SilentlyContinue;
      if ($service) {
        Write-Host "Service already exists, stopping and removing..."; Stop-Service -Name $serviceName -Force;
        Remove-Service -Name $serviceName -Force;
      }

      # Create new service
      $serviceArgs = @{
        Name = $serviceName;
        DisplayName = $displayName;
        Description = $description;
        BinaryPathName = "$binaryPath $arguments";
        WorkingDirectory = $workingDirectory;
        StartType = 'Automatic';
        ErrorControl = 'restart'
      };

      New-Service @serviceArgs;
      Set-Service -Name $serviceName -StartupType Automatic;
      Write-Host "Windows service installed successfully: $serviceName";
    `;

    await this.runPowerShellCommand(installCommand);
  }

  async uninstall() {
    this.log('INFO', 'Uninstalling Windows service...');

    const uninstallCommand = `
      $serviceName = "${this.options.serviceName}";
      $service = Get-Service $serviceName -ErrorAction SilentlyContinue;
      if ($service) {
        Stop-Service -Name $serviceName -Force;
        Remove-Service -Name $serviceName -Force;
        Write-Host "Windows service uninstalled successfully: $serviceName";
      } else {
        Write-Host "Service not found: $serviceName";
      }
    `;

    await this.runPowerShellCommand(uninstallCommand);
  }

  async start() {
    this.log('INFO', 'Starting Windows service...');
    const startCommand = `Start-Service -Name "${this.options.serviceName}" -ErrorAction Stop`;
    await this.runPowerShellCommand(startCommand);
  }

  async stop() {
    this.log('INFO', 'Stopping Windows service...');
    const stopCommand = `Stop-Service -Name "${this.options.serviceName}" -Force -ErrorAction Stop`;
    await this.runPowerShellCommand(stopCommand);
  }

  getStatus() {
    return { platform: 'windows', installed: this.isInstalled };
  }

  async runPowerShellCommand(command) {
    return new Promise((resolve, reject) => {
      const ps = spawn('powershell', ['-Command', command], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let output = '';
      ps.stdout.on('data', (data) => { output += data; });
      ps.stderr.on('data', (data) => { output += data; });

      ps.on('close', (code) => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(`PowerShell command failed with code ${code}: ${output}`));
        }
      });
    });
  }

  log(level, message) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${level}] [WindowsServiceHandler] ${message}`);
  }

  get isInstalled() {
    return this._isInstalled;
  }

  set isInstalled(val) {
    this._isInstalled = val;
  }

  async checkServiceInstalled() {
    try {
      const command = `Get-Service -Name "${this.options.serviceName}" -ErrorAction SilentlyContinue`;
      await this.runPowerShellCommand(command);
      return true;
    } catch {
      return false;
    }
  }
}

class MacOSServiceHandler {
  constructor(options) {
    this.options = {
      serviceName: 'com.claude.9router-watchdog',
      plistPath: '/LibraryLaunchDaemons/com.claude.9router-watchdog.plist',
      ...options
    };
  }

  async install() {
    this.log('INFO', 'Installing macOS LaunchDaemon...');

    const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${this.options.serviceName}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${process.execPath}</string>
        <string>${path.join(__dirname, '..', '..', 'bin', 'service.js')}</string>
        <string>--service</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${this.options.workingDirectory}</string>
    <key>KeepAlive</key>
    <true/>
    <key>RunAtLoad</key>
    <true/>
    <key>StartInterval</key>
    <integer>60</integer>
    <key>SoftResourceLimits</key>
    <dict>
        <key>RLIMIT_NOFILE</key>
        <integer>1024</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>/var/log/${this.options.serviceName}.log</string>
    <key>StandardErrorPath</key>
    <string>/var/log/${this.options.serviceName}.error.log</string>
</dict>
</plist>`;

    fs.writeFileSync(this.options.plistPath, plistContent, 'utf8');

    const command = `launchctl load ${this.options.plistPath}`;
    await this.runShellCommand(command);

    this.log('INFO', `macOS LaunchDaemon installed and loaded: ${this.options.plistPath}`);
  }

  async uninstall() {
    this.log('INFO', 'Uninstalling macOS LaunchDaemon...');

    if (fs.existsSync(this.options.plistPath)) {
      const unloadCommand = `launchctl unload ${this.options.plistPath}`;
      await this.runShellCommand(unloadCommand);

      fs.unlinkSync(this.options.plistPath);

      this.log('INFO', `macOS LaunchDaemon unloaded and removed: ${this.options.plistPath}`);
    } else {
      this.log('WARN', `LaunchDaemon not found: ${this.options.plistPath}`);
    }
  }

  async start() {
    this.log('INFO', 'Starting macOS LaunchDaemon...');
    const command = `launchctl start ${this.options.serviceName}`;
    await this.runShellCommand(command);
  }

  async stop() {
    this.log('INFO', 'Stopping macOS LaunchDaemon...');
    const command = `launchctl stop ${this.options.serviceName}`;
    await this.runShellCommand(command);
  }

  getStatus() {
    return { platform: 'macos', installed: this.isInstalled };
  }

  async runShellCommand(command) {
    return new Promise((resolve, reject) => {
      const childProcess = spawn('sh', ['-c', command], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let output = '';
      childProcess.stdout.on('data', (data) => { output += data; });
      childProcess.stderr.on('data', (data) => { output += data; });

      childProcess.on('close', (code) => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(`Shell command failed with code ${code}: ${output}`));
        }
      });
    });
  }

  log(level, message) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${level}] [MacOSServiceHandler] ${message}`);
  }

  get isInstalled() {
    return fs.existsSync(this.options.plistPath);
  }
}

class LinuxServiceHandler {
  constructor(options) {
    this.options = {
      serviceName: '9router-watchdog',
      systemdPath: '/etc/systemd/system',
      ...options
    };
  }

  async install() {
    this.log('INFO', 'Installing Linux systemd service...');

    const serviceContent = `[Unit]
Description=${this.options.serviceDescription || '9router Protocol Killer Watchdog'}
After=network.target

[Service]
Type=simple
User=${this.options.serviceUser || 'root'}
WorkingDirectory=${this.options.workingDirectory}
ExecStart=${process.execPath} ${path.join(__dirname, '..', '..', 'bin', 'service.js')} --service
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=${this.options.serviceName}

[Install]
WantedBy=multi-user.target
`;

    const servicePath = path.join(this.options.systemdPath, `${this.options.serviceName}.service`);
	    fs.writeFileSync(servicePath, serviceContent, 'utf8');

	    await this.runShellCommand('systemctl daemon-reload');
	    await this.runShellCommand(`systemctl enable ${this.options.serviceName}`);

    this.log('INFO', `Linux systemd service installed and enabled: ${this.options.serviceName}`);
  }

  async uninstall() {
    this.log('INFO', 'Uninstalling Linux systemd service...');

    const servicePath = path.join(this.options.systemdPath, `${this.options.serviceName}.service`);

    if (fs.existsSync(servicePath)) {
	      await this.runShellCommand(`systemctl stop ${this.options.serviceName}`);
	      await this.runShellCommand(`systemctl disable ${this.options.serviceName}`);

      fs.unlinkSync(servicePath);

	      await this.runShellCommand('systemctl daemon-reload');

      this.log('INFO', `Linux systemd service stopped, disabled, and removed: ${this.options.serviceName}`);
    } else {
      this.log('WARN', `Systemd service not found: ${this.options.serviceName}`);
    }
  }

  async start() {
    this.log('INFO', 'Starting Linux systemd service...');
    const command = `systemctl start ${this.options.serviceName}`;
    await this.runShellCommand(command);
  }

  async stop() {
    this.log('INFO', 'Stopping Linux systemd service...');
    const command = `systemctl stop ${this.options.serviceName}`;
    await this.runShellCommand(command);
  }

  getStatus() {
    return { platform: 'linux', installed: this.isInstalled };
  }

  async runShellCommand(command) {
    return new Promise((resolve, reject) => {
      const childProcess = spawn('sh', ['-c', command], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let output = '';
      childProcess.stdout.on('data', (data) => { output += data; });
      childProcess.stderr.on('data', (data) => { output += data; });

      childProcess.on('close', (code) => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(`Shell command failed with code ${code}: ${output}`));
        }
      });
    });
  }

  log(level, message) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${level}] [LinuxServiceHandler] ${message}`);
  }

  get isInstalled() {
    const servicePath = path.join(this.options.systemdPath, `${this.options.serviceName}.service`);
    return fs.existsSync(servicePath);
  }
}

class GenericServiceHandler {
  constructor(options) {
    this.options = options;
  }

  async install() {
    this.log('WARN', 'Generic service handler - installation not supported on this platform');
  }

  async uninstall() {
    this.log('WARN', 'Generic service handler - uninstallation not supported on this platform');
  }

  async start() {
    this.log('WARN', 'Generic service handler - starting not supported on this platform');
  }

  async stop() {
    this.log('WARN', 'Generic service handler - stopping not supported on this platform');
  }

  getStatus() {
    return { platform: 'generic', installed: false };
  }

  log(level, message) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${level}] [GenericServiceHandler] ${message}`);
  }
}

module.exports = ServiceManager;