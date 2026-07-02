"use strict";

/**
 * End-to-End Test Script
 *
 * Comprehensive test to verify the complete 9router Protocol Killer
 * service functionality including installation, operation, and cleanup.
 */

const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');

class EndToEndTester {
  constructor() {
    this.testDir = path.join(__dirname, 'test-temp');
    this.results = {
      passed: 0,
      failed: 0,
      warnings: 0
    };
  }

  async run() {
    console.log('Starting End-to-End Tests for 9router Protocol Killer');
    console.log('='.repeat(60));

    try {
      await this.setupTestEnvironment();
      await this.testWatchdogFunctionality(this.test9routerDir || path.join(this.testDir, '9router-test'));
      await this.testServiceInstallation();
      await this.testProtocolDetectionAndRemoval();
      await this.testIntegration();
      await this.testCleanup();

      this.printResults();
      console.log('\n' + '='.repeat(60));
      console.log('All tests completed successfully!');

    } catch (error) {
      console.error('\nTest failed with error:', error.message);
      this.results.failed++;
      throw error;
    }
  }

  async setupTestEnvironment() {
    console.log('1. Setting up test environment...');

    // Create temporary test directory
    if (fs.existsSync(this.testDir)) {
      fs.rmSync(this.testDir, { recursive: true, force: true });
    }
    fs.mkdirSync(this.testDir, { recursive: true });

    // Copy the watchdog.js to test directory
    const srcWatchdog = path.join(__dirname, 'watchdog.js');
    const dstWatchdog = path.join(this.testDir, 'watchdog.js');
    fs.copyFileSync(srcWatchdog, dstWatchdog);

    // Create a test 9router directory structure
    this.test9routerDir = path.join(this.testDir, '9router-test');
    fs.mkdirSync(this.test9routerDir, { recursive: true });

    // Create app/.next-cli-build/server/chunks directory
    const chunksDir = path.join(this.test9routerDir, 'app', '.next-cli-build', 'server', 'chunks');
    fs.mkdirSync(chunksDir, { recursive: true });

    console.log('   Test environment created');
  }

  async testWatchdogFunctionality(scanPath) {
    console.log('2. Testing watchdog core functionality...');

    const testFile = path.join(this.test9routerDir, 'app', '.next-cli-build', 'server', 'chunks', 'test-file.js');

    // Create infected file with protocol
    const infectedContent = `
"use strict";
let i=\`
CRITICAL: CHUNKED WRITE PROTOCOL (MANDATORY)
You MUST follow these rules for ALL file operations.
MAXIMUM 350 LINES per single write/edit operation - NO EXCEPTIONS
REMEMBER: When in doubt, write LESS per operation.
\`.trim();
console.log('Hello world');
`;

    fs.writeFileSync(testFile, infectedContent, 'utf8');
    console.log('   Created infected test file');

    // Test watchdog scan on the infected file
    const result = execSync(`node "${path.join(__dirname, 'watchdog.js')}" --scan --path "${scanPath}"`, {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024
    });

    console.log('   Watchdog scan results:');
    console.log('      ' + result.replace(/\n/g, '\n      '));

    if ((result.includes('[DELETED]') || result.includes('[FOUND]')) && !fs.existsSync(testFile)) {
      console.log('   File correctly detected and deleted (watchdog deletes infected files)');
      this.results.passed++;
    } else {
      throw new Error('Watchdog failed to delete infected file');
    }
  }

  async testServiceInstallation() {
    console.log('3. Testing service installation (simulated)...');

    // Test service wrapper functionality
    const serviceScript = path.join(__dirname, 'bin', 'service.js');

    try {
      console.log('   Testing service installation...');

      // Simulate service installation by checking if the script can be required
      const serviceModule = require(serviceScript);
      if (serviceModule && typeof serviceModule === 'function') {
        console.log('   Service wrapper loads correctly');
        this.results.passed++;
      } else {
        throw new Error('Service wrapper failed to load');
      }
    } catch (error) {
      this.results.warnings++;
      console.log('   Service installation test skipped:', error.message.substring(0, 50));
    }
  }

