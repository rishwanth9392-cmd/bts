# BTS College Bus Tracking System — Phase Regression Verification Matrix

This matrix documents the verification status for core architectural invariants across Phases 1 through 12 of the BTS College Bus Tracking System. All statuses reflect automated test execution, database constraints, and static code verification.

**Status Legend:**
- **PASS**: Formally verified via automated test suites and runtime execution.
- **FAIL**: Automated test failure or specification violation.
- **BLOCKED**: Verification blocked by external dependencies.
- **NOT RUN**: Test skipped or not scheduled in this cycle.
- **ACCEPTED LIMITATION**: Known edge condition documented and accepted by architecture.

---

## 1. Phases 1–4: Foundation, Identity & RBAC Enforcement

| Phase / Feature | Invariant / Specification | Verification Mechanism | Status | Notes |
| :--- | :--- | :--- | :---: | :--- |
| **Phase 1: Foundation** | Relational data schema, UUID/CUID PKs, cascade deletes | Prisma migrations & schema validation | **PASS** | Verified via `packages/database/prisma/schema.prisma`. |
| **Phase 2: Authentication** | Server-side JWT generation with 24h expiration | `AuthService.login`, `JwtService` | **PASS** | Tokens verified via `JwtAuthGuard`. |
| **Phase 3: Role-Based Access** | Strict RBAC: `ADMIN`, `DRIVER`, `STUDENT` | `RolesGuard`, `Reflector` metadata | **PASS** | Non-admin/driver access to unauthorized routes yields 403 Forbidden. |
| **Phase 4: Identity Token Binding** | Controllers resolve caller identity strictly via verified claims (`req.user.sub`) | `CurrentUser` decorator, auth guards | **PASS** | Client-supplied spoofed IDs in payloads are discarded. |

---

## 2. Phase 5: Geofencing & Proximity Detection

| Feature | Invariant / Specification | Verification Mechanism | Status | Notes |
| :--- | :--- | :--- | :---: | :--- |
| **Arrival Geofence** | Bus within $\le 50\text{ m}$ of stop coordinates triggers `PICKUP_ARRIVED` | Haversine formula calculation (`dist <= 50`) | **PASS** | Verified in `phase11-full-verification.test.ts` (17.8m detected). |
| **Departure Geofence** | Bus beyond $> 200\text{ m}$ clears active arrival state | Hysteresis boundary (`dist > 200`) | **PASS** | Verified in `phase11-full-verification.test.ts` (306.9m detected). |
| **Hysteresis Anti-Flapping**| State transitions require crossing hysteresis thresholds to prevent flutter | `GeofenceService` in-memory state tracking | **PASS** | Verified in `telemetry-freshness.test.ts`. |

---

## 3. Phases 6–7: Self-Service Mobile Boarding & Zero-QR Protocol

| Feature | Invariant / Specification | Verification Mechanism | Status | Notes |
| :--- | :--- | :--- | :---: | :--- |
| **Self-Service Boarding** | Students trigger self-service check-in directly from client application | `POST /trips/:id/board` | **PASS** | QR hardware scanners and static printouts eliminated. |
| **Route Pickup Authorization** | Student can only board a trip whose route matches active `PickupAssignment` | `TripsService.boardTrip` validation | **PASS** | Cross-route boarding rejected with 400 BadRequestException. |
| **Boarding Idempotency** | Duplicate concurrent check-in calls record exactly 1 database event | Transactional upsert / idempotency guard | **PASS** | 5 concurrent requests yield 1 insert; 4 idempotent successes. |
| **Valid Drop-Off Guard** | Drop-off rejected if student has no active boarding on trip | `TripsService.dropTrip` check | **PASS** | Unboarded drop-off rejected with 400 BadRequestException. |

---

## 4. Phase 8: Event-Sourced Net Occupancy & Data Minimization

| Feature | Invariant / Specification | Verification Mechanism | Status | Notes |
| :--- | :--- | :--- | :---: | :--- |
| **Event-Sourced Headcount**| Net occupancy computed as $\sum\text{BOARD} - \sum\text{DROP}$ | `calculateTripOccupancy` utility | **PASS** | Verified in `boarding-concurrency.test.ts`. |
| **Mathematical Clamping** | Occupancy clamped strictly to $[0, \text{capacity}]$ | Math clamping utility | **PASS** | Prevents negative headcounts and capacity overflows. |
| **Categorical Occupancy Bands** | Occupancy reported strictly as percentage and categorical status | `SEATS_AVAILABLE`, `STANDING_ROOM_ONLY`, `FULL` | **PASS** | Raw numerical headcounts suppressed in student/driver payloads. |
| **Passenger Roster Privacy**| Driver & student APIs strip individual boarding records and USNs | Query projection exclusion | **PASS** | `boardings` relation excluded from driver views. |

---

## 5. Phase 9: Speed Smoothing & Deterministic ETA Calculation

