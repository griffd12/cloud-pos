#!/usr/bin/env node

/**
 * Cloud POS Service Host
 * 
 * On-premise server providing offline operation for the Cloud POS system.
 * 
 * Services:
 * - CAPS (Check And Posting Service) - Order management
 * - Print Controller - Kitchen/receipt printing
 * - KDS Controller - Kitchen display routing
 * - Payment Controller - Card terminal integration
 * 
 * Usage:
 *   node dist/index.js --cloud <https://your-pos.replit.app> --token <service-host-token>
 */

import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { Database } from './db/database.js';
import { ConfigSync } from './sync/config-sync.js';
import { TransactionSync } from './sync/transaction-sync.js';
import { CalSync } from './sync/cal-sync.js';
import { CapsService } from './services/caps.js';
import { PrintController } from './services/print-controller.js';
import { KdsController } from './services/kds-controller.js';
import { PaymentController } from './services/payment-controller.js';
import { createApiRoutes } from './routes/api.js';
import { CloudConnection } from './sync/cloud-connection.js';
import { createAuthMiddleware, createPropertyScopeMiddleware } from './middleware/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface Config {
  cloudUrl: string;
  token: string;
  serviceHostId: string;
  propertyId: string;
  port: number;
  dataDir: string;
}

const defaultConfig: Config = {
  cloudUrl: '',
  token: '',
  serviceHostId: '',
  propertyId: '',
  port: 3001,
  dataDir: path.join(__dirname, '../data'),
};

function parseArgs(): Partial<Config> {
  const args = process.argv.slice(2);
  const config: Partial<Config> = {};
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--cloud':
        config.cloudUrl = args[++i];
        break;
      case '--token':
        config.token = args[++i];
        break;
      case '--service-host-id':
        config.serviceHostId = args[++i];
        break;
      case '--property':
        config.propertyId = args[++i];
        break;
      case '--port':
        config.port = parseInt(args[++i], 10);
        break;
      case '--data-dir':
        config.dataDir = args[++i];
        break;
    }
  }
  
  return config;
}

function loadConfigFile(): Partial<Config> {
  const configPath = path.join(__dirname, '../config.json');
  if (fs.existsSync(configPath)) {
    try {
      const content = fs.readFileSync(configPath, 'utf8');
      console.log('Loaded configuration from config.json');
      return JSON.parse(content);
    } catch (e) {
      console.error('Failed to read config.json:', (e as Error).message);
    }
  }
  return {};
}

class ServiceHost {
  private config: Config;
  private app: express.Application;
  private server: http.Server;
  private wss: WebSocketServer;
  private db: Database;
  private cloudConnection: CloudConnection;
  private configSync: ConfigSync;
  private transactionSync: TransactionSync;
  private calSync: CalSync;
  private capsService: CapsService;
  private printController: PrintController;
  private kdsController: KdsController;
  private paymentController: PaymentController;
  
