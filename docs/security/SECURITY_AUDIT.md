# BTS College Bus Tracking System — Comprehensive Security Audit Report

This document details the security posture, vulnerability findings, threat models, and remediation controls implemented across the BTS College Bus Tracking System during Phase 13 Hardening.

---

## 1. Executive Summary

A comprehensive architectural and penetration-oriented security audit was performed covering identity, authorization, data minimization, query boundaries, real-time communications, and database concurrency. All identified high and critical risks have been remediated and verified via automated regression suites.

---

## 2. Threat Modeling & Vulnerability Findings

### Finding 1: Insecure JWT Secret Sourcing & Fallback Key Risk
* **Severity**: **CRITICAL**
* **CWE**: CWE-798 (Use of Hard-coded Credentials), CWE-1188 (Insecure Default Initialization)
* **Description**:
  The system previously fell back to a default hardcoded development secret string (`dev-secret-change-me`) if the `JWT_SECRET` environment variable was omitted, potentially allowing token forgery if deployed to production without configuration.
* **Remediation**:
  Hardened `getJwtSecret()` in `apps/api/src/auth/jwt-secret.helper.ts`. When `NODE_ENV === 'production'`, any missing, empty, or whitespace-only `JWT_SECRET` triggers an immediate fatal startup exception (`FATAL SECURITY CONFIGURATION ERROR`), halting application launch. Insecure fallbacks are restricted strictly to non-production environments with high-visibility warning logs.
* **Status**: **RESOLVED & VERIFIED** (`src/auth/security-minimization.test.ts`)

---

### Finding 2: Unrestricted Mock Driver OTP in Production Environments
* **Severity**: **CRITICAL**
* **CWE**: CWE-287 (Improper Authentication), CWE-522 (Insufficiently Protected Credentials)
* **Description**:
  The driver login endpoint allowed a static mock OTP (`123456`) to authenticate any registered driver. If permitted in production, an adversary possessing a driver's mobile number could bypass SMS OTP verification and commandeer trip telemetry.
* **Remediation**:
  `AuthService.loginDriver()` now evaluates `NODE_ENV`. If running in production mode, mock OTP authentication is rejected with `401 UnauthorizedException` (`"Mock OTP credentials are strictly prohibited in production mode"`). Mock OTPs are permitted only in local and development testing environments.
* **Status**: **RESOLVED & VERIFIED** (`src/auth/security-minimization.test.ts`)

---

### Finding 3: Student PII Leakage in Driver and Public Interfaces
* **Severity**: **HIGH**
* **CWE**: CWE-200 (Exposure of Sensitive Information to an Unauthorized Actor), CWE-359 (Privacy Violation)
* **Description**:
  The `getCurrentTrip` query previously included relational `boardings` records, exposing student USNs, database IDs, and boarding timestamps to driver consoles. Additionally, WebSocket occupancy broadcasts emitted raw headcounts and student boarding events.
* **Remediation**:
  * Stripped `boardings: true` from driver trip queries in `DriverService.getCurrentTrip`.
  * Suppressed raw numerical headcounts in student and driver views.
  * Mapped occupancy exclusively to percentage (`occupancyPercent` clamped to $[0, 100]$) and categorical status bands (`SEATS_AVAILABLE`, `STANDING_ROOM_ONLY`, `FULL`).
  * Sanitized `trip:occupancy` WebSocket payloads to emit strictly `{ tripId, occupancyPercent, occupancyStatus, timestamp }`.
* **Status**: **RESOLVED & VERIFIED** (`src/auth/security-minimization.test.ts`, `src/trips/boarding-concurrency.test.ts`)

---

### Finding 4: Global WebSocket Broadcast Leakage on Trip Cancellation
* **Severity**: **HIGH**
* **CWE**: CWE-668 (Exposure of Resource Through Unintended Control Sphere)
* **Description**:
  `TripsGateway.broadcastTripCancelled` previously invoked `this.server.emit('trip:cancelled', payload)` alongside room emission, broadcasting trip cancellations globally across all connected sockets, including students and drivers on unrelated routes.
* **Remediation**:
  * Removed un-isolated `this.server.emit` call from `broadcastTripCancelled`.
  * Routed cancellation notifications strictly to `trip:${tripId}` (affected students and driver) and the administrative channel (`admin`).
  * Audited the gateway to ensure zero global emissions exist for any trip-scoped or telemetry events.
