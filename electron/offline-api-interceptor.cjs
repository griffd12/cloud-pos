const crypto = require('crypto');

class OfflineApiInterceptor {
  constructor(offlineDb) {
    this.db = offlineDb;
    this.isOffline = false;
  }

  setOffline(offline) {
    this.isOffline = offline;
  }

  canHandleOffline(method, pathname) {
    if (!this.isOffline) return false;

    if (method === 'GET') {
      const readEndpoints = [
        /^\/api\/menu-items/,
        /^\/api\/modifier-groups/,
        /^\/api\/condiment-groups/,
        /^\/api\/combo-meals/,
        /^\/api\/employees/,
        /^\/api\/tax-rates/,
        /^\/api\/discounts/,
        /^\/api\/tender-types/,
        /^\/api\/order-types/,
        /^\/api\/service-charges/,
        /^\/api\/major-groups/,
        /^\/api\/family-groups/,
        /^\/api\/menu-item-classes/,
        /^\/api\/menu-item-availability/,
        /^\/api\/revenue-centers/,
        /^\/api\/properties/,
        /^\/api\/printers/,
        /^\/api\/workstations/,
        /^\/api\/checks/,
        /^\/api\/health/,
      ];
      return readEndpoints.some(re => re.test(pathname));
    }

    if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
      const writeEndpoints = [
        /^\/api\/checks/,
        /^\/api\/check-items/,
        /^\/api\/payments/,
        /^\/api\/time-punches/,
        /^\/api\/time-clock/,
        /^\/api\/print-jobs/,
        /^\/api\/employees\/.*\/authenticate/,
      ];
      return writeEndpoints.some(re => re.test(pathname));
    }

    if (method === 'DELETE') {
      const deleteEndpoints = [
        /^\/api\/checks\/[^/]+$/,
        /^\/api\/check-items\/[^/]+$/,
      ];
      return deleteEndpoints.some(re => re.test(pathname));
    }

