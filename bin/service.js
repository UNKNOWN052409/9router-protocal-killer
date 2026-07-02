#!/usr/bin/env node
"use strict";

/**
 * 9Router Protocol Killer - Auto-Start Service
 *
 * Installs the watchdog to start automatically when you log in.
 * Uses the Windows Startup folder (no admin required).
 */

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const WATCHDOG_SCRIPT = path.join(__dirname, '..', 'watchdog.js');

class AutoStartService {
  constructor() {
    this.isWindows = process.platform === 'win32';
    this.isMac = process.platform === 'darwin';
    this.isLinux = process.platform === 'linux';
  }

  // === INSTALL ===
  async install() {
    console.log('🔧 Installing auto-start service...\n');

    if (this.isWindows) {
      this.installWindows();
    } else if (this.isMac) {
      this.installMac();
    } else if (this.isLinux) {
      this.installLinux();
    } else {
      console.error('❌ Unsupported platform:', process.platform);
      process.exit(1);
    }

    console.log('\n✅ Auto-start installed!');
    console.log('   The watchdog will start when you log in.');
  }

  // === UNINSTALL ===
  async uninstall() {
    console.log('🗑️  Removing auto-start service...\n');

    if (this.isWindows) {
      this.uninstallWindows();
    } else if (this.isMac) {
      this.uninstallMac();
    } else if (this.isLinux) {
      this.uninstallLinux();
    }

    console.log('\n✅ Auto-start removed!');
  }

  // === STATUS ===
  status() {
    console.log('📊 Auto-Start Status\n');

    if (this.isWindows) {
      this.statusWindows();
    } else if (this.isMac) {
      this.statusMac();
    } else if (this.isLinux) {
      this.statusLinux();
    }

    // Check if watchdog process is running
    console.log('\n🔍 Running watchdog processes:');
    try {
      const ps = this.isWindows
        ? execSync('tasklist /FI "IMAGENAME eq node.exe" /FO LIST', { encoding: 'utf8' })
        : execSync('ps aux | grep watchdog', { encoding: 'utf8' });

      if (ps.includes('watchdog')) {
        console.log('   ✅ Watchdog process is running');
      } else {
        console.log('   ⚠️  Watchdog not running (will start on next logon)');
      }
    } catch {
      console.log('   ⚠️  Could not check processes');
    }
  }

  // === WINDOWS ===
  installWindows() {
    const startupPath = path.join(
      process.env.APPDATA,
      'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup'
    );
    const batPath = path.join(startupPath, '9router-protocal-killer.bat');
    
    const batchContent = `@echo off
cd /d "${path.dirname(WATCHDOG_SCRIPT)}"
node watchdog.js --watch
`;
    
    fs.writeFileSync(batPath, batchContent, 'utf8');
    console.log('✅ Created startup file:');
    console.log('   ' + batPath);
  }

  uninstallWindows() {
    const startupPath = path.join(
      process.env.APPDATA,
      'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup'
    );
    const batPath = path.join(startupPath, '9router-protocal-killer.bat');
    
    if (fs.existsSync(batPath)) {
      fs.unlinkSync(batPath);
      console.log('✅ Removed startup file');
    } else {
      console.log('ℹ️  Startup file not found');
    }
  }

  statusWindows() {
    const startupPath = path.join(
      process.env.APPDATA,
      'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup'
    );
    const batPath = path.join(startupPath, '9router-protocal-killer.bat');
    
    if (fs.existsSync(batPath)) {
      console.log('   ✅ Auto-start is ENABLED');
      console.log('   📁 ' + batPath);
    } else {
      console.log('   ⚠️  Auto-start is NOT installed');
      console.log('   Run: node bin/service.js --install');
    }
  }

