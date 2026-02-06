const net = require('net');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

class EMVTerminalManager extends EventEmitter {
  constructor(dataDir) {
    super();
    this.dataDir = dataDir;
    this.pendingPaymentsPath = path.join(dataDir, 'pending_payments.json');
    this.activeConnections = new Map();
    this.ensureStorage();
  }

  ensureStorage() {
    if (!fs.existsSync(this.pendingPaymentsPath)) {
      fs.writeFileSync(this.pendingPaymentsPath, '[]');
    }
  }

  async sendPaymentToTerminal(config) {
    const { address, port, amount, transactionType, timeout } = config;
    const terminalPort = port || 9100;
    const timeoutMs = (timeout || 120) * 1000;

    return new Promise((resolve, reject) => {
      const client = new net.Socket();
      let responseData = Buffer.alloc(0);
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          client.destroy();
          reject(new Error('Terminal communication timed out'));
        }
      }, timeoutMs);

      client.connect(terminalPort, address, () => {
        const payload = this.buildTerminalPayload(amount, transactionType);
        client.write(payload);
      });

      client.on('data', (data) => {
        responseData = Buffer.concat([responseData, data]);
        const parsed = this.parseTerminalResponse(responseData);
        if (parsed.complete) {
          clearTimeout(timer);
          if (!settled) {
            settled = true;
            client.end();
            resolve(parsed);
          }
        }
      });

      client.on('error', (err) => {
        clearTimeout(timer);
        if (!settled) {
          settled = true;
          reject(err);
        }
      });

      client.on('close', () => {
        clearTimeout(timer);
        if (!settled) {
          settled = true;
          if (responseData.length > 0) {
            resolve(this.parseTerminalResponse(responseData));
          } else {
            reject(new Error('Connection closed without response'));
          }
        }
      });
    });
  }

  async cancelTerminalAction(address, port) {
    return new Promise((resolve, reject) => {
      const client = new net.Socket();
      const timer = setTimeout(() => {
        client.destroy();
        resolve({ success: false, reason: 'timeout' });
      }, 5000);

      client.connect(port || 9100, address, () => {
        const cancelCmd = this.buildCancelPayload();
        client.write(cancelCmd);
        clearTimeout(timer);
        client.end();
        resolve({ success: true });
      });

      client.on('error', (err) => {
        clearTimeout(timer);
        resolve({ success: false, reason: err.message });
      });
    });
  }

  buildTerminalPayload(amount, transactionType) {
    const type = transactionType || 'sale';
    const amountStr = amount.toString().padStart(12, '0');
    const payload = {
      type,
      amount: amountStr,
      currency: 'USD',
      timestamp: new Date().toISOString(),
    };
    const jsonStr = JSON.stringify(payload);
    const header = Buffer.alloc(4);
    header.writeUInt32BE(jsonStr.length, 0);
    return Buffer.concat([header, Buffer.from(jsonStr, 'utf-8')]);
  }

  buildCancelPayload() {
    const payload = JSON.stringify({ type: 'cancel', timestamp: new Date().toISOString() });
    const header = Buffer.alloc(4);
    header.writeUInt32BE(payload.length, 0);
    return Buffer.concat([header, Buffer.from(payload, 'utf-8')]);
  }

  parseTerminalResponse(buffer) {
    try {
      const text = buffer.toString('utf-8').trim();
      if (!text) return { complete: false };

      let json;
      try {
        json = JSON.parse(text);
      } catch (e) {
        const jsonStart = text.indexOf('{');
        const jsonEnd = text.lastIndexOf('}');
        if (jsonStart >= 0 && jsonEnd > jsonStart) {
          json = JSON.parse(text.substring(jsonStart, jsonEnd + 1));
        } else {
          return { complete: false };
        }
      }

      return {
        complete: true,
        approved: json.approved || json.status === 'approved' || json.responseCode === '00',
        authCode: json.authCode || json.authorization_code || json.approvalCode,
        transactionId: json.transactionId || json.reference || json.referenceNumber,
        cardType: json.cardType || json.card_brand || json.cardBrand,
        lastFour: json.lastFour || json.last4 || json.maskedPan?.slice(-4),
        entryMethod: json.entryMethod || json.entry_mode || 'chip',
        tipAmount: json.tipAmount || json.tip || 0,
        totalAmount: json.totalAmount || json.total,
        responseCode: json.responseCode || json.response_code,
        responseMessage: json.responseMessage || json.message || json.status,
        raw: json,
      };
    } catch (e) {
      return { complete: false };
    }
  }

  storeOfflinePayment(paymentData) {
    try {
      const payments = JSON.parse(fs.readFileSync(this.pendingPaymentsPath, 'utf-8'));
      payments.push({
        ...paymentData,
        id: `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        storedAt: new Date().toISOString(),
        synced: false,
      });
      fs.writeFileSync(this.pendingPaymentsPath, JSON.stringify(payments, null, 2));
      return { success: true, offlineId: payments[payments.length - 1].id };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  getPendingPayments() {
    try {
      const payments = JSON.parse(fs.readFileSync(this.pendingPaymentsPath, 'utf-8'));
      return payments.filter(p => !p.synced);
    } catch (e) {
      return [];
    }
  }

  markPaymentSynced(id) {
    try {
      const payments = JSON.parse(fs.readFileSync(this.pendingPaymentsPath, 'utf-8'));
      const payment = payments.find(p => p.id === id);
      if (payment) {
        payment.synced = true;
        payment.syncedAt = new Date().toISOString();
      }
      fs.writeFileSync(this.pendingPaymentsPath, JSON.stringify(payments, null, 2));
    } catch (e) {
      console.error('Failed to mark payment synced:', e.message);
    }
  }
}

module.exports = { EMVTerminalManager };
