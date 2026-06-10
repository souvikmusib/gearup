// Re-export Prisma enums as string unions for frontend consumption (no Prisma dep needed)

export type AdminUserStatus = 'ACTIVE' | 'INACTIVE' | 'LOCKED';
export type ActorType = 'ADMIN' | 'WORKER' | 'SYSTEM' | 'PUBLIC';
export type VehicleType = 'CAR' | 'BIKE' | 'SCOOTY' | 'OTHER';

export type ServiceRequestStatus =
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'APPOINTMENT_PENDING'
  | 'APPOINTMENT_CONFIRMED'
  | 'CONVERTED_TO_JOB'
  | 'CANCELLED'
  | 'CLOSED';

export type AppointmentStatus =
  | 'REQUESTED'
  | 'PENDING_REVIEW'
  | 'CONFIRMED'
  | 'RESCHEDULED'
  | 'CANCELLED'
  | 'NO_SHOW'
  | 'CHECKED_IN'
  | 'COMPLETED';

// Full DB-level JobCard status (matches schema.prisma `enum JobCardStatus`).
// Some UI screens project this onto a simplified set via dbToSimple/simpleToDb mappers.
export type JobCardStatus =
  | 'CREATED'
  | 'UNDER_INSPECTION'
  | 'ESTIMATE_PREPARED'
  | 'AWAITING_CUSTOMER_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'PARTS_PENDING'
  | 'WORK_IN_PROGRESS'
  | 'QUALITY_CHECK'
  | 'READY_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'CLOSED';

export type ApprovalStatus = 'NOT_REQUIRED' | 'PENDING' | 'APPROVED' | 'REJECTED';
export type WorkerStatus = 'ACTIVE' | 'INACTIVE' | 'ON_LEAVE';
export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type HolidayType =
  | 'PUBLIC_HOLIDAY'
  | 'WEEKLY_OFF'
  | 'BUSINESS_CLOSURE'
  | 'MAINTENANCE_SHUTDOWN'
  | 'CUSTOM_BLOCK';

export type InventoryMovementType =
  | 'STOCK_IN'
  | 'STOCK_OUT'
  | 'ADJUSTMENT_INCREASE'
  | 'ADJUSTMENT_DECREASE'
  | 'RESERVED'
  | 'RELEASED'
  | 'CONSUMED'
  | 'RETURNED';

export type InvoiceStatus = 'DRAFT' | 'FINALIZED' | 'CANCELLED';
export type PaymentStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'REFUNDED' | 'WAIVED';
export type InvoiceLineType =
  | 'PART'
  | 'LABOR'
  | 'SERVICE_CHARGE'
  | 'CUSTOM_CHARGE'
  | 'DISCOUNT_ADJUSTMENT'
  | 'AMC';
export type NotificationChannel = 'WHATSAPP' | 'EMAIL';
export type NotificationStatus =
  | 'QUEUED'
  | 'PROCESSING'
  | 'SENT'
  | 'DELIVERED'
  | 'FAILED'
  | 'DEAD_LETTER';
export type PaymentMode = 'CASH' | 'CARD' | 'UPI' | 'BANK_TRANSFER' | 'CHEQUE' | 'OTHER';

// RBAC
export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  RECEPTIONIST: 'RECEPTIONIST',
  MECHANIC: 'MECHANIC',
  INVENTORY_MANAGER: 'INVENTORY_MANAGER',
} as const;

export type RoleKey = (typeof ROLES)[keyof typeof ROLES];

