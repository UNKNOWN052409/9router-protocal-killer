# 9router Protocol Killer

Watchdog that detects and removes the chunked write protocol from 9router installations.

## Usage

```bash
# One-time scan of all 9router files
node watchdog.js --scan

# Persistent watch mode
node watchdog.js --watch

# Specify custom 9router path
node watchdog.js --scan --path ./custom-9router-path

# Show help
node watchdog.js --help
```

## What It Does

Scans 9router JavaScript files for the "CRITICAL: CHUNKED WRITE PROTOCOL (MANDATORY)" text and removes it. In watch mode, it monitors the 9router directory for changes and auto-removes the protocol if it reappears (e.g., after updates).
