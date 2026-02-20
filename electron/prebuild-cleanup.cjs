const fs = require('fs');
const path = require('path');

const bindingGyp = path.join(__dirname, '..', 'node_modules', '@serialport', 'bindings-cpp', 'binding.gyp');

if (fs.existsSync(bindingGyp)) {
  fs.unlinkSync(bindingGyp);
  console.log('[prebuild-cleanup] Removed @serialport/bindings-cpp/binding.gyp');
  console.log('[prebuild-cleanup] serialport will use prebuilt win32-x64 binary');
} else {
  console.log('[prebuild-cleanup] binding.gyp already removed, skipping');
}
