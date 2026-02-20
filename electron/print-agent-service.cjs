const net = require('net');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { printLogger } = require('./logger.cjs');

class PrintAgentService {
  constructor(options = {}) {
    this.serverUrl = options.serverUrl || 'https://localhost:5000';
    this.agentId = options.agentId || null;
    this.agentToken = options.agentToken || null;
    this.configDir = options.configDir || path.join(require('os').homedir(), '.cloudpos');
    this.dataDir = options.dataDir || path.join(this.configDir, 'data');

    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectDelay = 30000;
    this.reconnectTimer = null;
    this.heartbeatInterval = null;
    this.heartbeatMs = options.heartbeatMs || 30000;
    this.isConnected = false;
    this.isAuthenticated = false;
    this.isRunning = false;

    this.printerMap = new Map();
    this.jobQueue = [];
    this.activeJobs = new Map();
    this.offlineDb = options.offlineDb || null;

    this.listeners = {
      status: [],
      jobCompleted: [],
      jobFailed: [],
      error: [],
    };

    this.ensureDirectories();
    this.loadPrinterConfig();
  }

  ensureDirectories() {
    [this.configDir, this.dataDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
  }

  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => {
        try { cb(data); } catch (e) { printLogger.error('Event', 'PrintAgent event error', e.message); }
      });
    }
  }

  loadPrinterConfig() {
    try {
      const configPath = path.join(this.configDir, 'printers.json');
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        if (Array.isArray(config)) {
          config.forEach(p => {
            this.printerMap.set(p.printerId || p.name, {
              name: p.name,
              ipAddress: p.ipAddress,
              port: p.port || 9100,
              printerId: p.printerId,
              type: p.type || 'network',
            });
          });
        }
      }
    } catch (e) {
      printLogger.error('Config', 'Failed to load printer config', e.message);
    }
  }

  savePrinterConfig() {
    try {
      const configPath = path.join(this.configDir, 'printers.json');
      const printers = Array.from(this.printerMap.values());
      fs.writeFileSync(configPath, JSON.stringify(printers, null, 2));
    } catch (e) {
      printLogger.error('Config', 'Failed to save printer config', e.message);
    }
  }

  addPrinter(config) {
    const key = config.printerId || config.name;
    this.printerMap.set(key, {
      name: config.name,
      ipAddress: config.ipAddress,
      port: config.port || 9100,
      printerId: config.printerId,
      type: config.type || 'network',
    });
    this.savePrinterConfig();
    printLogger.info('Config', `Printer added: ${config.name}`, { ip: config.ipAddress, port: config.port || 9100 });
  }

  removePrinter(key) {
    this.printerMap.delete(key);
    this.savePrinterConfig();
  }

  getPrinters() {
    return Array.from(this.printerMap.values());
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    printLogger.info('Service', 'Starting print agent service');
    this.connect();
    this.processLocalQueue();
  }

  stop() {
    this.isRunning = false;
    this.isConnected = false;
    this.isAuthenticated = false;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.ws) {
      try { this.ws.close(); } catch (e) {}
      this.ws = null;
    }

    this.emit('status', { connected: false, authenticated: false, reason: 'stopped' });
    printLogger.info('Service', 'Print agent service stopped');
  }

  async connect() {
    if (!this.isRunning) return;

    try {
      const WebSocket = require('ws');
      const wsUrl = this.serverUrl
        .replace(/^https:/, 'wss:')
        .replace(/^http:/, 'ws:')
        .replace(/\/$/, '') + '/ws/print-agents';

      printLogger.info('Connect', `Connecting to ${wsUrl}`);

      this.ws = new WebSocket(wsUrl, {
        rejectUnauthorized: false,
        handshakeTimeout: 10000,
      });

      this.ws.on('open', () => {
        printLogger.info('Connect', 'WebSocket connected, authenticating');
        this.isConnected = true;
        this.reconnectAttempts = 0;

        const authMsg = { type: 'HELLO' };
        if (this.agentToken) {
          authMsg.token = this.agentToken;
        }
        if (this.agentId) {
          authMsg.agentId = this.agentId;
        }
        this.ws.send(JSON.stringify(authMsg));
      });

      this.ws.on('message', (rawData) => {
        this.handleMessage(rawData);
      });

      this.ws.on('close', (code, reason) => {
        printLogger.info('Connect', `Disconnected (code: ${code})`);
        this.isConnected = false;
        this.isAuthenticated = false;
        this.stopHeartbeat();
        this.emit('status', { connected: false, authenticated: false, reason: 'disconnected' });
        this.scheduleReconnect();
      });

      this.ws.on('error', (err) => {
        printLogger.error('Connect', `WebSocket error: ${err.message}`);
        this.emit('error', { message: err.message });
      });

    } catch (e) {
      printLogger.error('Connect', `Connection failed: ${e.message}`);
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    if (!this.isRunning) return;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), this.maxReconnectDelay);
    this.reconnectAttempts++;
    printLogger.info('Connect', `Reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempts})`);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.isAuthenticated) {
        try {
          this.ws.send(JSON.stringify({
            type: 'HEARTBEAT',
            timestamp: new Date().toISOString(),
            printers: this.getPrinters().map(p => ({
              name: p.name,
              ipAddress: p.ipAddress,
              port: p.port,
            })),
            pendingLocalJobs: this.jobQueue.length,
          }));
        } catch (e) {
          printLogger.error('Heartbeat', `Heartbeat failed: ${e.message}`);
        }
      }
    }, this.heartbeatMs);
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  handleMessage(rawData) {
    try {
      const msg = JSON.parse(rawData.toString());

      switch (msg.type) {
        case 'AUTH_OK':
          this.isAuthenticated = true;
          this.agentId = msg.agentId;
          printLogger.info('Auth', `Authenticated as: ${msg.agentName} (${msg.agentId})`);
          this.startHeartbeat();
          this.emit('status', {
            connected: true,
            authenticated: true,
            agentId: msg.agentId,
            agentName: msg.agentName,
            propertyId: msg.propertyId,
          });
          this.syncLocalQueueToCloud();
          break;

        case 'AUTH_FAIL':
          printLogger.error('Auth', `Authentication failed: ${msg.message}`);
          this.isAuthenticated = false;
          this.emit('status', { connected: true, authenticated: false, reason: msg.message });
          break;

        case 'JOB':
          this.handlePrintJob(msg);
          break;

        case 'DRAWER_KICK':
          this.handleDrawerKick(msg);
          break;

        case 'PONG':
        case 'HEARTBEAT_ACK':
          break;

        default:
          printLogger.warn('Message', `Unknown message type: ${msg.type}`);
      }
    } catch (e) {
      printLogger.error('Message', 'Failed to parse message', e.message);
    }
  }

  async handlePrintJob(msg) {
    const jobId = msg.jobId;
    const printerIp = msg.printerIp;
    const printerPort = msg.printerPort || 9100;
    const printData = msg.data;
    const printerId = msg.printerId;

    printLogger.info('Job', `Received job ${jobId}`, { printer: printerIp || printerId || 'default' });

    try {
      this.ws.send(JSON.stringify({ type: 'ACK', jobId }));
    } catch (e) {}

    let targetIp = printerIp;
    let targetPort = printerPort;

    if (!targetIp && printerId) {
      const printer = this.printerMap.get(printerId);
      if (printer) {
        targetIp = printer.ipAddress;
        targetPort = printer.port || 9100;
      }
    }

    if (!targetIp) {
      const firstPrinter = this.printerMap.values().next().value;
      if (firstPrinter) {
        targetIp = firstPrinter.ipAddress;
        targetPort = firstPrinter.port || 9100;
      }
    }

    if (!targetIp) {
      printLogger.error('Job', `No printer IP for job ${jobId}`);
      this.sendJobResult(jobId, false, 'No printer configured');
      return;
    }

    try {
      const buffer = Buffer.from(printData, 'base64');
      await this.sendToPrinter(targetIp, targetPort, buffer);
      this.sendJobResult(jobId, true);
      this.emit('jobCompleted', { jobId, printer: targetIp });
      printLogger.info('Job', `Job ${jobId} printed successfully`, { printer: `${targetIp}:${targetPort}` });
    } catch (err) {
      this.sendJobResult(jobId, false, err.message);
      this.emit('jobFailed', { jobId, printer: targetIp, error: err.message });
      printLogger.error('Job', `Job ${jobId} failed: ${err.message}`);
    }
  }

  sendJobResult(jobId, success, error) {
    if (this.ws && this.isAuthenticated) {
      try {
        this.ws.send(JSON.stringify({
          type: success ? 'DONE' : 'ERROR',
          jobId,
          ...(error ? { error } : {}),
        }));
      } catch (e) {
        printLogger.error('Job', 'Failed to send job result', e.message);
      }
    }
  }

  buildDrawerKickCommand(pin, pulseDurationMs) {
    const duration = pulseDurationMs || 200;
    const pulseOn = Math.max(1, Math.min(255, Math.round(duration / 2)));
    const pulseOff = pulseOn;
    const pinByte = pin === 'pin5' ? 0x01 : 0x00;

    printLogger.info('DrawerKick', `Building ESC/POS command: pin=${pin} (byte=0x${pinByte.toString(16).padStart(2,'0')}), pulseOn=${pulseOn}, pulseOff=${pulseOff}, duration=${duration}ms`);

    return Buffer.from([0x1B, 0x70, pinByte, pulseOn, pulseOff]);
  }

  async handleDrawerKick(msg) {
    const kickId = msg.kickId || `kick_${Date.now()}`;
    const printerIp = msg.printerIp;
    const printerPort = msg.printerPort || 9100;
    const printerId = msg.printerId;
    const pin = msg.pin || 'pin2';
    const pulseDuration = msg.pulseDuration || 200;

    printLogger.info('DrawerKick', `Received drawer kick ${kickId}`, { printer: printerIp || printerId || 'default', pin });

    let targetIp = printerIp;
    let targetPort = printerPort;

    if (!targetIp && printerId) {
      const printer = this.printerMap.get(printerId);
      if (printer) {
        targetIp = printer.ipAddress;
        targetPort = printer.port || 9100;
      }
    }

    if (!targetIp) {
      const firstPrinter = this.printerMap.values().next().value;
      if (firstPrinter) {
        targetIp = firstPrinter.ipAddress;
        targetPort = firstPrinter.port || 9100;
      }
    }

    if (!targetIp) {
      printLogger.error('DrawerKick', `No printer IP for kick ${kickId}`);
      this.sendKickResult(kickId, false, 'No printer configured for cash drawer');
      return;
    }

    try {
      const kickCommand = this.buildDrawerKickCommand(pin, pulseDuration);
      await this.sendToPrinter(targetIp, targetPort, kickCommand);
      this.sendKickResult(kickId, true);
      printLogger.info('DrawerKick', `Drawer kick ${kickId} sent successfully`, { printer: `${targetIp}:${targetPort}`, pin });
    } catch (err) {
      this.sendKickResult(kickId, false, err.message);
      printLogger.error('DrawerKick', `Drawer kick ${kickId} failed: ${err.message}`);
    }
  }

  sendKickResult(kickId, success, error) {
    if (this.ws && this.isAuthenticated) {
      try {
        this.ws.send(JSON.stringify({
          type: success ? 'KICK_DONE' : 'KICK_ERROR',
          kickId,
          ...(error ? { error } : {}),
        }));
      } catch (e) {
        printLogger.error('DrawerKick', 'Failed to send kick result', e.message);
      }
    }
  }

  async kickDrawerLocal(options = {}) {
    const pin = options.pin || 'pin2';
    const pulseDuration = options.pulseDuration || 200;
    const printerId = options.printerId;

    let targetIp = options.printerIp;
    let targetPort = options.printerPort || 9100;

    if (!targetIp && printerId) {
      const printer = this.printerMap.get(printerId);
      if (printer) {
        targetIp = printer.ipAddress;
        targetPort = printer.port || 9100;
      }
    }

    if (!targetIp) {
      const firstPrinter = this.printerMap.values().next().value;
      if (firstPrinter) {
        targetIp = firstPrinter.ipAddress;
        targetPort = firstPrinter.port || 9100;
      }
    }

    if (!targetIp) {
      throw new Error('No printer configured for cash drawer kick');
    }

    const kickCommand = this.buildDrawerKickCommand(pin, pulseDuration);
    await this.sendToPrinter(targetIp, targetPort, kickCommand);
    printLogger.info('DrawerKick', 'Local drawer kick sent', { printer: `${targetIp}:${targetPort}`, pin });
    return { success: true, printer: targetIp };
  }

  sendToPrinter(ipAddress, port, data) {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      let resolved = false;

      const cleanup = () => {
        if (!resolved) {
          resolved = true;
          socket.destroy();
        }
      };

      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error(`Printer timeout connecting to ${ipAddress}:${port}`));
      }, 10000);

      socket.connect(port, ipAddress, () => {
        socket.write(data, (err) => {
          clearTimeout(timeout);
          if (err) {
            cleanup();
            reject(err);
          } else {
            socket.end(() => {
              cleanup();
              resolve({ success: true });
            });
          }
        });
      });

      socket.on('error', (err) => {
        clearTimeout(timeout);
        cleanup();
        reject(err);
      });
    });
  }

  queueLocalPrintJob(job) {
    const localJob = {
      id: `local_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      ...job,
      createdAt: new Date().toISOString(),
      status: 'pending',
    };
    this.jobQueue.push(localJob);
    this.saveLocalQueue();
    printLogger.info('LocalQueue', `Queued local job ${localJob.id}`);

    this.processNextLocalJob();
    return localJob.id;
  }

  async processNextLocalJob() {
    const pending = this.jobQueue.filter(j => j.status === 'pending');
    if (pending.length === 0) return;

    const job = pending[0];
    job.status = 'printing';

    let targetIp = job.printerIp;
    let targetPort = job.printerPort || 9100;

    if (!targetIp && job.printerId) {
      const printer = this.printerMap.get(job.printerId);
      if (printer) {
        targetIp = printer.ipAddress;
        targetPort = printer.port || 9100;
      }
    }

    if (!targetIp) {
      const firstPrinter = this.printerMap.values().next().value;
      if (firstPrinter) {
        targetIp = firstPrinter.ipAddress;
        targetPort = firstPrinter.port || 9100;
      }
    }

    if (!targetIp) {
      job.status = 'failed';
      job.error = 'No printer configured';
      this.saveLocalQueue();
      return;
    }

    try {
      const buffer = Buffer.isBuffer(job.data) ? job.data : Buffer.from(job.data, 'base64');
      await this.sendToPrinter(targetIp, targetPort, buffer);
      job.status = 'completed';
      job.printedAt = new Date().toISOString();
      printLogger.info('LocalQueue', `Local job ${job.id} printed`, { printer: targetIp });
    } catch (err) {
      job.retries = (job.retries || 0) + 1;
      if (job.retries >= 3) {
        job.status = 'failed';
        job.error = err.message;
      } else {
        job.status = 'pending';
        job.error = err.message;
      }
      printLogger.error('LocalQueue', `Local job ${job.id} failed: ${err.message}`);
    }

    this.saveLocalQueue();

    if (this.jobQueue.some(j => j.status === 'pending')) {
      setTimeout(() => this.processNextLocalJob(), 2000);
    }
  }

  processLocalQueue() {
    this.loadLocalQueue();
    this.processNextLocalJob();
  }

  async syncLocalQueueToCloud() {
    if (!this.isAuthenticated) return;

    const completedLocal = this.jobQueue.filter(j => j.status === 'completed' && j.cloudJobId);
    for (const job of completedLocal) {
      try {
        this.ws.send(JSON.stringify({ type: 'DONE', jobId: job.cloudJobId }));
        this.jobQueue = this.jobQueue.filter(j => j.id !== job.id);
      } catch (e) {}
    }
    this.saveLocalQueue();
  }

  saveLocalQueue() {
    try {
      const queuePath = path.join(this.dataDir, 'print_queue.json');
      const activeJobs = this.jobQueue.filter(j => j.status !== 'completed' || j.cloudJobId);
      fs.writeFileSync(queuePath, JSON.stringify(activeJobs, null, 2));
    } catch (e) {
      printLogger.error('LocalQueue', 'Failed to save local queue', e.message);
    }
  }

  loadLocalQueue() {
    try {
      const queuePath = path.join(this.dataDir, 'print_queue.json');
      if (fs.existsSync(queuePath)) {
        this.jobQueue = JSON.parse(fs.readFileSync(queuePath, 'utf-8'));
      }
    } catch (e) {
      printLogger.error('LocalQueue', 'Failed to load local queue', e.message);
      this.jobQueue = [];
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      isConnected: this.isConnected,
      isAuthenticated: this.isAuthenticated,
      agentId: this.agentId,
      printers: this.getPrinters(),
      localQueueSize: this.jobQueue.filter(j => j.status === 'pending').length,
      completedJobs: this.jobQueue.filter(j => j.status === 'completed').length,
      failedJobs: this.jobQueue.filter(j => j.status === 'failed').length,
    };
  }
}

module.exports = { PrintAgentService };
