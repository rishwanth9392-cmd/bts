# BTS Security Architecture & Admin Authorization Specification

---

## 1. Role-Based Access Control (Admin RBAC)

Administrative operations within the BTS College Bus Tracking System are guarded by strict authentication and role verification layers.

### Guard Architecture

- **`JwtAuthGuard`**: Validates the JWT Bearer token in the `Authorization` header, checking digital signature, expiration, and issuer.
- **`RolesGuard`**: Evaluates the authenticated user's role against required endpoint permissions defined by the `@Roles(...)` metadata decorator.
- **Admin Endpoints**: Decorated with `@Roles(Role.ADMIN)`:
  - If a user with `Role.STUDENT` attempts access $\to$ HTTP `403 Forbidden`.
  - If a user with `Role.DRIVER` attempts access $\to$ HTTP `403 Forbidden`.
  - If no token or invalid token is supplied $\to$ HTTP `401 Unauthorized`.
  - Only authenticated accounts with `Role.ADMIN` are permitted.

---

## 2. Session Protections & Credential Hygiene

### Credential Redaction in API Projections

To prevent credential leakage across networks and browser inspection tools:
1. **Database Projections**: All Prisma queries for drivers, students, and user rosters explicitly exclude `passwordHash`, `refreshToken`, and raw authentication secrets.
2. **Driver Creation Responses**: When provisioning a driver account via `POST /admin/drivers`, the response returns driver metadata and user email without the password hash.
3. **Audit Ingestion Sanitization**: Any payload passed to `AdminService.logAction` undergoes recursive key inspection (`sanitizeMetadata`). Keys matching sensitive patterns (`password`, `hash`, `token`, `secret`, `credential`, `authorization`) are replaced with `"[REDACTED]"` prior to database insertion.

---

## 3. Immutable Append-Only Audit Trail Governance

The BTS platform enforces regulatory accountability and operational transparency through an immutable administrative audit log.

### Schema: `AdminAudit`

- `id`: Unique identifier (`cuid` / `uuid`).
- `adminId`: Foreign key to `User` referencing the administrator who initiated the action.
- `action`: Standardized administrative event tag:
  - `BUS_CREATED`, `BUS_UPDATED`, `BUS_DEACTIVATED`
  - `DRIVER_CREATED`, `DRIVER_UPDATED`, `DRIVER_DEACTIVATED`
  - `TRIP_SCHEDULED`, `TRIP_CANCELLED`
  - `SOS_ACKNOWLEDGED`, `SOS_RESOLVED`
  - `MAINTENANCE_CREATED`, `MAINTENANCE_UPDATED`
- `targetType`: Target domain entity (`BUS`, `DRIVER`, `TRIP`, `SOS`, `MAINTENANCE`).
- `targetId`: Unique ID of the affected entity.
- `timestamp`: UTC timestamp automatically stamped at creation (`@default(now())`).
- `metadata`: Sanitized JSON payload documenting parameter state before and after mutation.

### Immutability Guarantees

1. **No Mutation Endpoints**: The REST API exposes `GET /admin/audit-logs` and `POST /admin/audit-logs`. No `PUT`, `PATCH`, or `DELETE` endpoints exist for audit logs.
2. **Read-Only Interface**: The administrative UI (`/admin/audit-logs`) provides search, entity filtering, and a JSON inspector without edit or delete controls.
3. **Forensic Integrity**: Every dispatch, emergency resolution, and fleet configuration change is permanently logged for administrative oversight.