    return false;
  }

  handleRequest(method, pathname, query, body) {
    if (method === 'GET') {
      return this.handleGet(pathname, query);
    } else if (method === 'POST') {
      return this.handlePost(pathname, body);
    } else if (method === 'PUT' || method === 'PATCH') {
      return this.handleUpdate(pathname, body);
    } else if (method === 'DELETE') {
      return this.handleDelete(pathname);
    }
    return null;
  }

  handleGet(pathname, query) {
    if (pathname === '/api/health') {
      return {
        status: 200,
        data: { status: 'offline', mode: 'offline', timestamp: new Date().toISOString() },
      };
    }

    const entityMap = {
      '/api/menu-items': 'menu_items',
      '/api/modifier-groups': 'modifier_groups',
      '/api/condiment-groups': 'condiment_groups',
      '/api/combo-meals': 'combo_meals',
      '/api/employees': 'employees',
      '/api/tax-rates': 'tax_rates',
      '/api/discounts': 'discounts',
      '/api/tender-types': 'tender_types',
      '/api/order-types': 'order_types',
      '/api/service-charges': 'service_charges',
      '/api/major-groups': 'major_groups',
      '/api/family-groups': 'family_groups',
      '/api/menu-item-classes': 'menu_item_classes',
      '/api/menu-item-availability': 'menu_item_availability',
      '/api/revenue-centers': 'revenue_centers',
      '/api/properties': 'properties',
      '/api/printers': 'printers',
      '/api/workstations': 'workstations',
    };

    const idMatch = pathname.match(/^(\/api\/[\w-]+)\/([a-f0-9-]+)$/);
    if (idMatch) {
      const basePath = idMatch[1];
      const id = idMatch[2];
      const table = entityMap[basePath];
      if (table) {
        const entity = this.db.getEntity(table, id);
        if (entity) return { status: 200, data: entity };
        return { status: 404, data: { message: 'Not found (offline)' } };
      }
    }

    const table = entityMap[pathname];
    if (table) {
      const enterpriseId = query?.enterpriseId;
      const data = this.db.getEntityList(table, enterpriseId);
      return { status: 200, data };
    }

    if (pathname.startsWith('/api/checks')) {
      const rvcId = query?.rvcId;
      const status = query?.status;
      const checks = this.db.getOfflineChecks(rvcId, status);
      return { status: 200, data: checks };
    }

    return null;
  }

  handlePost(pathname, body) {
    if (pathname === '/api/checks' || pathname === '/api/checks/') {
      return this.createOfflineCheck(body);
    }

    if (pathname.match(/^\/api\/checks\/[^/]+\/items/)) {
      return this.addOfflineCheckItem(pathname, body);
    }

    if (pathname === '/api/payments' || pathname === '/api/payments/') {
      return this.createOfflinePayment(body);
    }

    if (pathname.match(/^\/api\/employees\/[^/]+\/authenticate/)) {
      return this.authenticateOffline(pathname, body);
    }

    if (pathname === '/api/time-clock/punch' || pathname.match(/^\/api\/time-punches/)) {
      return this.handleOfflineTimePunch(body);
    }

    if (pathname === '/api/print-jobs' || pathname === '/api/print-jobs/') {
      return this.queueOfflinePrintJob(body);
    }

    this.db.queueOperation('offline_post', pathname, 'POST', body, 5);
    return { status: 202, data: { message: 'Queued for sync', offline: true } };
  }

  handleUpdate(pathname, body) {
    const checkMatch = pathname.match(/^\/api\/checks\/([a-f0-9-]+)$/);
    if (checkMatch) {
      return this.updateOfflineCheck(checkMatch[1], body);
    }

    this.db.queueOperation('offline_update', pathname, 'PATCH', body, 5);
    return { status: 202, data: { message: 'Queued for sync', offline: true } };
  }

  createOfflineCheck(body) {
    const id = `offline_${crypto.randomUUID()}`;
    const checkNumber = this.db.getNextCheckNumber(body.rvcId);
    const check = {
      id,
      checkNumber,
      rvcId: body.rvcId,
      employeeId: body.employeeId,
      customerId: body.customerId || null,
      orderType: body.orderType || 'dine-in',
      status: 'open',
      subtotal: '0.00',
      taxTotal: '0.00',
      discountTotal: '0.00',
      total: '0.00',
      guestCount: body.guestCount || 1,
      items: [],
      payments: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isOffline: true,
    };

    this.db.saveOfflineCheck(check);
    this.db.queueOperation('create_check', '/api/checks', 'POST', body, 1);

    return { status: 201, data: check };
  }

  addOfflineCheckItem(pathname, body) {
    const checkIdMatch = pathname.match(/^\/api\/checks\/([^/]+)\/items/);
    if (!checkIdMatch) return null;

    const checkId = checkIdMatch[1];
    const check = this.db.getOfflineCheck(checkId);
    if (!check) return { status: 404, data: { message: 'Check not found (offline)' } };

    const itemId = `offline_item_${crypto.randomUUID()}`;
    const item = {
      id: itemId,
      checkId,
      menuItemId: body.menuItemId,
      menuItemName: body.menuItemName,
      quantity: body.quantity || 1,
      unitPrice: body.unitPrice || '0.00',
      totalPrice: body.totalPrice || body.unitPrice || '0.00',
      modifiers: body.modifiers || [],
      condiments: body.condiments || [],
      seatNumber: body.seatNumber || 1,
      createdAt: new Date().toISOString(),
    };

    if (!check.items) check.items = [];
    check.items.push(item);

    let subtotal = 0;
    check.items.forEach(i => {
      subtotal += parseFloat(i.totalPrice || i.unitPrice || 0) * (i.quantity || 1);
    });
    check.subtotal = subtotal.toFixed(2);
    check.updatedAt = new Date().toISOString();

    this.db.saveOfflineCheck(check);
    this.db.queueOperation('add_check_item', `/api/checks/${checkId}/items`, 'POST', body, 2);

    return { status: 201, data: item };
  }

  updateOfflineCheck(checkId, body) {
    const check = this.db.getOfflineCheck(checkId);
    if (!check) return { status: 404, data: { message: 'Check not found (offline)' } };

    Object.assign(check, body, { updatedAt: new Date().toISOString() });
    this.db.saveOfflineCheck(check);
    this.db.queueOperation('update_check', `/api/checks/${checkId}`, 'PATCH', body, 2);

    return { status: 200, data: check };
  }

  createOfflinePayment(body) {
    const paymentId = `offline_pay_${crypto.randomUUID()}`;
    const payment = {
      id: paymentId,
      checkId: body.checkId,
      tenderId: body.tenderId,
      tenderName: body.tenderName,
      amount: body.amount,
      tipAmount: body.tipAmount || '0.00',
      changeAmount: body.changeAmount || '0.00',
      paidAt: new Date().toISOString(),
      isOffline: true,
    };

    this.db.saveOfflinePayment(payment);

    const check = this.db.getOfflineCheck(body.checkId);
    if (check) {
      if (!check.payments) check.payments = [];
      check.payments.push(payment);

      let totalPaid = 0;
      check.payments.forEach(p => totalPaid += parseFloat(p.amount || 0));
      const totalDue = parseFloat(check.total || check.subtotal || 0);
      if (totalPaid >= totalDue) {
        check.status = 'closed';
        check.closedAt = new Date().toISOString();
      }
      check.updatedAt = new Date().toISOString();
      this.db.saveOfflineCheck(check);
    }

    this.db.queueOperation('create_payment', '/api/payments', 'POST', body, 1);

    return { status: 201, data: payment };
  }

  authenticateOffline(pathname, body) {
    const employeeIdMatch = pathname.match(/^\/api\/employees\/([^/]+)\/authenticate/);
    if (!employeeIdMatch) return null;

    const pin = body.pin;
    const employees = this.db.getEntityList('employees');

    const employee = employees.find(emp => {
      if (emp.pin === pin) return true;
      if (emp.posPin === pin) return true;
      return false;
    });

    if (employee) {
      return {
        status: 200,
        data: {
          success: true,
          employee: {
            id: employee.id,
            firstName: employee.firstName,
            lastName: employee.lastName,
            roleId: employee.roleId,
            roleName: employee.roleName,
            jobTitle: employee.jobTitle,
          },
          offlineAuth: true,
        },
      };
    }

    return {
      status: 401,
      data: { success: false, message: 'Invalid PIN (offline authentication)' },
    };
  }

  handleOfflineTimePunch(body) {
    const punchId = `offline_punch_${crypto.randomUUID()}`;
    const punch = {
      id: punchId,
      employeeId: body.employeeId,
      punchType: body.punchType || 'clock_in',
      punchTime: new Date().toISOString(),
      isOffline: true,
    };

    this.db.saveOfflineTimePunch(punch);
    this.db.queueOperation('time_punch', '/api/time-clock/punch', 'POST', body, 3);

    return { status: 201, data: punch };
  }

  queueOfflinePrintJob(body) {
    const jobId = `offline_print_${crypto.randomUUID()}`;
    const job = {
      id: jobId,
      printerId: body.printerId,
      printerIp: body.printerIp,
      printerPort: body.printerPort || 9100,
      jobType: body.jobType,
      escposData: body.escPosData,
      status: 'pending',
    };

    this.db.savePrintJob(job);
    return { status: 201, data: { id: jobId, status: 'pending', offline: true } };
  }

  handleDelete(pathname) {
    const checkMatch = pathname.match(/^\/api\/checks\/([a-f0-9-]+)$/);
    if (checkMatch) {
      const checkId = checkMatch[1];
      const check = this.db.getOfflineCheck(checkId);
      if (!check) return { status: 404, data: { message: 'Check not found (offline)' } };
      check.status = 'voided';
      check.updatedAt = new Date().toISOString();
      this.db.saveOfflineCheck(check);
      this.db.queueOperation('void_check', `/api/checks/${checkId}`, 'DELETE', null, 2);
      return { status: 200, data: { message: 'Check voided (offline)', offline: true } };
    }

    const checkItemMatch = pathname.match(/^\/api\/check-items\/([a-f0-9_-]+)$/);
    if (checkItemMatch) {
      this.db.queueOperation('delete_check_item', pathname, 'DELETE', null, 3);
      return { status: 200, data: { message: 'Item removal queued for sync', offline: true } };
    }

    this.db.queueOperation('offline_delete', pathname, 'DELETE', null, 5);
    return { status: 202, data: { message: 'Delete queued for sync', offline: true } };
  }
}

module.exports = { OfflineApiInterceptor };
