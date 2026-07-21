const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const repoPath = 'C:\Users\Unkno\9router-protocal-killer';
const watchdogJs = path.join(repoPath, 'watchdog.js');
const desktop = path.join(os.homedir(), 'Desktop');
const startMenu = path.join(os.getenv('APPDATA'), 'Microsoft', 'Windows', 'Start Menu', 'Programs');

function makeShortcut(target, shortcutPath, iconPath) {
  const psScript = `
$ws = New-Object -ComObject WScript.Shell
$sc = $ws.CreateShortcut('${shortcutPath.replace(/\/g, '\\')}')
$sc.TargetPath = 'node'
$sc.Arguments = '"${watchdogJs.replace(/\/g, '\\')}" --watch'
$sc.WorkingDirectory = '${repoPath.replace(/\/g, '\\')}'
$sc.IconLocation = '${iconPath.replace(/\/g, '\\')},0'
$sc.Description = '9router Protocol Killer Watchdog'
$sc.Save()
`;
  try {
    execSync(`powershell -NoProfile -Command "${psScript.replace(/"/g, '\\"').replace(/\n/g, '; ')}"`, { stdio: 'inherit' });
    console.log('Created:', shortcutPath);
  } catch (e) {
    console.error('Failed:', shortcutPath, e.message);
  }
}

const iconPath = path.join(repoPath, 'bin', 'icon.ico');
const iconFallback = '%SystemRoot%\System32\imageres.dll';
const useIcon = fs.existsSync(iconPath) ? iconPath : iconFallback;

makeShortcut(watchdogJs, path.join(desktop, '9router-Killer-Watch.lnk'), useIcon);
makeShortcut(watchdogJs, path.join(startMenu, '9router-Killer-Watch.lnk'), useIcon);

// Also write a .bat for easy launch
const batPath = path.join(desktop, '9router-Killer-Watch.bat');
fs.writeFileSync(batPath, `@echo off\r\ncd /d "${repoPath}"\r\nnode watchdog.js --watch\r\npause\r\n`);
console.log('Created:', batPath);
