#!/usr/bin/env node

/**
 * Standalone Executable Builder for Cloud POS Service Host
 * 
 * Uses pkg to bundle Node.js runtime with the Service Host into a single
 * self-contained executable that doesn't require Node.js installation.
 * 
 * Prerequisites:
 *   npm install -g pkg
 * 
 * Usage:
 *   node scripts/build-standalone-exe.js
 * 
 * Output:
 *   cal-packages/CloudPOS-ServiceHost-v{version}-win.exe
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT, '..', 'cal-packages');
const TEMP_DIR = path.join(ROOT, '.pkg-temp');

const VERSION = require(path.join(ROOT, 'package.json')).version;
const EXE_NAME = `CloudPOS-ServiceHost-v${VERSION}-win.exe`;

console.log('='.repeat(60));
console.log(`Building Standalone Executable v${VERSION}`);
console.log('='.repeat(60));

// Check if pkg is installed
function checkPkg() {
  try {
    execSync('pkg --version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

// Build TypeScript first
console.log('\n1. Building TypeScript...');
try {
  execSync('npm run build', { cwd: ROOT, stdio: 'inherit' });
} catch (e) {
  console.error('Build failed');
  process.exit(1);
}

// Check for pkg
console.log('\n2. Checking for pkg...');
if (!checkPkg()) {
  console.log('pkg not found. Installing globally...');
  try {
    execSync('npm install -g pkg', { stdio: 'inherit' });
  } catch (e) {
    console.error('Failed to install pkg. Please run: npm install -g pkg');
    process.exit(1);
  }
}

// Create temporary directory for packaging
console.log('\n3. Preparing package...');
if (fs.existsSync(TEMP_DIR)) {
  fs.rmSync(TEMP_DIR, { recursive: true });
}
fs.mkdirSync(TEMP_DIR, { recursive: true });

// Use esbuild to bundle all ESM code into a single CommonJS file
// This resolves all imports and creates a standalone bundle pkg can handle
console.log('\n3. Bundling with esbuild...');

try {
  // First, bundle with esbuild to create a single CJS file
  execSync(`npx esbuild src/index.ts --bundle --platform=node --target=node18 --format=cjs --outfile="${path.join(TEMP_DIR, 'bundle.cjs')}" --external:better-sqlite3`, {
    cwd: ROOT,
    stdio: 'inherit'
  });
} catch (e) {
  console.error('esbuild bundling failed:', e.message);
  process.exit(1);
}

// Copy native modules that can't be bundled
// better-sqlite3 has native bindings and must be included separately
const nodeModulesSrc = path.join(ROOT, 'node_modules', 'better-sqlite3');
if (fs.existsSync(nodeModulesSrc)) {
  copyDir(nodeModulesSrc, path.join(TEMP_DIR, 'node_modules', 'better-sqlite3'));
}

// Create minimal package.json for pkg
const pkgJson = {
  name: 'cloud-pos-service-host',
  version: VERSION,
  main: 'bundle.cjs',
  bin: 'bundle.cjs',
  pkg: {
    targets: ['node18-win-x64'],
    outputPath: OUTPUT_DIR,
    assets: [
      'node_modules/better-sqlite3/**/*'
    ]
  }
};
fs.writeFileSync(
  path.join(TEMP_DIR, 'package.json'),
  JSON.stringify(pkgJson, null, 2)
);

// Create output directory
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Run pkg
console.log('\n4. Creating executable with pkg...');
console.log('   Target: Windows x64 (Node 18)');

try {
  const result = spawnSync('pkg', [
    '.',
    '--target', 'node18-win-x64',
    '--output', path.join(OUTPUT_DIR, EXE_NAME),
    '--compress', 'GZip'
  ], {
    cwd: TEMP_DIR,
    stdio: 'inherit'
  });

  if (result.status !== 0) {
    throw new Error(`pkg exited with code ${result.status}`);
  }
} catch (e) {
  console.error('Failed to create executable:', e.message);
  console.log('\nAlternative: Use the PowerShell installer instead.');
  console.log('Run: npm run package:windows');
  process.exit(1);
}

// Clean up temp directory
console.log('\n5. Cleaning up...');
fs.rmSync(TEMP_DIR, { recursive: true });

// Verify output
const exePath = path.join(OUTPUT_DIR, EXE_NAME);
if (fs.existsSync(exePath)) {
  const stats = fs.statSync(exePath);
  console.log(`\n${'='.repeat(60)}`);
  console.log('SUCCESS!');
  console.log('='.repeat(60));
  console.log(`\nExecutable: ${EXE_NAME}`);
  console.log(`Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Location: ${OUTPUT_DIR}`);
  console.log('\nThis executable includes Node.js runtime and can run');
  console.log('on any Windows machine without installing Node.js.');
  console.log('\nUsage:');
  console.log(`  1. Copy ${EXE_NAME} to target machine`);
  console.log('  2. Create config.json in same directory');
  console.log(`  3. Run: ${EXE_NAME}`);
  
  // Create manifest
  const manifest = {
    name: 'CloudPOS-ServiceHost-Standalone',
    version: VERSION,
    type: 'standalone-executable',
    file: EXE_NAME,
    size: stats.size,
    platform: 'win-x64',
    nodeVersion: '18',
    createdAt: new Date().toISOString(),
    requiresNodeInstall: false,
  };
  fs.writeFileSync(
    path.join(OUTPUT_DIR, `CloudPOS-ServiceHost-v${VERSION}-standalone.manifest.json`),
    JSON.stringify(manifest, null, 2)
  );
} else {
  console.error('Executable not found at expected path');
  process.exit(1);
}

// Helper function
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
