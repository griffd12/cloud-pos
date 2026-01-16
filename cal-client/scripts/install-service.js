/**
 * Install CAL Client as Windows Service
 */

import { Service } from 'node-windows';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const svc = new Service({
  name: 'OPS-POS CAL Client',
  description: 'CAL Client - Background service for managing workstation software deployments',
  script: path.join(__dirname, '..', 'dist', 'index.js'),
  nodeOptions: [],
  env: [{
    name: 'NODE_ENV',
    value: 'production'
  }]
});

svc.on('install', () => {
  console.log('Service installed successfully');
  console.log('Starting service...');
  svc.start();
});

svc.on('start', () => {
  console.log('Service started');
});

svc.on('alreadyinstalled', () => {
  console.log('Service is already installed');
});

svc.on('error', (err) => {
  console.error('Service error:', err);
});

console.log('Installing OPS-POS CAL Client service...');
svc.install();
