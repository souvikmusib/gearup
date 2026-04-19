import { Express } from 'express';
import { authenticate } from '../common/middleware/auth';

// Module route imports — added as modules are built
import authRoutes from '../modules/auth/auth.routes';
import publicRoutes from '../modules/public/public.routes';
import customerRoutes from '../modules/customers/customer.routes';
import vehicleRoutes from '../modules/vehicles/vehicle.routes';
import serviceRequestRoutes from '../modules/service-requests/service-request.routes';
import appointmentRoutes from '../modules/appointments/appointment.routes';
import jobCardRoutes from '../modules/job-cards/job-card.routes';
import workerRoutes from '../modules/workers/worker.routes';
import inventoryRoutes from '../modules/inventory/inventory.routes';
import invoiceRoutes from '../modules/invoices/invoice.routes';
import paymentRoutes from '../modules/payments/payment.routes';
import expenseRoutes from '../modules/expenses/expense.routes';
import notificationRoutes from '../modules/notifications/notification.routes';
import reportRoutes from '../modules/reports/report.routes';
import logRoutes from '../modules/logs/log.routes';
import settingsRoutes from '../modules/settings/settings.routes';
import adminUserRoutes from '../modules/admin-users/admin-user.routes';
import uploadRoutes from '../modules/uploads/upload.routes';

export function registerRoutes(app: Express) {
  // Public (no auth)
  app.use('/api/public', publicRoutes);
  app.use('/api/admin/auth', authRoutes);

  // Admin (authenticated)
  app.use('/api/admin/customers', authenticate, customerRoutes);
  app.use('/api/admin/vehicles', authenticate, vehicleRoutes);
  app.use('/api/admin/service-requests', authenticate, serviceRequestRoutes);
  app.use('/api/admin/appointments', authenticate, appointmentRoutes);
  app.use('/api/admin/job-cards', authenticate, jobCardRoutes);
  app.use('/api/admin/workers', authenticate, workerRoutes);
  app.use('/api/admin/inventory', authenticate, inventoryRoutes);
  app.use('/api/admin/invoices', authenticate, invoiceRoutes);
  app.use('/api/admin/payments', authenticate, paymentRoutes);
  app.use('/api/admin/expenses', authenticate, expenseRoutes);
  app.use('/api/admin/notifications', authenticate, notificationRoutes);
  app.use('/api/admin/reports', authenticate, reportRoutes);
  app.use('/api/admin/logs', authenticate, logRoutes);
  app.use('/api/admin/settings', authenticate, settingsRoutes);
  app.use('/api/admin/admin-users', authenticate, adminUserRoutes);
  app.use('/api/admin/uploads', authenticate, uploadRoutes);
}
