"use strict";

/**
 * 9Router Protocol Killer - System Service Wrapper
 *
 * Cross-platform service wrapper that manages the watchdog as a system service.
 * Handles installation, startup, and service management across platforms.
 */

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

class ServiceWrapper {
  constructor(options = {}) {
    this.options = {
      // Legacy compatibility - keep short for service integration
      command: 'node',
      script: '../watchdog.js',
      args: '--watch',
      ...options
    };

    this.isInstalled = false;
    this.isRunning = false;
  }

  async install() {
    switch (process.platform) {
      case 'win32':
        await this.installWindowsService();
        break;
      case 'darwin':
        await this.installMacOSService();
        break;
      case 'linux':
        await this.installLinuxService();
        break;
      default:
        throw new Error(`Platform ${process.platform} not supported for service installation`);
    }

    this.isInstalled = true;
    console.log('Service installed successfully');
  }

  async uninstall() {
    switch (process.platform) {
      case 'win32':
        await this.uninstallWindowsService();
        break;
      case 'darwin':
        await this.uninstallMacOSService();
        break;
      case 'linux':
        await this.uninstallLinuxService();
        break;
      default:
        throw new Error(`Platform ${process.platform} not supported for service uninstallation`);
    }

    this.isInstalled = false;
    console.log('Service uninstalled successfully');
  }

  async start() {
    if (this.isRunning) {
      console.log('Service is already running');
      return;
    }

    console.log('Starting service...');

    const commandArgs = [
      this.options.command,
      path.join(__dirname, this.options.script),
      ...this.options.args.split(' ')
    ];

    try {
      const child = require('child_process').spawn(
        commandArgs[0],
        commandArgs.slice(1),
        {
          stdio: 'inherit',
          detached: true,
          cwd: this.options.workingDirectory || process.cwd()
        }
      );
      // Store child process reference for management
      this.childProcess = child;
      this.isRunning = true;

      child.on('close', (code) => {
        this.isRunning = false;
        if (code !== 0) {
          console.log(`Service exited with code ${code}`);
        }
      });
      console.log(`Service started (PID: ${child.pid})`);
    } catch (error) {
      console.error('Failed to start service:', error.message);
      throw error;
    }
  }

  async stop() {
    if (!this.isRunning || !this.childProcess) {
      console.log('Service is not running');
      return;
    }

    console.log('Stopping service...');

    try {
      this.childProcess.kill('SIGTERM');
      await this.waitForProcessExit();
      this.isRunning = false;
      console.log('Service stopped successfully');
    } catch (error) {
      console.error('Failed to stop service:', error.message);
      throw error;
    }
  }

  async waitForProcessExit(timeout = 10000) {
    return new Promise((resolve, reject) => {
      if (!this.childProcess) {
        resolve();
        return;
      }

      const timeoutId = setTimeout(() => {
        reject(new Error('Timeout waiting for service to stop'));
      }, timeout);

      this.childProcess.once('close', (code) => {
        clearTimeout(timeoutId);
        resolve(code);
      });
    });
  }

  getStatus() {
    return {
      isInstalled: this.isInstalled,
      isRunning: this.isRunning,
      platform: process.platform
    };
  }

  // Windows Service Implementation
  async installWindowsService() {
    const scriptPath = path.join(__dirname, this.options.script);
    const serviceName = '9router-watchdog';
    const description = '9router Protocol Killer Watchdog';

    const workingDirectory = typeof this.options.workingDirectory === 'string'
      ? this.options.workingDirectory
      : process.cwd().replace(/\\/g, '\\\\');

    const psScript = `
      $serviceName = '${serviceName}';
      $displayName = '9router Protocol Killer Watchdog';
      $description = 'Persistent 9router Protocol Killer Watchdog';
      $binaryPath = '${scriptPath}';
      $workingDirectory = '${workingDirectory}';

      # Create service if it doesn't exist
      $existingService = Get-Service $serviceName -ErrorAction SilentlyContinue;
      if ($existingService) {
        Write-Host "Service already exists. Removing...";
        Stop-Service -Name $serviceName -Force;
        Remove-Service -Name $serviceName -Force;
      }

      # Create new service
      $serviceArgs = New-Object System.ServiceProcess.Installer.ServiceInstaller;
      $serviceArgs.ServiceName = $serviceName;
      $serviceArgs.DisplayName = $displayName;
      $serviceArgs.Description = $description;
      $serviceArgs.BinaryPathName = "$binaryPath --watch";
      $serviceArgs.StartType = [System.ServiceProcess.Installer.ServiceStartMode]::Automatic;
      $serviceArgs.ServicesDependedOn = @();

      $installer = New-Object System.ServiceProcess.Installer.ServiceController;
      $installer.Install($serviceArgs);

      Write-Host "Windows service installed successfully: $serviceName";
    `;

    await this.runPowerShellScript(psScript);
  }

