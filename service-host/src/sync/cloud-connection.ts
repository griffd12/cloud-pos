/**
 * Cloud Connection Manager
 * 
 * Handles WebSocket connection to cloud for real-time sync
 * and HTTP requests for API calls.
 */

import { WebSocket } from 'ws';

export class CloudConnection {
  private cloudUrl: string;
  private token: string;
  private serviceHostId: string;
  private ws: WebSocket | null = null;
  private connected: boolean = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private messageHandlers: Map<string, (data: any) => void> = new Map();
  
  constructor(cloudUrl: string, token: string, serviceHostId: string) {
    this.cloudUrl = cloudUrl.replace(/\/$/, ''); // Remove trailing slash
    this.token = token;
    this.serviceHostId = serviceHostId;
  }
  
  getServiceHostId(): string {
    return this.serviceHostId;
  }
  
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsUrl = this.cloudUrl.replace(/^http/, 'ws') + `/ws/service-host?serviceHostId=${encodeURIComponent(this.serviceHostId)}&token=${encodeURIComponent(this.token)}`;
      
      this.ws = new WebSocket(wsUrl);
      
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 10000);
      
      this.ws.on('open', () => {
        clearTimeout(timeout);
        console.log('WebSocket connected to cloud');
        
        // Authenticate
        this.ws!.send(JSON.stringify({
          type: 'AUTHENTICATE',
          token: this.token,
        }));
      });
      
      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          
          if (message.type === 'AUTH_OK') {
            this.connected = true;
            console.log('Authenticated with cloud');
            resolve();
          } else if (message.type === 'AUTH_FAIL') {
            reject(new Error(message.message || 'Authentication failed'));
          } else {
            this.handleMessage(message);
          }
        } catch (e) {
          console.error('Failed to parse cloud message:', (e as Error).message);
        }
      });
      
      this.ws.on('close', () => {
        this.connected = false;
        console.log('Cloud connection closed');
        this.scheduleReconnect();
      });
      
      this.ws.on('error', (err) => {
        clearTimeout(timeout);
        console.error('Cloud WebSocket error:', err.message);
        reject(err);
      });
    });
  }
  
  private handleMessage(message: any): void {
    const handler = this.messageHandlers.get(message.type);
    if (handler) {
      handler(message);
    } else {
      console.log('Unhandled cloud message:', message.type);
    }
  }
  
  onMessage(type: string, handler: (data: any) => void): void {
    this.messageHandlers.set(type, handler);
  }
  
  send(message: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }
  
  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        await this.connect();
      } catch (e) {
        console.error('Reconnection failed:', (e as Error).message);
      }
    }, 5000);
  }
  
  isConnected(): boolean {
    return this.connected;
  }
  
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }
  
  getCloudUrl(): string {
    return this.cloudUrl;
  }
  
  getToken(): string {
    return this.token;
  }
  
  // HTTP API methods
  async fetch<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.cloudUrl}${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'x-service-host-token': this.token,
        ...options.headers,
      },
    });
    
    if (!response.ok) {
      throw new Error(`Cloud API error: ${response.status} ${response.statusText}`);
    }
    
    return response.json();
  }
  
  // Download file from cloud with authentication
  async downloadFile(endpoint: string): Promise<ArrayBuffer> {
    const url = `${this.cloudUrl}${endpoint}`;
    
    const response = await fetch(url, {
      headers: {
        'x-service-host-token': this.token,
      },
    });
    
    if (!response.ok) {
      throw new Error(`Download failed: ${response.status} ${response.statusText}`);
    }
    
    return response.arrayBuffer();
  }
  
  async get<T = any>(endpoint: string): Promise<T> {
    return this.fetch<T>(endpoint, { method: 'GET' });
  }
  
  async post<T = any>(endpoint: string, data: any): Promise<T> {
    return this.fetch<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
}
