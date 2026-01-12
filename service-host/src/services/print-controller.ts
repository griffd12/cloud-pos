/**
 * Print Controller
 * 
 * Handles all printing operations:
 * - Receipt printing
 * - Kitchen tickets
 * - Reports
 * 
 * Sends print jobs to network printers via TCP/IP.
 */

import { Database } from '../db/database.js';
import { randomUUID } from 'crypto';
import net from 'net';

export class PrintController {
  private db: Database;
  private printTimeout: number = 10000;
  private processingQueue: boolean = false;
  
  constructor(db: Database) {
    this.db = db;
    
    // Start queue processor
    setInterval(() => this.processQueue(), 2000);
  }
  
  // Submit a print job
  async submitJob(params: PrintJobParams): Promise<PrintJob> {
    const id = randomUUID();
    
    // Get printer info
    const printer = this.db.getPrinter(params.printerId);
    const printerIp = params.printerIp || printer?.ipAddress;
    const printerPort = params.printerPort || printer?.port || 9100;
    
    if (!printerIp) {
      throw new Error(`No IP address for printer: ${params.printerId}`);
    }
    
    // Build ESC/POS content
    const content = this.buildPrintContent(params.jobType, params.content);
    
    this.db.run(
      `INSERT INTO print_queue (id, printer_id, printer_ip, printer_port, job_type, content, status)
       VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
      [id, params.printerId, printerIp, printerPort, params.jobType, content]
    );
    
    const job: PrintJob = {
      id,
      printerId: params.printerId,
      printerIp,
      printerPort,
      jobType: params.jobType,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    
    // Try to print immediately
    this.processQueue();
    
    return job;
  }
  
  // Get job status
  getJob(id: string): PrintJob | null {
    const row = this.db.get<PrintJobRow>(
      'SELECT * FROM print_queue WHERE id = ?',
      [id]
    );
    
    if (!row) return null;
    
    return {
      id: row.id,
      printerId: row.printer_id,
      printerIp: row.printer_ip,
      printerPort: row.printer_port,
      jobType: row.job_type,
      status: row.status as PrintJob['status'],
      error: row.error || undefined,
      createdAt: row.created_at,
    };
  }
  
  // Process pending print jobs
  private async processQueue(): Promise<void> {
    if (this.processingQueue) return;
    this.processingQueue = true;
    
    try {
      const jobs = this.db.all<PrintJobRow>(
        `SELECT * FROM print_queue WHERE status = 'pending' AND attempts < 3 ORDER BY created_at LIMIT 5`
      );
      
      for (const job of jobs) {
        await this.printJob(job);
      }
    } finally {
      this.processingQueue = false;
    }
  }
  
  private async printJob(job: PrintJobRow): Promise<void> {
    // Mark as printing
    this.db.run(
      `UPDATE print_queue SET status = 'printing', attempts = attempts + 1 WHERE id = ?`,
      [job.id]
    );
    
    try {
      await this.sendToPrinter(job.printer_ip, job.printer_port, job.content);
      
      // Mark as completed
      this.db.run(
        `UPDATE print_queue SET status = 'completed' WHERE id = ?`,
        [job.id]
      );
      
      console.log(`Print job ${job.id} completed`);
    } catch (e) {
      const error = (e as Error).message;
      console.error(`Print job ${job.id} failed:`, error);
      
      // Mark as failed or pending for retry
      const status = job.attempts >= 2 ? 'failed' : 'pending';
      this.db.run(
        `UPDATE print_queue SET status = ?, error = ? WHERE id = ?`,
        [status, error, job.id]
      );
    }
  }
  
  private sendToPrinter(ip: string, port: number, data: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      let connected = false;
      
      const timeout = setTimeout(() => {
        if (!connected) {
          socket.destroy();
          reject(new Error(`Connection timeout to ${ip}:${port}`));
        }
      }, this.printTimeout);
      
      socket.connect(port, ip, () => {
        connected = true;
        clearTimeout(timeout);
        console.log(`Connected to printer at ${ip}:${port}`);
        
        socket.write(data, (err) => {
          if (err) {
            socket.destroy();
            reject(new Error(`Write error: ${err.message}`));
          } else {
            setTimeout(() => {
              socket.end();
              resolve();
            }, 500);
          }
        });
      });
      
      socket.on('error', (err) => {
        clearTimeout(timeout);
        reject(new Error(`Socket error: ${err.message}`));
      });
    });
  }
  
  // Build ESC/POS content based on job type
  private buildPrintContent(jobType: string, content: any): Buffer {
    const commands: number[] = [];
    
    // Initialize printer
    commands.push(0x1B, 0x40); // ESC @
    
    // Center alignment
    commands.push(0x1B, 0x61, 0x01); // ESC a 1
    
    if (jobType === 'receipt') {
      this.buildReceiptContent(commands, content);
    } else if (jobType === 'kitchen') {
      this.buildKitchenTicketContent(commands, content);
    } else if (jobType === 'report') {
      this.buildReportContent(commands, content);
    }
    
    // Cut paper
    commands.push(0x1D, 0x56, 0x00); // GS V 0
    
    return Buffer.from(commands);
  }
  
  private buildReceiptContent(commands: number[], content: any): void {
    // Header
    if (content.header) {
      this.addText(commands, content.header, { bold: true, doubleWidth: true });
      this.addNewLine(commands);
    }
    
    // Date/Time
    if (content.dateTime) {
      this.addText(commands, content.dateTime);
      this.addNewLine(commands);
    }
    
    // Separator
    this.addText(commands, '-'.repeat(32));
    this.addNewLine(commands);
    
    // Left align for items
    commands.push(0x1B, 0x61, 0x00);
    
    // Items
    if (content.items && Array.isArray(content.items)) {
      for (const item of content.items) {
        const qty = item.quantity || 1;
        const name = item.name || '';
        const price = this.formatMoney(item.total || item.price || 0);
        
        this.addText(commands, `${qty}x ${name}`);
        this.addNewLine(commands);
        
        // Right-align price
        commands.push(0x1B, 0x61, 0x02);
        this.addText(commands, price);
        this.addNewLine(commands);
        commands.push(0x1B, 0x61, 0x00);
        
        // Modifiers
        if (item.modifiers && Array.isArray(item.modifiers)) {
          for (const mod of item.modifiers) {
            this.addText(commands, `  - ${mod.name || mod}`);
            this.addNewLine(commands);
          }
        }
      }
    }
    
    // Separator
    this.addText(commands, '-'.repeat(32));
    this.addNewLine(commands);
    
    // Totals
    if (content.totals) {
      commands.push(0x1B, 0x61, 0x02); // Right align
      
      if (content.totals.subtotal !== undefined) {
        this.addText(commands, `Subtotal: ${this.formatMoney(content.totals.subtotal)}`);
        this.addNewLine(commands);
      }
      if (content.totals.tax !== undefined) {
        this.addText(commands, `Tax: ${this.formatMoney(content.totals.tax)}`);
        this.addNewLine(commands);
      }
      if (content.totals.total !== undefined) {
        this.addText(commands, `TOTAL: ${this.formatMoney(content.totals.total)}`, { bold: true });
        this.addNewLine(commands);
      }
    }
    
    // Footer
    commands.push(0x1B, 0x61, 0x01); // Center
    this.addNewLine(commands);
    this.addText(commands, 'Thank you!');
    this.addNewLine(commands);
    this.addNewLine(commands);
  }
  
  private buildKitchenTicketContent(commands: number[], content: any): void {
    // Large text for order number
    commands.push(0x1D, 0x21, 0x11); // Double height and width
    
    if (content.orderType) {
      this.addText(commands, content.orderType.toUpperCase());
      this.addNewLine(commands);
    }
    
    if (content.checkNumber) {
      this.addText(commands, `#${content.checkNumber}`);
      this.addNewLine(commands);
    }
    
    // Normal size
    commands.push(0x1D, 0x21, 0x00);
    
    if (content.tableNumber) {
      this.addText(commands, `Table: ${content.tableNumber}`);
      this.addNewLine(commands);
    }
    
    // Separator
    this.addText(commands, '='.repeat(32));
    this.addNewLine(commands);
    
    // Left align for items
    commands.push(0x1B, 0x61, 0x00);
    
    // Items
    if (content.items && Array.isArray(content.items)) {
      for (const item of content.items) {
        const qty = item.quantity || 1;
        const name = item.name || '';
        
        // Bold for quantity and name
        commands.push(0x1B, 0x45, 0x01);
        this.addText(commands, `${qty}x ${name}`);
        commands.push(0x1B, 0x45, 0x00);
        this.addNewLine(commands);
        
        // Modifiers
        if (item.modifiers && Array.isArray(item.modifiers)) {
          for (const mod of item.modifiers) {
            this.addText(commands, `   > ${mod.name || mod}`);
            this.addNewLine(commands);
          }
        }
        
        this.addNewLine(commands);
      }
    }
    
    // Footer with time
    commands.push(0x1B, 0x61, 0x01); // Center
    this.addText(commands, new Date().toLocaleTimeString());
    this.addNewLine(commands);
    this.addNewLine(commands);
  }
  
