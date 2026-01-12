/**
 * API Routes for Service Host
 * 
 * Provides REST endpoints for workstations to interact with:
 * - CAPS (checks, items, payments)
 * - Print jobs
 * - KDS tickets
 * - Payment processing
 * - Configuration
 */

import { Router } from 'express';
import { CapsService } from '../services/caps.js';
import { PrintController } from '../services/print-controller.js';
import { KdsController } from '../services/kds-controller.js';
import { PaymentController } from '../services/payment-controller.js';
import { ConfigSync } from '../sync/config-sync.js';

export function createApiRoutes(
  caps: CapsService,
  print: PrintController,
  kds: KdsController,
  payment: PaymentController,
  config: ConfigSync
): Router {
  const router = Router();
  
  // ============================================================================
  // CAPS - Check & Posting Service
  // ============================================================================
  
  // Create a new check
  router.post('/caps/checks', (req, res) => {
    try {
      const check = caps.createCheck(req.body);
      res.json(check);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });
  
  // Get open checks
  router.get('/caps/checks', (req, res) => {
    try {
      const rvcId = req.query.rvcId as string | undefined;
      const checks = caps.getOpenChecks(rvcId);
      res.json(checks);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Get specific check
  router.get('/caps/checks/:id', (req, res) => {
    try {
      const check = caps.getCheck(req.params.id);
      if (!check) {
        return res.status(404).json({ error: 'Check not found' });
      }
      res.json(check);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Add items to check
  router.post('/caps/checks/:id/items', (req, res) => {
    try {
      const items = caps.addItems(req.params.id, req.body.items || [req.body]);
      res.json({ items });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });
  
  // Send to kitchen
  router.post('/caps/checks/:id/send', (req, res) => {
    try {
      const result = caps.sendToKitchen(req.params.id);
      
      // Also create KDS ticket
      const check = caps.getCheck(req.params.id);
      if (check) {
        const unsentItems = check.items.filter(i => !i.voided);
        if (unsentItems.length > 0) {
          kds.createTicket({
            checkId: check.id,
            checkNumber: check.checkNumber,
            orderType: check.orderType,
            items: unsentItems.map(i => ({
              name: i.name,
              quantity: i.quantity,
              modifiers: i.modifiers?.map(m => m.name || m),
              seatNumber: i.seatNumber,
            })),
          });
        }
      }
      
      res.json(result);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });
  
  // Void an item
  router.post('/caps/checks/:id/items/:itemId/void', (req, res) => {
    try {
      caps.voidItem(req.params.id, req.params.itemId, req.body.reason);
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });
  
  // Add payment
  router.post('/caps/checks/:id/pay', (req, res) => {
    try {
      const payment = caps.addPayment(req.params.id, req.body);
      res.json(payment);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });
  
  // Close check
  router.post('/caps/checks/:id/close', (req, res) => {
    try {
      caps.closeCheck(req.params.id);
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });
  
  // Void check
  router.post('/caps/checks/:id/void', (req, res) => {
    try {
      caps.voidCheck(req.params.id, req.body.reason);
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });
  
  // ============================================================================
  // Print Controller
  // ============================================================================
  
  // Submit print job
  router.post('/print/jobs', async (req, res) => {
    try {
      const job = await print.submitJob(req.body);
      res.json(job);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });
  
  // Get print job status
  router.get('/print/jobs/:id', (req, res) => {
    try {
      const job = print.getJob(req.params.id);
      if (!job) {
        return res.status(404).json({ error: 'Job not found' });
      }
      res.json(job);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // ============================================================================
  // KDS Controller
  // ============================================================================
  
  // Get active tickets
  router.get('/kds/tickets', (req, res) => {
    try {
      const stationId = req.query.stationId as string | undefined;
      const tickets = kds.getActiveTickets(stationId);
      res.json(tickets);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Get bumped tickets (for recall)
  router.get('/kds/tickets/bumped', (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const tickets = kds.getBumpedTickets(limit);
      res.json(tickets);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Get specific ticket
  router.get('/kds/tickets/:id', (req, res) => {
    try {
      const ticket = kds.getTicket(req.params.id);
      if (!ticket) {
        return res.status(404).json({ error: 'Ticket not found' });
      }
      res.json(ticket);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Bump ticket
  router.post('/kds/tickets/:id/bump', (req, res) => {
    try {
      kds.bumpTicket(req.params.id, req.body.stationId);
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });
  
  // Recall ticket
  router.post('/kds/tickets/:id/recall', (req, res) => {
    try {
      kds.recallTicket(req.params.id);
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });
  
  // Priority bump
  router.post('/kds/tickets/:id/priority', (req, res) => {
    try {
      kds.priorityBump(req.params.id);
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });
  
  // ============================================================================
  // Payment Controller
  // ============================================================================
  
  // Authorize payment
  router.post('/payment/authorize', async (req, res) => {
    try {
      const result = await payment.authorize(req.body);
      res.json(result);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });
  
  // Capture payment
  router.post('/payment/:id/capture', async (req, res) => {
    try {
      const result = await payment.capture(req.params.id);
      res.json(result);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });
  
  // Void payment
  router.post('/payment/:id/void', async (req, res) => {
    try {
      const result = await payment.void(req.params.id, req.body.reason);
      res.json(result);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });
  
  // Refund payment
  router.post('/payment/:id/refund', async (req, res) => {
    try {
      const result = await payment.refund(req.params.id, req.body.amount);
      res.json(result);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });
  
  // Get payment
  router.get('/payment/:id', (req, res) => {
    try {
      const record = payment.getPayment(req.params.id);
      if (!record) {
        return res.status(404).json({ error: 'Payment not found' });
      }
      res.json(record);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // ============================================================================
  // Configuration
  // ============================================================================
  
  // Get menu items
  router.get('/config/menu-items', (req, res) => {
    try {
      const items = config.getMenuItems();
      res.json(items);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Get SLUs (categories)
  router.get('/config/slus', (req, res) => {
    try {
      const slus = config.getSlus();
      res.json(slus);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Get tenders
  router.get('/config/tenders', (req, res) => {
    try {
      const tenders = config.getTenders();
      res.json(tenders);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Get discounts
  router.get('/config/discounts', (req, res) => {
    try {
      const discounts = config.getDiscounts();
      res.json(discounts);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Get tax groups
  router.get('/config/tax-groups', (req, res) => {
    try {
      const taxGroups = config.getTaxGroups();
      res.json(taxGroups);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  return router;
}