  async uninstallWindowsService() {
    const serviceName = '9router-watchdog';

    const psScript = `
      $serviceName = '${serviceName}';
      $existingService = Get-Service $serviceName -ErrorAction SilentlyContinue;
      if ($existingService) {
        Stop-Service -Name $serviceName -Force;
        Remove-Service -Name $serviceName -Force;
        Write-Host "Windows service uninstalled successfully: $serviceName";
      } else {
        Write-Host "Service not found: $serviceName";
      }
    `;

    await this.runPowerShellScript(psScript);
  }

  // macOS Service Implementation
  async installMacOSService() {
    const plistPath = '/Library/LaunchDaemons/com.claude.9router-watchdog.plist';

    const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.claude.9router-watchdog</string>
    <key>ProgramArguments</key>
    <array>
        <string>${process.execPath}</string>
        <string>${path.join(__dirname, this.options.script)}</string>
        <string>--watch</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${this.options.workingDirectory || process.cwd()}</string>
    <key>KeepAlive</key>
    <true/>
    <key>RunAtLoad</key>
    <true/>
    <key>StartInterval</key>
    <integer>60</integer>
    <key>StandardOutPath</key>
    <string>/var/log/9router-watchdog.log</string>
    <key>StandardErrorPath</key>
    <string>/var/log/9router-watchdog.error.log</string>
</dict>
</plist>`;

    fs.writeFileSync(plistPath, plistContent, 'utf8');

    await this.runCommand('launchctl', ['load', plistPath]);

    console.log('macOS LaunchDaemon installed successfully');
  }

  async uninstallMacOSService() {
    const plistPath = '/Library/LaunchDaemons/com.claude.9router-watchdog.plist';

    if (fs.existsSync(plistPath)) {
      await this.runCommand('launchctl', ['unload', plistPath]);
      fs.unlinkSync(plistPath);
      console.log('macOS LaunchDaemon uninstalled successfully');
    }
  }

  // Linux Service Implementation
  async installLinuxService() {
    const servicePath = '/etc/systemd/system/9router-watchdog.service';

    const serviceContent = `[Unit]
Description=9router Protocol Killer Watchdog
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=${this.options.workingDirectory || process.cwd()}
ExecStart=${process.execPath} ${path.join(__dirname, this.options.script)} --watch
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=9router-watchdog

[Install]
WantedBy=multi-user.target
`;

    fs.writeFileSync(servicePath, serviceContent, 'utf8');

    await this.runCommand('systemctl', ['daemon-reload']);
    await this.runCommand('systemctl', ['enable', '9router-watchdog.service']);

    console.log('Linux systemd service installed successfully');
  }

  async uninstallLinuxService() {
    const servicePath = '/etc/systemd/system/9router-watchdog.service';

    if (fs.existsSync(servicePath)) {
      await this.runCommand('systemctl', ['stop', '9router-watchdog.service']);
      await this.runCommand('systemctl', ['disable', '9router-watchdog.service']);
      fs.unlinkSync(servicePath);

      await this.runCommand('systemctl', ['daemon-reload']);
      console.log('Linux systemd service uninstalled successfully');
    }
  }

  async runPowerShellScript(script) {
    return new Promise((resolve, reject) => {
      const childProcess = require('child_process').spawn('powershell', [
        '-ExecutionPolicy', 'Bypass',
        '-Command', script
      ], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let output = '';

      childProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      childProcess.stderr.on('data', (data) => {
        output += data.toString();
      });

      childProcess.on('close', (code) => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(`PowerShell script failed with code ${code}: ${output}`));
        }
      });
    });
  }

  async runCommand(command, args) {
    return new Promise((resolve, reject) => {
      const childProcess = require('child_process').spawn(command, args, {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let output = '';

      childProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      childProcess.stderr.on('data', (data) => {
        output += data.toString();
      });

      childProcess.on('close', (code) => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(`Command failed with code ${code}: ${output}`));
        }
      });
    });
  }

  log(level, message) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${level}] [ServiceWrapper] ${message}`);
  }
}

module.exports = ServiceWrapper;

// CLI entry point
if (require.main === module) {
  (async () => {
    const service = new ServiceWrapper({
      workingDirectory: process.argv[2] || process.cwd(),
      script: process.argv[3] || 'watchdog.js',
      args: process.argv[4] || '--watch'
    });

    try {
      const command = process.argv.find(arg => arg.startsWith('--command='))?.split('=')[1];

      switch (command) {
        case 'install':
          await service.install();
          break;
        case 'uninstall':
          await service.uninstall();
          break;
        case 'start':
          await service.start();
          break;
        case 'stop':
          await service.stop();
          break;
        case 'status':
          console.log(JSON.stringify(service.getStatus(), null, 2));
          break;
        default:
          console.log('Usage:');
          console.log('  --command=install    Install as system service');
          console.log('  --command=uninstall  Uninstall system service');
          console.log('  --command=start      Start service');
          console.log('  --command=stop       Stop service');
          console.log('  --command=status     Show service status');
          break;
      }
    } catch (error) {
      console.error('Service operation failed:', error.message);
      process.exit(1);
    }
  })();
}