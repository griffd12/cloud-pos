const fs = require('fs');
const path = require('path');

const builderConfigPath = path.join(__dirname, 'electron-builder.json');
const config = JSON.parse(fs.readFileSync(builderConfigPath, 'utf-8'));

const currentVersion = config.extraMetadata?.version || '1.0.0';
const parts = currentVersion.split('.').map(Number);

const bumpType = process.argv[2] || 'patch';

if (bumpType === 'major') {
  parts[0]++;
  parts[1] = 0;
  parts[2] = 0;
} else if (bumpType === 'minor') {
  parts[1]++;
  parts[2] = 0;
} else {
  parts[2]++;
}

const newVersion = parts.join('.');

if (!config.extraMetadata) config.extraMetadata = {};
config.extraMetadata.version = newVersion;

fs.writeFileSync(builderConfigPath, JSON.stringify(config, null, 2) + '\n');

const buildInfo = {
  version: newVersion,
  buildDate: new Date().toISOString(),
  buildNumber: Date.now(),
  previousVersion: currentVersion,
};
fs.writeFileSync(path.join(__dirname, 'build-info.json'), JSON.stringify(buildInfo, null, 2) + '\n');

console.log(`Version bumped: ${currentVersion} -> ${newVersion} (${bumpType})`);