  // === macOS ===
  installMac() {
    const plistPath = path.join(
      process.env.HOME,
      'Library', 'LaunchAgents', 'com.9router-protocal-killer.plist'
    );

    const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.9router-protocal-killer</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>${WATCHDOG_SCRIPT}</string>
        <string>--watch</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${path.dirname(WATCHDOG_SCRIPT)}</string>
    <key>KeepAlive</key>
    <true/>
    <key>RunAtLoad</key>
    <true/>
</dict>
</plist>`;

    fs.mkdirSync(path.dirname(plistPath), { recursive: true });
    fs.writeFileSync(plistPath, plistContent, 'utf8');

    try {
      execSync(`launchctl unload "${plistPath}" 2>/dev/null || true`);
      execSync(`launchctl load "${plistPath}"`);
      console.log('✅ macOS LaunchAgent installed');
    } catch (error) {
      console.error('❌ Failed:', error.message);
    }
  }

  uninstallMac() {
    const plistPath = path.join(
      process.env.HOME,
      'Library', 'LaunchAgents', 'com.9router-protocal-killer.plist'
    );
    
    if (fs.existsSync(plistPath)) {
      execSync(`launchctl unload "${plistPath}" 2>/dev/null || true`);
      fs.unlinkSync(plistPath);
      console.log('✅ macOS LaunchAgent removed');
    }
  }

  statusMac() {
    const plistPath = path.join(
      process.env.HOME,
      'Library', 'LaunchAgents', 'com.9router-protocal-killer.plist'
    );
    
    if (fs.existsSync(plistPath)) {
      console.log('   ✅ Auto-start is ENABLED');
    } else {
      console.log('   ⚠️  Auto-start is NOT installed');
    }
  }

  // === LINUX ===
  installLinux() {
    const servicePath = '/etc/systemd/system/9router-protocal-killer.service';

    const serviceContent = `[Unit]
Description=9router Protocol Killer Watchdog
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/node ${WATCHDOG_SCRIPT} --watch
WorkingDirectory=${path.dirname(WATCHDOG_SCRIPT)}
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
`;

    try {
      fs.writeFileSync(servicePath, serviceContent, 'utf8');
      execSync('systemctl daemon-reload');
      execSync('systemctl enable 9router-protocal-killer.service');
      console.log('✅ Linux systemd service installed');
    } catch (error) {
      console.error('❌ Failed:', error.message);
    }
  }

  uninstallLinux() {
    const servicePath = '/etc/systemd/system/9router-protocal-killer.service';
    
    try {
      execSync('systemctl stop 9router-protocal-killer.service 2>/dev/null || true');
      execSync('systemctl disable 9router-protocal-killer.service 2>/dev/null || true');
      if (fs.existsSync(servicePath)) fs.unlinkSync(servicePath);
      execSync('systemctl daemon-reload');
      console.log('✅ Linux service removed');
    } catch (error) {
      console.error('❌ Failed:', error.message);
    }
  }

  statusLinux() {
    try {
      execSync('systemctl is-enabled 9router-protocal-killer.service');
      console.log('   ✅ Auto-start is ENABLED');
    } catch {
      console.log('   ⚠️  Auto-start is NOT installed');
    }
  }
}

// === CLI ===
function printHelp() {
  console.log(`
🛡️  9router Protocol Killer - Auto-Start

Usage:
  node bin/service.js --install      Enable auto-start on logon
  node bin/service.js --uninstall    Disable auto-start
  node bin/service.js --status       Check if auto-start is enabled

What it does:
  Sets up the watchdog to start automatically when you log in.
  This ensures infections are detected and deleted 24/7.
`);
}

// === MAIN ===
if (require.main === module) {
  const args = process.argv.slice(2);
  const service = new AutoStartService();

  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    printHelp();
  } else if (args.includes('--install') || args.includes('-i')) {
    service.install();
  } else if (args.includes('--uninstall') || args.includes('-u')) {
    service.uninstall();
  } else if (args.includes('--status') || args.includes('-s')) {
    service.status();
  } else {
    console.error('Unknown command:', args.join(' '));
    printHelp();
    process.exit(1);
  }
}

module.exports = AutoStartService;