  private buildReportContent(commands: number[], content: any): void {
    // Title
    if (content.title) {
      this.addText(commands, content.title, { bold: true });
      this.addNewLine(commands);
    }
    
    this.addText(commands, '='.repeat(32));
    this.addNewLine(commands);
    
    // Left align
    commands.push(0x1B, 0x61, 0x00);
    
    // Report lines
    if (content.lines && Array.isArray(content.lines)) {
      for (const line of content.lines) {
        this.addText(commands, line);
        this.addNewLine(commands);
      }
    }
    
    this.addNewLine(commands);
  }
  
  private addText(commands: number[], text: string, options?: { bold?: boolean; doubleWidth?: boolean }): void {
    if (options?.bold) {
      commands.push(0x1B, 0x45, 0x01); // Bold on
    }
    if (options?.doubleWidth) {
      commands.push(0x1D, 0x21, 0x10); // Double width
    }
    
    for (const char of text) {
      commands.push(char.charCodeAt(0));
    }
    
    if (options?.bold) {
      commands.push(0x1B, 0x45, 0x00); // Bold off
    }
    if (options?.doubleWidth) {
      commands.push(0x1D, 0x21, 0x00); // Normal
    }
  }
  
  private addNewLine(commands: number[]): void {
    commands.push(0x0A); // LF
  }
  
  private formatMoney(cents: number): string {
    return `$${(cents / 100).toFixed(2)}`;
  }
}

interface PrintJobParams {
  printerId: string;
  printerIp?: string;
  printerPort?: number;
  jobType: 'receipt' | 'kitchen' | 'report';
  content: any;
}

interface PrintJob {
  id: string;
  printerId: string;
  printerIp: string;
  printerPort: number;
  jobType: string;
  status: 'pending' | 'printing' | 'completed' | 'failed';
  error?: string;
  createdAt: string;
}

interface PrintJobRow {
  id: string;
  printer_id: string;
  printer_ip: string;
  printer_port: number;
  job_type: string;
  content: Buffer;
  status: string;
  attempts: number;
  error: string | null;
  created_at: string;
}

export type { PrintJob, PrintJobParams };
