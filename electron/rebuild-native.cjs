const fs = require('fs');
const path = require('path');

exports.default = async function(context) {
  const appDir = context.appDir || process.cwd();
  const bindingGyp = path.join(appDir, 'node_modules', '@serialport', 'bindings-cpp', 'binding.gyp');

  if (fs.existsSync(bindingGyp)) {
    console.log('[rebuild-native] Removing @serialport/bindings-cpp/binding.gyp');
    console.log('[rebuild-native] This prevents @electron/rebuild from attempting node-gyp on serialport');
    console.log('[rebuild-native] serialport will use prebuilt binaries from prebuilds/win32-x64/');
    fs.unlinkSync(bindingGyp);
  }
};
