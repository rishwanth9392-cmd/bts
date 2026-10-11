# BTS Realtime Notification Delivery & HTTP Recovery Architecture

---

## 1. Overview & Resilience Model

The BTS College Bus Tracking System employs a hybrid communication model:
1. **Low-Latency Push Layer (WebSockets / Socket.IO)**: Delivers instant transit updates, geofence arrival alerts, and boarding confirmations.
2. **Authoritative HTTP Snapshot Layer (REST)**: Enables reconnecting mobile clients to rehydrate state seamlessly after network dropouts, tunnel traversal, or device sleep.

---

## 2. WebSocket Handshake & Authentication

Realtime connections undergo mandatory authentication during socket handshake:

```
[Client Socket Handshake]
          │
          ├─► auth: { token: "<JWT>" }
          ▼
[JwtService.verifyAsync]
          ├─► Valid Token   ──► Attach user.id & user.role to socket.data
          │                     Auto-join user:${userId}
          │                     If ADMIN: auto-join 'admin' room
          │
          └─► Missing/Invalid ──► Immediate socket.disconnect(true)
```

- **Credential Ingestion**: The JWT access token is extracted from `socket.handshake.auth.token`.
- **Validation**: Signature, expiration, and issuer are validated before accepting the connection.
- **Immediate Disconnect**: Unauthenticated sockets or sockets with invalid/expired tokens are disconnected immediately with zero room memberships granted.

---

## 3. Room Isolation & Anti-Spoofing Architecture

### Private User Rooms
- Every authenticated client automatically joins an isolated personal room: `user:${userId}`.
- Private personal alerts (such as arrival warnings, boarding confirmations, and system notifications) are routed exclusively to `user:${userId}`.

### Channel Subscription Authorization Matrix

| Channel Pattern | Allowed Roles | Authorization Verification Guard |
| :--- | :--- | :--- |
| `admin` | `ADMIN` only | Verified automatically upon connection. Students/drivers are strictly denied. |
| `user:${userId}` | Own `userId` only | Sockets are barred from joining another user's personal channel. |
| `trip:${tripId}` | Assigned Students / Assigned Drivers / Admins | Students must be assigned to the route; Drivers must be assigned to the trip. |

### Anti-Spoofing Enforcement
Clients attempting to send unauthorized `user:subscribe` or `trip:subscribe` messages targeting other users or unauthorized routes receive an error event and are blocked from room membership.

---

## 4. Private Event Routing & Broadcast Sanitization

### Private Direct Events
The following events are targeted strictly to individual `user:${studentId}` rooms:
- **`pickup:arrived`**: Triggered when the assigned vehicle enters the 50-meter pickup geofence for the student's assigned stop.
- **`notification:new`**: Emitted when an in-app operational notification is written to the database.
- **`boarding:confirmed`**: Emitted upon self-service check-in to confirm seat status and stop details.
- **`dropoff:confirmed`**: Emitted upon self-service check-out to confirm departure.

### Sanitized Trip Broadcasts (`trip:${tripId}`)
To protect student privacy and minimize bandwidth, public channel broadcasts exclude student PII:
- **`trip:location`**: Contains vehicle coordinate fixes (`latitude`, `longitude`, `speed`, `heading`) with zero passenger information.
- **`trip:progress`**: Contains stop sequencing, progress percentage, route deviation, and delay status with zero student identifiers.
- **`trip:occupancy`**: Contains aggregated passenger occupancy percentage (`occupancyPercent: 45`) and status (`occupancyStatus: 'SEATS_AVAILABLE'`), with raw student rosters completely stripped.

---

## 5. HTTP Snapshot Recovery Endpoints

When mobile devices experience intermittent network connectivity or app restarts, they reconstruct state via authoritative REST endpoints:

### 1. `GET /notifications`
- **Scope**: Returns the authenticated user's authoritative notification history.
- **Privacy**: Projections filter strictly by `userId === req.user.id`.

### 2. `GET /trips/:id`
- **Scope**: Rehydrates the active trip's full operational state (route, stops, vehicle, ETA, and progress).
- **Sanitization**: Strips raw `boardings` records and passenger rosters. For student and driver roles, raw headcount numbers are suppressed in favor of clamped occupancy percentages.

### 3. `GET /trips/active`
- **Scope**: Returns the active trip catalog relevant to the student's assigned route or driver's assignment.
- **PII Guard**: Excludes individual passenger manifests.