export const PERMISSIONS = {
  DASHBOARD_VIEW: 'dashboard.view',
  ADMIN_USERS_MANAGE: 'admin-users.manage',
  CUSTOMERS_VIEW: 'customers.view',
  CUSTOMERS_EDIT: 'customers.edit',
  VEHICLES_VIEW: 'vehicles.view',
  VEHICLES_EDIT: 'vehicles.edit',
  SERVICE_REQUESTS_VIEW: 'service-requests.view',
  SERVICE_REQUESTS_EDIT: 'service-requests.edit',
  APPOINTMENTS_VIEW: 'appointments.view',
  APPOINTMENTS_CONFIRM: 'appointments.confirm',
  APPOINTMENTS_CHECKIN: 'appointments.checkin',
  APPOINTMENTS_NOSHOW: 'appointments.noshow',
  JOB_CARDS_CREATE: 'job-cards.create',
  JOB_CARDS_UPDATE_STATUS: 'job-cards.update-status',
  JOB_CARDS_ASSIGN_WORKERS: 'job-cards.assign-workers',
  JOB_CARDS_VIEW_OWN: 'job-cards.view-own',
  JOB_CARDS_DELETE: 'job-cards.delete',
  WORKERS_MANAGE: 'workers.manage',
  WORKERS_LEAVES_MANAGE: 'workers.leaves-manage',
  INVENTORY_VIEW: 'inventory.view',
  INVENTORY_EDIT: 'inventory.edit',
  INVENTORY_STOCK_MOVE: 'inventory.stock-move',
  INVOICES_VIEW: 'invoices.view',
  INVOICES_CREATE: 'invoices.create',
  INVOICES_FINALIZE: 'invoices.finalize',
  PAYMENTS_RECORD: 'payments.record',
  EXPENSES_VIEW: 'expenses.view',
  EXPENSES_MANAGE: 'expenses.manage',
  NOTIFICATIONS_VIEW: 'notifications.view',
  NOTIFICATIONS_TEMPLATES_MANAGE: 'notifications.templates-manage',
  REPORTS_VIEW: 'reports.view',
  LOGS_VIEW: 'logs.view',
  SETTINGS_MANAGE: 'settings.manage',
  SETTINGS_VIEW: 'settings.view',
  AMC_PLANS_MANAGE: 'amc.plans-manage',
  AMC_CONTRACTS_VIEW: 'amc.contracts-view',
  AMC_CONTRACTS_MANAGE: 'amc.contracts-manage',
  DATA_EXPORT: 'data.export',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

// Role → Permission mapping (matches GearUp Role Access Matrix)
// Permissions reserved for SUPER_ADMIN only (destructive / irreversible).
const SUPER_ADMIN_ONLY_PERMISSIONS: PermissionKey[] = [
  PERMISSIONS.JOB_CARDS_DELETE,
  PERMISSIONS.DATA_EXPORT,
];

export const ROLE_PERMISSIONS: Record<RoleKey, PermissionKey[]> = {
  SUPER_ADMIN: Object.values(PERMISSIONS),
  ADMIN: Object.values(PERMISSIONS).filter(
    (p) => !SUPER_ADMIN_ONLY_PERMISSIONS.includes(p),
  ),
  RECEPTIONIST: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.CUSTOMERS_VIEW,
    PERMISSIONS.CUSTOMERS_EDIT,
    PERMISSIONS.VEHICLES_VIEW,
    PERMISSIONS.VEHICLES_EDIT,
    PERMISSIONS.SERVICE_REQUESTS_VIEW,
    PERMISSIONS.SERVICE_REQUESTS_EDIT,
    PERMISSIONS.APPOINTMENTS_VIEW,
    PERMISSIONS.APPOINTMENTS_CONFIRM,
    PERMISSIONS.APPOINTMENTS_CHECKIN,
    PERMISSIONS.APPOINTMENTS_NOSHOW,
    PERMISSIONS.JOB_CARDS_CREATE,
    PERMISSIONS.JOB_CARDS_VIEW_OWN,
    PERMISSIONS.JOB_CARDS_UPDATE_STATUS,
    PERMISSIONS.JOB_CARDS_ASSIGN_WORKERS,
    PERMISSIONS.INVENTORY_VIEW,
    PERMISSIONS.INVENTORY_EDIT,
    PERMISSIONS.INVOICES_VIEW,
    PERMISSIONS.INVOICES_CREATE,
    PERMISSIONS.INVOICES_FINALIZE,
    PERMISSIONS.PAYMENTS_RECORD,
    PERMISSIONS.NOTIFICATIONS_VIEW,
    PERMISSIONS.AMC_CONTRACTS_VIEW,
    PERMISSIONS.AMC_CONTRACTS_MANAGE,
  ],
  MECHANIC: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.VEHICLES_VIEW,
    PERMISSIONS.APPOINTMENTS_VIEW,
    PERMISSIONS.JOB_CARDS_VIEW_OWN,
    PERMISSIONS.JOB_CARDS_UPDATE_STATUS,
    PERMISSIONS.INVENTORY_VIEW,
  ],
  INVENTORY_MANAGER: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.INVENTORY_VIEW,
    PERMISSIONS.INVENTORY_EDIT,
    PERMISSIONS.INVENTORY_STOCK_MOVE,
  ],
};