| Feature | Invariant / Specification | Verification Mechanism | Status | Notes |
| :--- | :--- | :--- | :---: | :--- |
| **GPS Jitter & Zero Speed** | Speeds $< 3\text{ km/h}$ clamped to urban baseline ($25\text{ km/h}$) | `calculateSmoothedEtaMinutes` | **PASS** | Verified in `phase11-full-verification.test.ts`. |
| **High-Speed Glitch Filter** | Speeds $> 120\text{ km/h}$ clamped to urban baseline ($25\text{ km/h}$) | Outlier rejection filter | **PASS** | Verified in `phase11-full-verification.test.ts`. |
| **Valid Speed Retention** | Speeds between $3\text{ km/h}$ and $120\text{ km/h}$ preserved as recorded | Speed range filter | **PASS** | 35 km/h test input preserved as 35 km/h. |
| **Integer Minutes ETA** | Arrival estimates returned strictly as integer minutes | `Math.round(dist / speed)` | **PASS** | Fractional minutes eliminated. |

---

## 6. Phase 10: Driver Trip Lifecycle & Emergency SOS Protocol

| Feature | Invariant / Specification | Verification Mechanism | Status | Notes |
| :--- | :--- | :--- | :---: | :--- |
| **Trip Start State Machine** | Only assigned driver can transition trip from `READY`/`SCHEDULED` to `ACTIVE` | `TripsService.startTrip` transaction | **PASS** | Atomic write + `TripAudit` (`TRIP_STARTED`). |
| **Trip End State Machine** | Only assigned driver can transition active trip to `COMPLETED` | `TripsService.endTrip` transaction | **PASS** | Atomic write + `TripAudit` (`TRIP_COMPLETED`). |
| **Emergency SOS Beacon** | Driver trigger creates `TripAudit` SOS event and broadcasts to dispatch | `POST /trips/:id/sos`, `admin:sos` WS event | **PASS** | Verified in `sos-hardening.test.ts`. |
| **SOS Acknowledgment & Resolution**| Dispatcher must acknowledge and resolve SOS with $\ge 5$ character notes | `AdminService.resolveSos` | **PASS** | Empty notes rejected with 400 BadRequestException. |

---

## 7. Phase 11: Assignment Integrity, Telemetry Freshness & Maintenance

| Feature | Invariant / Specification | Verification Mechanism | Status | Notes |
| :--- | :--- | :--- | :---: | :--- |
| **Vehicle Conflict Prevention**| Bus assigned to `ACTIVE` trip cannot be dispatched on another trip | `AssignmentIntegrityService.assertBusAvailable` | **PASS** | Rejects double-booking with 409 ConflictException. |
| **Driver Conflict Prevention** | Driver assigned to `ACTIVE` trip cannot be dispatched on another trip | `AssignmentIntegrityService.assertDriverAvailable`| **PASS** | Rejects double-booking with 409 ConflictException. |
| **Telemetry Freshness Tiers** | Age $\le 30\text{s}$ (LIVE), $31\text{--}120\text{s}$ (STALE), $> 120\text{s}$ (OFFLINE) | `evaluateTelemetryFreshness` utility | **PASS** | Verified across 112 assertions in `telemetry-freshness.test.ts`. |
| **Maintenance Work Orders** | Tickets enforce linear state flow (`REPORTED` $\to$ `IN_PROGRESS` $\to$ `RESOLVED`)| `AdminService.updateMaintenanceStatus` | **PASS** | Backwards transitions rejected with 400 BadRequest. |
| **Dispatch Block on Open Tickets**| Bus with open maintenance work order blocked from trip dispatch | `assertBusAvailable` query | **PASS** | Rejects dispatch with 400 BadRequestException. |

---

## 8. Phase 12 & 13: Hardening Invariants & Operational Security

| Feature | Invariant / Specification | Verification Mechanism | Status | Notes |
| :--- | :--- | :--- | :---: | :--- |
| **Admin WebSocket Isolation** | Only `Role.ADMIN` sockets can join or receive `admin` room events | `TripsGateway` connection & message guards | **PASS** | Non-admin joins rejected with 403 / error event. |
| **Dispatch Advisory Locking** | Transactional PostgreSQL advisory locks (`pg_advisory_xact_lock`) on bus and driver | `AssignmentIntegrityService.assertAndAssignTrip`| **PASS** | Serializes concurrent dispatch races cleanly. |
| **Production JWT Fail-Fast** | Unset `JWT_SECRET` in `NODE_ENV=production` triggers fatal startup error | `getJwtSecret` helper | **PASS** | Fallback key prohibited in production. |
| **Mock Driver OTP Guard** | Mock OTP `123456` rejected when `NODE_ENV=production` | `AuthService.loginDriver` | **PASS** | Rejects mock OTP with 401 UnauthorizedException in prod. |
| **Pagination Clamping** | Administrative list queries clamped to $[1, 100]$ (default 50) | `clampPaginationParams` utility | **PASS** | Unbounded list queries capped across 6 endpoints. |
| **Zero Global WS Leaks** | Zero global `this.server.emit` calls exist for trip/admin events | `TripsGateway` audit | **PASS** | Cancellations isolated to `trip:${tripId}` and `admin`. |
| **Atomic Lifecycle Transitions**| Trip start, completion, and cancellation wrapped in `$transaction` | `TripsService` & `AdminService` | **PASS** | Rollback protection guarantees zero partial writes. |
