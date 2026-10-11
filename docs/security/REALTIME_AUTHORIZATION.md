# BTS Realtime Authorization, Concurrency & Security Governance

---

## 1. Scope & Security Architecture

The BTS College Bus Tracking System handles high-concurrency peak transit periods where students, drivers, and dispatchers interact simultaneously across WebSockets and REST APIs. This document details the authorization models, channel segregation, concurrency protection, and governance policies governing realtime operations.

---

## 2. WebSocket Handshake & Authentication

Realtime gateway connections require cryptographically verified identity tokens:

```
[WebSocket Handshake]
  │
  ├─► Handshake Auth Token: socket.handshake.auth.token
  │
  ▼
[JWT Verification]
  ├─► Signature / Expiry / Issuer Validated
  ├─► User Claims Decoded: { id, sub, role }
  │
  ├─► Successful Auth:
  │     - User mapped to socket session
  │     - Automatically joined to user:${userId}
  │     - If role === 'ADMIN': automatically joined to 'admin'
  │
  └─► Failure:
        - Handshake rejected
        - Socket forcefully disconnected: socket.disconnect(true)
```

Unauthenticated connections are terminated immediately, guaranteeing that unverified sockets consume zero gateway resources and have zero channel visibility.

---

## 3. Channel Subscription Authorization Matrix

Clients may subscribe only to channels matching their authenticated role and operational assignments:

| Channel Pattern | ADMIN | DRIVER | STUDENT | Authorization Check |
| :--- | :---: | :---: | :---: | :--- |
| `admin` | **ALLOW** | **DENY** | **DENY** | Handshake role verification. Sockets without `Role.ADMIN` are excluded. |
| `user:${userId}` | **ALLOW (Own)** | **ALLOW (Own)** | **ALLOW (Own)** | Strict equality: `targetUserId === socket.user.id`. Spoofing attempts rejected. |
| `trip:${tripId}` | **ALLOW** | **ASSIGNED** | **ASSIGNED** | Drivers must be assigned to the trip. Students must be assigned to the trip route. |

### Room Anti-Spoofing & Eavesdropping Prevention
When a client emits a channel subscription request:
1. `user:subscribe`: The gateway verifies that `targetUserId === socket.user.id`. Any attempt to listen to another user's room returns an error event and drops the subscription.
2. `trip:subscribe`: Students attempting to listen to unauthorized route channels are verified against their active `PickupAssignment`. Unassigned routes are rejected with an authorization failure.

---

## 4. Advisory Locking Concurrency Protection

During morning check-in and afternoon departure rush hours, multiple devices or burst network calls can submit concurrent check-in or drop requests.

To eliminate race conditions, the system uses **PostgreSQL Transactional Advisory Locks**:

```typescript
const lockKey = `boarding:${student.id}:${tripId}`;
await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
```

### Protection Characteristics
1. **Per-Student Serialized Execution**: Requests for the same student on the same trip are serialized at the database engine level across all API workers.
2. **Duplicate BOARD Idempotency**:
   - The first transaction reads $\text{boardCount} = 0$, inserts the `BOARD` record, and commits.
   - Subsequent racing transactions acquire the lock, observe $\text{boardCount} > \text{dropCount}$, and return the existing boarding confirmation idempotently with `idempotent: true`.
   - Zero duplicate rows are written and passenger occupancy is not artificially inflated.
3. **Duplicate DROP Idempotency**:
   - The first drop transaction writes the `DROP` event.
   - Subsequent racing requests observe $\text{dropCount} \ge \text{boardCount}$ and return cleanly without decrementing counts below zero.
4. **Automatic Lock Release**: `pg_advisory_xact_lock` locks are automatically released by PostgreSQL upon transaction commit or rollback, preventing deadlocks.

---

## 5. Credential Masking in API Projections

To protect sensitive authentication data:
- **Prisma Projections**: Database queries for drivers, students, and users explicitly omit `passwordHash`, `refreshToken`, and private keys from return objects.
- **Audit Sanitization (`sanitizeMetadata`)**: All parameters logged to `AdminAudit` and `TripAudit` are recursively inspected against sensitive key patterns (`/pass(word)?/i`, `/secret/i`, `/token/i`, `/auth/i`, `/credential/i`, `/key$/i`, `/hash/i`, `/cookie/i`). Any matching values are replaced with `"[REDACTED]"`.

---

## 6. Immutable Governance Audit Trail

Accountability and auditability are guaranteed through append-only audit structures:

### Event Tag Classification
- **Fleet Governance**: `BUS_CREATED`, `BUS_UPDATED`, `BUS_DEACTIVATED`, `BUS_RELEASED_TO_SERVICE`
- **Personnel Governance**: `DRIVER_CREATED`, `DRIVER_UPDATED`, `DRIVER_DEACTIVATED`
- **Dispatch Operations**: `TRIP_SCHEDULED`, `TRIP_CANCELLED`
- **Life Safety**: `SOS_ACKNOWLEDGED`, `SOS_RESOLVED`
- **Maintenance Operations**: `MAINTENANCE_CREATED`, `MAINTENANCE_UPDATED`, `MAINTENANCE_RESOLVED`

### Audit Preservation Guarantees
- Audit logs contain non-nullable administrative foreign keys (`adminId`), action tags, target entity types, and timestamps.
- Audit tables (`AdminAudit`, `TripAudit`) expose no mutation (`PUT`, `PATCH`, `DELETE`) APIs.
- All actions are permanently retained for regulatory compliance and operational forensics.