  constructor(config: Config) {
    this.config = config;
    
    // Ensure data directory exists
    if (!fs.existsSync(config.dataDir)) {
      fs.mkdirSync(config.dataDir, { recursive: true });
    }
    
    // Initialize database
    this.db = new Database(path.join(config.dataDir, 'service-host.db'));
    
    // Initialize cloud connection
    this.cloudConnection = new CloudConnection(config.cloudUrl, config.token, config.serviceHostId);
    
    // Initialize sync services
    this.configSync = new ConfigSync(this.db, this.cloudConnection);
    this.transactionSync = new TransactionSync(this.db, this.cloudConnection);
    this.calSync = new CalSync(this.db, this.cloudConnection, config.serviceHostId, config.dataDir);
    
    // Initialize service controllers
    this.capsService = new CapsService(this.db, this.transactionSync);
    this.printController = new PrintController(this.db);
    this.kdsController = new KdsController(this.db);
    this.paymentController = new PaymentController(this.db, this.transactionSync);
    
    // Initialize Express app
    this.app = express();
    this.app.use(express.json());
    
    // CORS for local workstations
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
      }
      next();
    });
    
    // Health check (unauthenticated)
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        version: '1.0.0',
        serviceHostId: this.config.serviceHostId,
        cloudConnected: this.cloudConnection.isConnected(),
        propertyId: this.config.propertyId,
        uptime: process.uptime(),
        installedPackages: this.calSync.getInstalledPackages(),
      });
    });
    
    // Authentication middleware for API routes
    const authMiddleware = createAuthMiddleware(this.db);
    const propertyScopeMiddleware = createPropertyScopeMiddleware();
    
    // API routes (authenticated)
    const apiRouter = createApiRoutes(
      this.capsService,
      this.printController,
      this.kdsController,
      this.paymentController,
      this.configSync
    );
    this.app.use('/api', authMiddleware, propertyScopeMiddleware, apiRouter);
    
    // Create HTTP server
    this.server = http.createServer(this.app);
    
    // WebSocket server for KDS and real-time updates
    this.wss = new WebSocketServer({ server: this.server, path: '/ws' });
    this.setupWebSocket();
  }
  
  private setupWebSocket() {
    this.wss.on('connection', (ws: WebSocket) => {
      console.log('Workstation connected via WebSocket');
      
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleWebSocketMessage(ws, message);
        } catch (e) {
          console.error('Invalid WebSocket message:', (e as Error).message);
        }
      });
      
      ws.on('close', () => {
        console.log('Workstation disconnected');
        this.kdsController.removeClient(ws);
      });
    });
  }
  
  private handleWebSocketMessage(ws: WebSocket, message: any) {
    switch (message.type) {
      case 'subscribe_kds':
        this.kdsController.addClient(ws, message.deviceId);
        break;
      case 'kds_bump':
        this.kdsController.bumpTicket(message.ticketId, message.stationId);
        break;
      case 'kds_recall':
        this.kdsController.recallTicket(message.ticketId);
        break;
      default:
        console.log('Unknown WebSocket message type:', message.type);
    }
  }
  
  async start() {
    console.log('='.repeat(60));
    console.log('Cloud POS Service Host v1.0.0');
    console.log('='.repeat(60));
    console.log(`Cloud URL: ${this.config.cloudUrl}`);
    console.log(`Service Host ID: ${this.config.serviceHostId}`);
    console.log(`Property ID: ${this.config.propertyId}`);
    console.log(`Data Directory: ${this.config.dataDir}`);
    console.log('');
    
    // Initialize database schema
    await this.db.initialize();
    console.log('Database initialized');
    
    // Connect to cloud and sync configuration
    try {
      await this.cloudConnection.connect();
      console.log('Connected to cloud');
      
      await this.configSync.syncFull();
      console.log('Configuration synced from cloud');
      
      // Start CAL deployment sync
      await this.calSync.start();
      console.log('CAL deployment sync started');
    } catch (e) {
      console.warn('Cloud connection failed, operating in offline mode:', (e as Error).message);
    }
    
    // Start transaction sync worker
    this.transactionSync.startWorker();
    
    // Start HTTP server
    this.server.listen(this.config.port, '0.0.0.0', () => {
      console.log('');
      console.log(`Service Host listening on http://0.0.0.0:${this.config.port}`);
      console.log('');
      console.log('Available endpoints:');
      console.log('  GET  /health              - Health check');
      console.log('  POST /api/caps/checks     - Create check');
      console.log('  GET  /api/caps/checks     - List open checks');
      console.log('  POST /api/caps/checks/:id/items - Add items');
      console.log('  POST /api/caps/checks/:id/send  - Send to kitchen');
      console.log('  POST /api/caps/checks/:id/pay   - Process payment');
      console.log('  POST /api/print/jobs      - Submit print job');
      console.log('  GET  /api/kds/tickets     - Get KDS tickets');
      console.log('  POST /api/payment/authorize - Authorize payment');
      console.log('  WS   /ws                  - Real-time updates');
      console.log('');
    });
    
    // Handle graceful shutdown
    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());
  }
  
  private shutdown() {
    console.log('\nShutting down Service Host...');
    this.calSync.stop();
    this.transactionSync.stopWorker();
    this.cloudConnection.disconnect();
    this.wss.close();
    this.server.close(() => {
      this.db.close();
      console.log('Service Host stopped');
      process.exit(0);
    });
  }
}

// Main
async function main() {
  const fileConfig = loadConfigFile();
  const argConfig = parseArgs();
  
  const config: Config = {
    ...defaultConfig,
    ...fileConfig,
    ...argConfig,
  };
  
  if (!config.cloudUrl) {
    console.error('Error: Cloud URL is required');
    console.error('Usage: node dist/index.js --cloud <url> --service-host-id <id> --token <token>');
    process.exit(1);
  }
  
  if (!config.serviceHostId) {
    console.error('Error: Service Host ID is required');
    console.error('Usage: node dist/index.js --cloud <url> --service-host-id <id> --token <token>');
    process.exit(1);
  }
  
  if (!config.token) {
    console.error('Error: Service Host token is required');
    process.exit(1);
  }
  
  const serviceHost = new ServiceHost(config);
  await serviceHost.start();
}

main().catch((e) => {
  console.error('Failed to start Service Host:', e);
  process.exit(1);
});
