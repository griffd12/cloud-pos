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
      const { workstationId } = req.body;
      const items = caps.addItems(req.params.id, req.body.items || [req.body], workstationId);
      res.json({ items });
    } catch (e) {
      const error = e as Error;
      if (error.message.includes('locked by another')) {
        return res.status(409).json({ error: error.message });
      }
      res.status(400).json({ error: error.message });
    }
  });
  
  // Send to kitchen
  router.post('/caps/checks/:id/send', (req, res) => {
    try {
      const { workstationId } = req.body;
      const result = caps.sendToKitchen(req.params.id, workstationId);
      
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
      const { reason, workstationId } = req.body;
      caps.voidItem(req.params.id, req.params.itemId, reason, workstationId);
      res.json({ success: true });
    } catch (e) {
      const error = e as Error;
      if (error.message.includes('locked by another')) {
        return res.status(409).json({ error: error.message });
      }
      res.status(400).json({ error: error.message });
    }
  });
  
  // Add payment
  router.post('/caps/checks/:id/pay', (req, res) => {
    try {
      const { workstationId, ...paymentParams } = req.body;
      const payment = caps.addPayment(req.params.id, paymentParams, workstationId);
      res.json(payment);
    } catch (e) {
      const error = e as Error;
      if (error.message.includes('locked by another')) {
        return res.status(409).json({ error: error.message });
      }
      res.status(400).json({ error: error.message });
    }
  });
  
  // Close check
  router.post('/caps/checks/:id/close', (req, res) => {
    try {
      const { workstationId } = req.body;
      caps.closeCheck(req.params.id, workstationId);
      res.json({ success: true });
    } catch (e) {
      const error = e as Error;
      if (error.message.includes('locked by another')) {
        return res.status(409).json({ error: error.message });
      }
      res.status(400).json({ error: error.message });
    }
  });
  
  // Void check
  router.post('/caps/checks/:id/void', (req, res) => {
    try {
      const { reason, workstationId } = req.body;
      caps.voidCheck(req.params.id, reason, workstationId);
      res.json({ success: true });
    } catch (e) {
      const error = e as Error;
      if (error.message.includes('locked by another')) {
        return res.status(409).json({ error: error.message });
      }
      res.status(400).json({ error: error.message });
    }
  });
  
  // ============================================================================
  // CHECK LOCKING - Multi-workstation concurrency control
  // ============================================================================
  
  // Acquire lock on a check
  router.post('/caps/checks/:id/lock', (req, res) => {
    try {
      const { workstationId, employeeId } = req.body;
      if (!workstationId || !employeeId) {
        return res.status(400).json({ error: 'workstationId and employeeId required' });
      }
      const result = caps.acquireLock(req.params.id, workstationId, employeeId);
      if (!result.success) {
        return res.status(409).json({ 
          error: 'Check is locked by another workstation',
          lockedBy: result.lockedBy 
        });
      }
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });
  
  // Release lock on a check
  router.post('/caps/checks/:id/unlock', (req, res) => {
    try {
      const { workstationId } = req.body;
      if (!workstationId) {
        return res.status(400).json({ error: 'workstationId required' });
      }
      caps.releaseLock(req.params.id, workstationId);
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });
  
  // Get lock info for a check
  router.get('/caps/checks/:id/lock', (req, res) => {
    try {
      const info = caps.getLockInfo(req.params.id);
      res.json(info);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Refresh lock (extend expiration)
  router.post('/caps/checks/:id/lock/refresh', (req, res) => {
    try {
      const { workstationId, employeeId } = req.body;
      if (!workstationId || !employeeId) {
        return res.status(400).json({ error: 'workstationId and employeeId required' });
      }
      const success = caps.refreshLock(req.params.id, workstationId, employeeId);
      if (!success) {
        return res.status(409).json({ error: 'Could not refresh lock' });
      }
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });
  
  // Release all locks for a workstation (on disconnect)
  router.post('/caps/workstation/:workstationId/release-locks', (req, res) => {
    try {
      caps.releaseAllLocks(req.params.workstationId);
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });
  
  // Configure check number range for a workstation
  router.post('/caps/workstation/:workstationId/check-range', (req, res) => {
    try {
      const { start, end } = req.body;
      if (typeof start !== 'number' || typeof end !== 'number') {
        return res.status(400).json({ error: 'start and end numbers required' });
      }
      caps.setCheckNumberRange(req.params.workstationId, start, end);
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
  
  // Get service charges
  router.get('/config/service-charges', (req, res) => {
    try {
      const serviceCharges = config.getServiceCharges();
      res.json(serviceCharges);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Get employees
  router.get('/config/employees', (req, res) => {
    try {
      const employees = config.getEmployees();
      res.json(employees);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Get employee by ID
  router.get('/config/employees/:id', (req, res) => {
    try {
      const employee = config.getEmployee(req.params.id);
      if (!employee) {
        return res.status(404).json({ error: 'Employee not found' });
      }
      res.json(employee);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Get workstations
  router.get('/config/workstations', (req, res) => {
    try {
      const workstations = config.getWorkstations();
      res.json(workstations);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Get printers
  router.get('/config/printers', (req, res) => {
    try {
      const printers = config.getPrinters();
      res.json(printers);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Get KDS devices
  router.get('/config/kds-devices', (req, res) => {
    try {
      const kdsDevices = config.getKdsDevices();
      res.json(kdsDevices);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Get order devices
  router.get('/config/order-devices', (req, res) => {
    try {
      const orderDevices = config.getOrderDevices();
      res.json(orderDevices);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Get POS layout for RVC
  router.get('/config/pos-layout', (req, res) => {
    try {
      const rvcId = req.query.rvcId as string;
      const orderType = req.query.orderType as string | undefined;
      if (!rvcId) {
        return res.status(400).json({ error: 'rvcId required' });
      }
      const layout = config.getPosLayoutForRvc(rvcId, orderType);
      if (!layout) {
        return res.status(404).json({ error: 'No layout found for RVC' });
      }
      const cells = config.getPosLayoutCells(layout.id);
      res.json({ ...layout, cells });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Get menu item with modifiers
  router.get('/config/menu-items/:id', (req, res) => {
    try {
      const item = config.getMenuItemWithModifiers(req.params.id);
      if (!item) {
        return res.status(404).json({ error: 'Menu item not found' });
      }
      res.json(item);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Get menu items by SLU
  router.get('/config/slus/:id/items', (req, res) => {
    try {
      const items = config.getMenuItemsBySlu(req.params.id);
      res.json(items);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Get SLUs by RVC
  router.get('/config/rvcs/:id/slus', (req, res) => {
    try {
      const slus = config.getSlusByRvc(req.params.id);
      res.json(slus);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Get roles
  router.get('/config/roles', (req, res) => {
    try {
      const roles = config.getRoles();
      res.json(roles);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Get payment processors
  router.get('/config/payment-processors', (req, res) => {
    try {
      const processors = config.getPaymentProcessors();
      res.json(processors);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Get payment processor by ID
  router.get('/config/payment-processors/:id', (req, res) => {
    try {
      const processor = config.getPaymentProcessor(req.params.id);
      if (!processor) {
        return res.status(404).json({ error: 'Payment processor not found' });
      }
      res.json(processor);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Get RVCs
  router.get('/config/rvcs', (req, res) => {
    try {
      const rvcs = config.getRvcs();
      res.json(rvcs);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Get RVC by ID
  router.get('/config/rvcs/:id', (req, res) => {
    try {
      const rvc = config.getRvc(req.params.id);
      if (!rvc) {
        return res.status(404).json({ error: 'RVC not found' });
      }
      res.json(rvc);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Get property
  router.get('/config/property', (req, res) => {
    try {
      const property = config.getProperty();
      if (!property) {
        return res.status(404).json({ error: 'Property not found' });
      }
      res.json(property);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Get major groups
  router.get('/config/major-groups', (req, res) => {
    try {
      const majorGroups = config.getMajorGroups();
      res.json(majorGroups);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Get family groups by major group
  router.get('/config/major-groups/:id/family-groups', (req, res) => {
    try {
      const familyGroups = config.getFamilyGroups(req.params.id);
      res.json(familyGroups);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Get print classes
  router.get('/config/print-classes', (req, res) => {
    try {
      const printClasses = config.getPrintClasses();
      res.json(printClasses);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Get job codes
  router.get('/config/job-codes', (req, res) => {
    try {
      const jobCodes = config.getJobCodes();
      res.json(jobCodes);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // ============================================================================
  // Loyalty
  // ============================================================================
  
  // Get loyalty programs
  router.get('/loyalty/programs', (req, res) => {
    try {
      const programs = config.getLoyaltyPrograms();
      res.json(programs);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Get loyalty program by ID
  router.get('/loyalty/programs/:id', (req, res) => {
    try {
      const program = config.getLoyaltyProgram(req.params.id);
      if (!program) {
        return res.status(404).json({ error: 'Loyalty program not found' });
      }
      res.json(program);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Lookup loyalty member by phone
  router.get('/loyalty/members/phone/:phone', (req, res) => {
    try {
      const member = config.getLoyaltyMemberByPhone(req.params.phone);
      if (!member) {
        return res.status(404).json({ error: 'Loyalty member not found' });
      }
      const enrollments = config.getLoyaltyMemberEnrollments(member.id);
      res.json({ ...member, enrollments });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Lookup loyalty member by email
  router.get('/loyalty/members/email/:email', (req, res) => {
    try {
      const member = config.getLoyaltyMemberByEmail(req.params.email);
      if (!member) {
        return res.status(404).json({ error: 'Loyalty member not found' });
      }
      const enrollments = config.getLoyaltyMemberEnrollments(member.id);
      res.json({ ...member, enrollments });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Get member enrollments
  router.get('/loyalty/members/:id/enrollments', (req, res) => {
    try {
      const enrollments = config.getLoyaltyMemberEnrollments(req.params.id);
      res.json(enrollments);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Get loyalty member by ID
  router.get('/loyalty/members/:id', (req, res) => {
    try {
      const member = config.getLoyaltyMember(req.params.id);
      if (!member) {
        return res.status(404).json({ error: 'Loyalty member not found' });
      }
      const enrollments = config.getLoyaltyMemberEnrollments(member.id);
      res.json({ ...member, enrollments });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // ============================================================================
  // Terminal Devices (PED/Payment terminals)
  // ============================================================================
  
  // Get terminal devices
  router.get('/config/terminal-devices', (req, res) => {
    try {
      const devices = config.getTerminalDevices();
      res.json(devices);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Get terminal device by ID
  router.get('/config/terminal-devices/:id', (req, res) => {
    try {
      const device = config.getTerminalDevice(req.params.id);
      if (!device) {
        return res.status(404).json({ error: 'Terminal device not found' });
      }
      res.json(device);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // ============================================================================
  // Fiscal Periods
  // ============================================================================
  
  // Get fiscal periods
  router.get('/fiscal/periods', (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 30;
      const periods = config.getFiscalPeriods(limit);
      res.json(periods);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Get active fiscal period
  router.get('/fiscal/periods/active', (req, res) => {
    try {
      const period = config.getActiveFiscalPeriod();
      if (!period) {
        return res.status(404).json({ error: 'No active fiscal period' });
      }
      res.json(period);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Get fiscal period by ID
  router.get('/fiscal/periods/:id', (req, res) => {
    try {
      const period = config.getFiscalPeriod(req.params.id);
      if (!period) {
        return res.status(404).json({ error: 'Fiscal period not found' });
      }
      res.json(period);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // ============================================================================
  // Sync Operations
  // ============================================================================
  
  // Get sync status
  router.get('/sync/status', (req, res) => {
    try {
      const status = config.getStatus();
      res.json(status);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Trigger full sync
  router.post('/sync/full', async (req, res) => {
    try {
      const result = await config.syncFull();
      if (result.success) {
        res.json({ 
          success: true, 
          message: `Synced ${result.recordCount} records`,
          recordCount: result.recordCount 
        });
      } else {
        res.status(500).json({ 
          success: false, 
          error: result.error 
        });
      }
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Trigger delta sync
  router.post('/sync/delta', async (req, res) => {
    try {
      const result = await config.syncDelta();
      if (result.success) {
        res.json({ 
          success: true, 
          message: `Applied ${result.changeCount} changes`,
          changeCount: result.changeCount 
        });
      } else {
        res.status(500).json({ 
          success: false, 
          error: result.error 
        });
      }
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Start auto-sync (background periodic sync)
  router.post('/sync/auto/start', (req, res) => {
    try {
      const intervalMs = parseInt(req.query.interval as string) || 120000;
      config.startAutoSync(intervalMs);
      res.json({ 
        success: true, 
        message: `Auto-sync started (every ${intervalMs / 1000}s)` 
      });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  // Stop auto-sync
  router.post('/sync/auto/stop', (req, res) => {
    try {
      config.stopAutoSync();
      res.json({ success: true, message: 'Auto-sync stopped' });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  
  return router;
}