* **Status**: **RESOLVED & VERIFIED** (`src/trips/websocket-isolation-fanout.test.ts`)

---

### Finding 5: Unauthorized Access & Impersonation in Administrative WebSocket Room
* **Severity**: **HIGH**
* **CWE**: CWE-285 (Improper Authorization)
* **Description**:
  Sockets could join the `admin` room without role validation, allowing non-admin clients to receive sensitive dispatch alerts, emergency SOS beacons, and system-wide telemetry warnings.
* **Remediation**:
  * Enforced token role inspection in `TripsGateway.handleConnection`: sockets auto-join `admin` if and only if `user.role === Role.ADMIN`.
  * Added message handlers `@SubscribeMessage('admin:subscribe')` and `@SubscribeMessage('admin')` rejecting non-admins with `{ event: 'error', message: 'Forbidden: Admin access required' }`.
  * Guarded `handleSubscribe` so that non-admins passing `'admin'` as a trip ID are blocked.
* **Status**: **RESOLVED & VERIFIED** (`src/trips/websocket-isolation-fanout.test.ts`)

---

### Finding 6: Unbounded Administrative List Queries (Denial-of-Service / Memory Exhaustion)
* **Severity**: **MEDIUM**
* **CWE**: CWE-770 (Allocation of Resources Without Limits or Throttling), CWE-400 (Uncontrolled Resource Consumption)
* **Description**:
  Administrative list queries for buses, drivers, trips, maintenance tickets, and audit logs accepted arbitrary `limit` parameters (e.g. `limit=50000`), presenting heap exhaustion and database saturation risks.
* **Remediation**:
  * Implemented `clampPaginationParams` utility clamping `limit` to $[1, 100]$ (safe default: 50).
  * Safely sanitized `skip` and `offset` against `NaN`, negative numbers, and out-of-bounds offsets.
  * Standardized response envelope `{ data: T[], meta: { total, page, limit, totalPages } }`.
  * Applied explicit Prisma `select` projections on fleet and route listings to prune relational trees.
* **Status**: **RESOLVED & VERIFIED** (`src/admin/pagination-guardrails.test.ts`)

---

### Finding 7: Non-Atomic Trip Lifecycle Updates & Race Windows
* **Severity**: **MEDIUM**
* **CWE**: CWE-362 (Concurrent Execution using Shared Resource with Improper Synchronization)
* **Description**:
  Trip state transitions (`startTrip`, `endTrip`, `cancelTrip`) executed trip status mutations and audit log insertions in separate un-transactioned statements, creating potential desynchronization if a server crash or database error occurred mid-operation.
* **Remediation**:
  * Wrapped state mutations and audit insertions within `prisma.$transaction(async (tx) => { ... })`.
  * Enforced state machine invariants and idempotency on duplicate requests.
  * Required non-empty cancellation reasons ($\ge 5$ characters after trimming).
  * Transaction rollback guarantees zero partial status writes upon failure.
* **Status**: **RESOLVED & VERIFIED** (`src/trips/trip-lifecycle-transaction.test.ts`)

---

### Finding 8: Sensitive Credential Redaction in Audit Logs
* **Severity**: **LOW**
* **CWE**: CWE-532 (Insertion of Sensitive Information into Log File)
* **Description**:
  Administrative audit logs (`AdminAudit`) could inadvertently capture plain passwords, password hashes, or authorization headers if raw input DTOs were serialized directly into JSON metadata.
* **Remediation**:
  `AdminService.sanitizeMetadata` recursively traverses and masks keys matching `/password/i`, `/token/i`, `/auth(orization)?/i`, `/secret/i`, and `/credential/i` to `'[REDACTED]'` before persistence.
* **Status**: **RESOLVED & VERIFIED** (`src/admin/phase11-full-verification.test.ts`, `src/admin/assignment-integrity.test.ts`)

---

## 3. Severity Ranking & Remediation Summary

| Severity | Count | Resolved | Pending | Compliance |
| :--- | :---: | :---: | :---: | :---: |
| **Critical** | 2 | 2 | 0 | **100% SECURED** |
| **High** | 3 | 3 | 0 | **100% SECURED** |
| **Medium** | 2 | 2 | 0 | **100% SECURED** |
| **Low** | 1 | 1 | 0 | **100% SECURED** |
| **Total** | **8** | **8** | **0** | **100% SECURED** |
