# BTS College Bus Tracking System — Accepted System Limitations

This document explicitly defines the accepted operational boundaries, architectural trade-offs, and environmental limitations of the BTS College Bus Tracking System as approved by the system architecture team.

---

## 1. GPS Dead Zones & Stale Coordinate Pinning

* **Description**:
  When a bus traverses areas with poor cellular reception (e.g. subterranean underpasses, dense tree canopy, or rural expressway dead zones), the vehicle hardware ceases transmitting real-time coordinate updates.
* **Accepted Behavior**:
  * The system adheres to the **Zero Simulated Bus Movements** mandate. Fabricating, interpolating, or dead-reckoning artificial vehicle movement during telemetry outages is strictly prohibited.
  * Instead, the client application pins the bus icon to its last known verified coordinate and applies visual stale indicators:
    * **31–120 seconds old**: Vehicle enters the `STALE` tier (visual yellow indicator).
    * **> 120 seconds old**: Vehicle enters the `OFFLINE` tier (visual gray indicator).
* **Rationale**:
  Fabricating position estimates risks misleading students about bus locations during breakdowns or unscheduled stops. Pinning to the last verified point ensures absolute truth in tracking.

---

## 2. Offline ETA Suppression to Null

* **Description**:
  When a vehicle's telemetry stream enters the `OFFLINE` tier (> 120 seconds since last heartbeat), arrival estimates cannot be mathematically guaranteed.
* **Accepted Behavior**:
  * Estimated Time of Arrival (ETA) calculations are suppressed to `null` on both backend payloads and frontend interfaces.
  * The student user interface displays `ETA Unavailable (Signal Lost)` rather than presenting an outdated or drifting countdown timer.
* **Rationale**:
  Stale countdown timers lead students to miss buses or wait indefinitely for disabled vehicles. Suppressing ETA forces an honest indicator of connection loss.

---

## 3. Lack of External PSAP / Emergency 911 / Police Bridges

* **Description**:
  The driver console includes an in-app emergency SOS button (`POST /trips/:id/sos`) which triggers dispatch beacons over WebSockets and logs high-priority records in `TripAudit`.
* **Accepted Behavior**:
  * Emergency SOS alerts are routed **strictly within the college transit administrative intranet** (`admin` WebSocket room and dispatch dashboard).
  * The system **does NOT** automatically dial local emergency services (e.g. 112/911, police dispatch, fire, or ambulance PSAPs).
* **Rationale**:
  Direct integration with municipal public-safety answering points (PSAP) requires verified telematics hardware, automated voice/text trunks, and strict legal telecommunications compliance. Campus security and human dispatchers serve as the triage bridge to municipal emergency services.

---

## 4. Read-Only Administrative Route Constraints

* **Description**:
  College bus transit routes, geographic stop coordinates, and route-stop sequences are managed via predefined database seed configurations.
* **Accepted Behavior**:
  * In-service transit routes and physical stop sequences are strictly read-only during operational hours.
  * Dynamic ad-hoc re-routing or live waypoint re-sequencing by drivers during an active trip is not supported.
* **Rationale**:
  Deterministic fare policies, student stop assignments, and automated geofence checks rely on static sequence consistency. Route modifications require deliberate administrative staging and database updates.