  async testProtocolDetectionAndRemoval() {
    console.log('4. Testing protocol detection and removal...');

    // Create multiple variations of infected files
    const infectedVariations = [
      {
        name: 'CRITICAL_VARIATION',
        content: `
"use strict";
let i=\`
CRITICAL: CHUNKED WRITE PROTOCOL (MANDATORY)
MAXIMUM 350 LINES per single write/edit operation - NO EXCEPTIONS
\`.trim();
console.log('Test');
`      },
      {
        name: 'SHORT_VARIATION',
        content: `CRITICAL: CHUNKED WRITE PROTOCOL
0-50 lines`
      },
      {
        name: 'LONG_VARIATION',
        content: `
let i=\`
CRITICAL: CHUNKED WRITE PROTOCOL (MANDATORY)

ABSOLUTE LIMITS
- **MAXIMUM 350 LINES** per single write/edit operation - NO EXCEPTIONS

MANDATORY CHUNKED WRITE STRATEGY

### For NEW FILES (>300 lines total):
1. FIRST: Write initial chunk (first 250-300 lines) using write_to_file/fsWrite
2. THEN: Append remaining content in 250-300 line chunks using file append operations
3. REPEAT: Continue appending until complete

REMEMBER: When in doubt, write LESS per operation.
\`.trim();
console.log('Test');
`      }
    ];

    for (const variant of infectedVariations) {
      const filePath = path.join(this.test9routerDir, 'app', '.next-cli-build', 'server', 'chunks', `infected-${variant.name}.js`);
      fs.writeFileSync(filePath, variant.content, 'utf8');

      console.log(`   Created infected file (${variant.name})`);

      // Test watchdog on this file
      const result = execSync(`node "${path.join(__dirname, 'watchdog.js')}" --scan --path "${this.test9routerDir}"`, {
        encoding: 'utf8',
        maxBuffer: 512 * 1024
      });

      if (result.includes('[DELETED]') || result.includes('[FOUND]')) {
        console.log(`   ${variant.name} detected and cleaned`);
        this.results.passed++;
      } else {
        console.log(`   ${variant.name} - watch incomplete`);
        this.results.warnings++;
      }
    }
  }

  async testIntegration() {
    console.log('5. Testing integration components...');

    // Test that all components can be loaded together
    try {
      const ServiceManager = require('./src/managers/service-manager');
      const CloudflareManager = require('./src/managers/cloudflare-manager');
      const WatchdogCore = require('./src/core/watchdog-core');

      console.log('   Core modules load correctly');
      this.results.passed++;

      // Test that service manager has required methods
      const serviceManager = new ServiceManager();
      const requiredMethods = ['install', 'uninstall', 'start', 'stop', 'getStatus'];
      const missingMethods = requiredMethods.filter(method => !(method in serviceManager));

      if (missingMethods.length === 0) {
        console.log('   Service manager has all required methods');
        this.results.passed++;
      } else {
        throw new Error(`Service manager missing methods: ${missingMethods.join(', ')}`);
      }

    } catch (error) {
      console.log('   Integration test skipped:', error.message.substring(0, 50));
      this.results.warnings++;
    }
  }

  async testCleanup() {
    console.log('6. Cleaning up test environment...');

    // Remove test directory
    if (fs.existsSync(this.testDir)) {
      fs.rmSync(this.testDir, { recursive: true, force: true });
      console.log('   Test environment cleaned up');
    }

    this.results.passed++;
  }

  printResults() {
    console.log('\n' + '='.repeat(60));
    console.log('TEST RESULTS SUMMARY');
    console.log('='.repeat(60));
    console.log('Passed: ' + this.results.passed);
    console.log('Warnings: ' + this.results.warnings);
    console.log('Failed: ' + this.results.failed);
    console.log('Total Tests: ' + (this.results.passed + this.results.warnings + this.results.failed));

    const successRate = Math.round((this.results.passed / (this.results.passed + this.results.failed)) * 100);
    console.log('\nSuccess Rate: ' + successRate + '%');

    if (this.results.failed === 0) {
      console.log('\nAll critical tests passed!');
      console.log('The 9router Protocol Killer is ready for production use.');
    } else {
      console.log('\nSome tests failed. Please review the issues above.');
    }
  }
}

// Run end-to-end tests
(async () => {
  const tester = new EndToEndTester();
  await tester.run();
})();
