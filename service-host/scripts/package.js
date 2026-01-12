#!/usr/bin/env node

/**
 * Package Script for Service Host
 * 
 * Creates a distributable package that can be downloaded via CAL.
 * 
 * Usage: node scripts/package.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DIST_DIR = path.join(ROOT, 'dist');
const PACKAGE_DIR = path.join(ROOT, 'package');
const OUTPUT_DIR = path.join(ROOT, '..', 'cal-packages');

const VERSION = require(path.join(ROOT, 'package.json')).version;
const PACKAGE_NAME = `ServiceHost-v${VERSION}`;

console.log('='.repeat(50));
console.log(`Packaging Service Host v${VERSION}`);
console.log('='.repeat(50));

// Clean and create directories
if (fs.existsSync(PACKAGE_DIR)) {
  fs.rmSync(PACKAGE_DIR, { recursive: true });
}
fs.mkdirSync(PACKAGE_DIR, { recursive: true });

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Build TypeScript
console.log('\n1. Building TypeScript...');
try {
  execSync('npm run build', { cwd: ROOT, stdio: 'inherit' });
} catch (e) {
  console.error('Build failed');
  process.exit(1);
}

// Copy files
console.log('\n2. Copying files...');

// Copy dist folder
copyDir(DIST_DIR, path.join(PACKAGE_DIR, 'dist'));

// Copy package.json (production version)
const pkg = require(path.join(ROOT, 'package.json'));
const prodPkg = {
  name: pkg.name,
  version: pkg.version,
  description: pkg.description,
  main: pkg.main,
  scripts: {
    start: pkg.scripts.start,
  },
  dependencies: pkg.dependencies,
  engines: pkg.engines,
};
fs.writeFileSync(
  path.join(PACKAGE_DIR, 'package.json'),
  JSON.stringify(prodPkg, null, 2)
);

// Copy config example
if (fs.existsSync(path.join(ROOT, 'config.example.json'))) {
  fs.copyFileSync(
    path.join(ROOT, 'config.example.json'),
    path.join(PACKAGE_DIR, 'config.example.json')
  );
}

// Copy README
if (fs.existsSync(path.join(ROOT, 'README.md'))) {
  fs.copyFileSync(
    path.join(ROOT, 'README.md'),
    path.join(PACKAGE_DIR, 'README.md')
  );
}

// Create data directory placeholder
fs.mkdirSync(path.join(PACKAGE_DIR, 'data'), { recursive: true });
fs.writeFileSync(
  path.join(PACKAGE_DIR, 'data', '.gitkeep'),
  '# This directory stores the local SQLite database\n'
);

// Create install scripts
console.log('\n3. Creating install scripts...');

// Windows install script
fs.writeFileSync(
  path.join(PACKAGE_DIR, 'install.bat'),
  `@echo off
echo Installing Cloud POS Service Host v${VERSION}
echo.

REM Check Node.js
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed
    echo Please install Node.js 18 or later from https://nodejs.org
    pause
    exit /b 1
)

REM Install dependencies
echo Installing dependencies...
npm install --production

echo.
echo Installation complete!
echo.
echo To configure:
echo   1. Copy config.example.json to config.json
echo   2. Edit config.json with your cloud URL and token
echo.
echo To run:
echo   npm start
echo.
pause
`
);

// Linux install script
fs.writeFileSync(
  path.join(PACKAGE_DIR, 'install.sh'),
  `#!/bin/bash
echo "Installing Cloud POS Service Host v${VERSION}"
echo

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed"
    echo "Please install Node.js 18 or later"
    exit 1
fi

# Install dependencies
echo "Installing dependencies..."
npm install --production

echo
echo "Installation complete!"
echo
echo "To configure:"
echo "  1. Copy config.example.json to config.json"
echo "  2. Edit config.json with your cloud URL and token"
echo
echo "To run:"
echo "  npm start"
echo
`
);
fs.chmodSync(path.join(PACKAGE_DIR, 'install.sh'), '755');

// Create systemd service file for Linux
fs.writeFileSync(
  path.join(PACKAGE_DIR, 'cloud-pos-service-host.service'),
  `[Unit]
Description=Cloud POS Service Host
After=network.target

[Service]
Type=simple
User=pos
WorkingDirectory=/opt/cloud-pos/service-host
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
`
);

// Create zip file
console.log('\n4. Creating package archive...');
const archiver = require('archiver');
const output = fs.createWriteStream(path.join(OUTPUT_DIR, `${PACKAGE_NAME}.zip`));
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
  console.log(`\nPackage created: ${PACKAGE_NAME}.zip (${archive.pointer()} bytes)`);
  console.log(`Location: ${OUTPUT_DIR}`);
  
  // Create manifest
  const manifest = {
    name: 'ServiceHost',
    version: VERSION,
    packageFile: `${PACKAGE_NAME}.zip`,
    size: archive.pointer(),
    createdAt: new Date().toISOString(),
    requirements: {
      nodejs: '>=18.0.0',
      os: ['windows', 'linux'],
    },
  };
  fs.writeFileSync(
    path.join(OUTPUT_DIR, `${PACKAGE_NAME}.manifest.json`),
    JSON.stringify(manifest, null, 2)
  );
  
  console.log(`Manifest: ${PACKAGE_NAME}.manifest.json`);
  console.log('\nDone!');
});

archive.on('error', (err) => {
  throw err;
});

archive.pipe(output);
archive.directory(PACKAGE_DIR, false);
archive.finalize();

// Helper function to copy directory
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
