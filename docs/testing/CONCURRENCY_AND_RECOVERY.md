# BTS College Bus Tracking System — Concurrency Control & Client Recovery Architecture

This document outlines the architectural patterns, database lock semantics, concurrency controls, and client state recovery protocols implemented across the BTS platform.

---

## 1. Concurrency Challenges in College Transit Dispatch

Transit tracking systems operating under PostgreSQL's default `READ COMMITTED` transaction isolation encounter three major concurrency hazards:

1. **Simultaneous Vehicle / Driver Dispatch**:
   Two dispatchers simultaneously assigning the same bus or driver to different trips at the exact same millisecond. Under `READ COMMITTED`, both concurrent transactions can read the vehicle as available before either transaction commits an active trip, causing a double-booking race condition.

2. **Burst Student Boarding Check-Ins**:
   When a bus arrives at a crowded stop, dozens of students simultaneously tap "Board Bus". Rapid-fire duplicate requests or network retries from the same mobile client can insert multiple `BOARD` events, falsely inflating vehicle passenger headcounts.

3. **Client Connection Drops & Real-Time Resynchronization**:
   Mobile clients operating on intermittent cellular data lose WebSocket connectivity in transit dead zones. Reconnecting clients require immediate state re-synchronization without relying solely on missed transient events.

---

## 2. PostgreSQL Transactional Advisory Locking (`pg_advisory_xact_lock`)

### Lock Architecture & Implementation
To eliminate dispatch race conditions without degrading global table throughput with heavy table locks (`LOCK TABLE`), the system implements **transaction-scoped PostgreSQL advisory locks**:

```typescript
// apps/api/src/admin/assignment-integrity.service.ts
const lockKey = (type: string, id: string): bigint => {
  const hash = crypto.createHash('sha256').update(`${type}:${id}`).digest();
  return hash.readBigInt64BE(0);
};

await prisma.$transaction(async (tx) => {
  // Acquire transactional advisory locks for both bus and driver
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey('bus', busId)});`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey('driver', driverId)});`;

  // Execute mutual-exclusion availability assertions
  await this.assertBusAvailable(busId, tx);
  await this.assertDriverAvailable(driverId, tx);

  // Atomically create and dispatch trip
  return tx.trip.create({ ... });
});
```

### Key Semantics:
* **Mutual Exclusion**: Any competing transaction attempting to dispatch the same bus or driver is queued behind the advisory lock until the first transaction commits or rolls back.
* **Automatic Release (`_xact_lock`)**: Locks are automatically released by the PostgreSQL engine upon transaction commit or rollback, guaranteeing **zero orphaned locks** even if application processes crash mid-operation.
* **Deterministic Conflict Rejection (409)**: Once the first transaction commits the active trip, the queued second transaction proceeds, immediately detects that the bus/driver is no longer available, and cleanly throws `409 ConflictException`.

---

## 3. Duplicate Boarding & Drop-Off Concurrency Protection

### The Boarding Race Hazard
Multiple concurrent HTTP `POST /trips/:id/board` requests from the same student could create multiple `BOARD` events.

### The Remediation Protocol
* **Atomic Pre-Check & Insertion**:
  `TripsService.boardTrip` executes inside a Prisma transaction:
  ```typescript
  const existingBoarding = await tx.boardingEvent.findFirst({
    where: {
      tripId,
      studentId: student.id,
      type: BoardingEventType.BOARD,
    },
  });

  if (existingBoarding) {
    // Idempotent success response
    return { success: true, message: 'Student is already boarded on this trip', idempotent: true };
  }
  ```
* **Event-Sourced Net Count Integrity**:
  Because occupancy is calculated strictly via distinct event totals ($\sum\text{BOARD} - \sum\text{DROP}$), duplicate idempotency guarantees that passenger headcounts never experience artificial inflation.
* **Verified Parallel Concurrency**:
  Burst testing with 5 simultaneous parallel requests per student verified that exactly 1 database event is written, while 4 requests resolve cleanly with idempotent success flags (`src/trips/boarding-concurrency.test.ts`).

---

## 4. Client Disconnect & Snapshot Recovery Protocol

### The Problem of Lost Events
When a mobile student or driver application disconnects from the WebSocket gateway (e.g. cellular handoff or tunnel dead zone), real-time events (`trip:location`, `trip:progress`, `trip:occupancy`) are missed.

### Dual-Channel Synchronization Architecture

```
 Mobile Client                   REST API                      WebSocket Gateway
      │                             │                                 │
      ├─── Lost Socket Connection ──┼─────────────────────────────────X
      │                             │                                 │
      ├─── Socket Reconnected ──────┼─────────────────────────────────▶ Handshake / Join Room
      │                             │                                 │
      ├─── GET /trips/:id ─────────▶│                                 │
      │    (Fetch Current Snapshot) │                                 │
      │◀── Returns State Snapshot ──┤                                 │
      │    { status, occupancy,     │                                 │
      │      latestLocation, ETA }  │                                 │
      │                             │                                 │
      ├─── Real-Time Stream Resumes ┼─────────────────────────────────▶ Receive Next Broadcast
```

1. **Gateway Handshake & Auto-Rejoin**:
   Upon socket reconnection, the client automatically re-authenticates via JWT and re-joins its assigned rooms (`trip:${tripId}` and `user:${userId}`). Sockets already in the room are handled idempotently.

2. **HTTP State Snapshot Recovery**:
   Immediately following socket reconnection, the client issues a lightweight REST request:
   * **Students**: `GET /trips/:id` fetches the definitive trip state, sanitized occupancy percentage, categorical status band, and latest route progress.
   * **Drivers**: `GET /driver/trips/current` fetches the definitive active trip state and route stop sequences.
   * **Dispatchers**: `GET /admin/fleet/status` fetches current fleet-wide telemetry aggregates and emergency SOS queues.

3. **Idempotent State Merging**:
   Client-side state stores merge the fresh HTTP snapshot with incoming WebSocket broadcasts, preventing duplicate render flashes or outdated positions.
