/**
 * Uninstall CAL Client Windows Service
 */

import { Service } from 'node-windows';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const svc = new Service({
  name: 'OPS-POS CAL Client',
  script: path.join(__dirname, '..', 'dist', 'index.js'),
});

svc.on('uninstall', () => {
  console.log('Service uninstalled successfully');
});

svc.on('error', (err) => {
  console.error('Service error:', err);
});

console.log('Uninstalling OPS-POS CAL Client service...');
svc.uninstall();
