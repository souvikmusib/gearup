# GearUp Servicing — RBAC

## Roles

| Role | Description |
|------|-------------|
| SUPER_ADMIN | Full system access including admin user management and settings |
| ADMIN | Full operational access except admin user management |
| SERVICE_MANAGER | Service workflow management (requests, appointments, jobs, inventory) |
| WORKER | View own assignments, update job card status on assigned cards |
| BILLING | Invoice, payment, and expense management |

## Permission Matrix

| Permission | SUPER_ADMIN | ADMIN | SERVICE_MANAGER | WORKER | BILLING |
|-----------|:-----------:|:-----:|:---------------:|:------:|:-------:|
| dashboard.view | ✓ | ✓ | ✓ | ✓ | ✓ |
| admin-users.manage | ✓ | | | | |
| customers.view | ✓ | ✓ | ✓ | ✓ | ✓ |
| customers.edit | ✓ | ✓ | ✓ | | ✓ |
| vehicles.view | ✓ | ✓ | ✓ | ✓ | ✓ |
| vehicles.edit | ✓ | ✓ | ✓ | | |
| service-requests.view | ✓ | ✓ | ✓ | ✓ | |
| service-requests.edit | ✓ | ✓ | ✓ | | |
| appointments.view | ✓ | ✓ | ✓ | ✓ | |
| appointments.confirm | ✓ | ✓ | ✓ | | |
| appointments.checkin | ✓ | ✓ | ✓ | | |
| appointments.noshow | ✓ | ✓ | ✓ | | |
| job-cards.create | ✓ | ✓ | ✓ | | |
| job-cards.update-status | ✓ | ✓ | ✓ | ✓* | |
| job-cards.assign-workers | ✓ | ✓ | ✓ | | |
| job-cards.view-own | ✓ | ✓ | ✓ | ✓ | |
| workers.manage | ✓ | ✓ | | | |
| workers.leaves-manage | ✓ | ✓ | | | |
| inventory.view | ✓ | ✓ | ✓ | ✓ | ✓ |
| inventory.edit | ✓ | ✓ | ✓ | | |
| inventory.stock-move | ✓ | ✓ | ✓ | | |
| invoices.view | ✓ | ✓ | ✓ | | ✓ |
| invoices.create | ✓ | ✓ | ✓ | | ✓ |
| invoices.finalize | ✓ | ✓ | | | ✓ |
| payments.record | ✓ | ✓ | | | ✓ |
| expenses.view | ✓ | ✓ | | | ✓ |
| expenses.manage | ✓ | ✓ | | | ✓ |
| notifications.view | ✓ | ✓ | ✓ | | ✓ |
| notifications.templates-manage | ✓ | ✓ | | | |
| reports.view | ✓ | ✓ | ✓ | ✓ | ✓ |
| logs.view | ✓ | ✓ | | | |
| settings.manage | ✓ | | | | |
| settings.view | ✓ | ✓ | | | |

*WORKER can only update status on job cards they are assigned to.

## Implementation

- **Backend:** `requirePermission()` middleware on every admin route
- **Frontend:** `useAuth().hasPermission()` for UI gating
- **Database:** Roles and permissions stored in `Role`, `Permission`, `AdminUserRole`, `RolePermission` tables
- **Token:** JWT payload includes `roles[]` and `permissions[]`
