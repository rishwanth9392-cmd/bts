# BTS Fleet Operations & Administration Manual

---

## 1. Operational Command Center Overview

The BTS College Bus Tracking System provides administrators and campus dispatchers with a real-time operational dashboard for tracking active fleet movements, monitoring vehicle capacity, managing emergency beacons, and supervising driver schedules.

### Key Telemetry & Dashboard Metrics

1. **Active Trips Counter**: Live count of transit vehicles currently running active trips across designated BMSIT campus routes.
2. **Scheduled / Ready Counter**: Count of trips in `SCHEDULED` or `READY` status queued for upcoming dispatch cycles.
3. **Telemetry Freshness Categorization**:
   - 🟢 **Live / Active**: Telemetry timestamp updated within the last 30 seconds ($\le 30\,\text{s}$). Vehicle is transmitting GPS fixes normally.
   - 🟡 **Stale**: Telemetry timestamp between 31 and 120 seconds ($31\,\text{s} - 120\,\text{s}$). Indicates brief connectivity latency or cellular dead zone.
   - 🔴 **Offline**: No telemetry received for greater than 120 seconds ($> 120\,\text{s}$) on an active trip. Flags vehicle for dispatcher review.
4. **Emergency SOS Indicator**: Real-time counter of unacknowledged safety distress alerts triggering high-priority visual alarms.
5. **Dynamic Vehicle Occupancy**: Computed from event-sourced boardings (`BOARD` count minus `DROP` count) divided by bus rated seating capacity.

---

## 2. Real-Time WebSocket Synchronization

The web application maintains dual synchronization for fleet dispatchers:

- **Primary WebSocket Channel**: Connects to the real-time Gateway on path `/socket.io`.
- **Event Listeners**:
  - `trip:started`: Broadcast when a driver initiates a trip; instantly adds the trip to the live tracking table.
  - `trip:completed`: Broadcast when a driver marks a trip complete; cleans up tracking displays and updates completed counters.
  - `trip:cancelled`: Broadcast when an administrator aborts or cancels a scheduled/active trip; removes vehicle from active tracking.
  - `admin:sos`: High-priority broadcast triggered by a driver emergency beacon; displays the persistent Emergency Alert Banner.
- **Resilient Fallback**: If the WebSocket connection drops, an automatic background polling fallback queries operational metrics every 10 seconds and auto-revalidates whenever the browser tab gains focus.

---

## 3. Trip Dispatch & Scheduling

### Workflow

1. Navigate to **Overview** (`/admin/dashboard`) and click **🚀 Dispatch Trip**.
2. Select a verified route from the **Route Directory** (e.g., Route 02 through Route 11).
3. Select an available bus from the **Active Fleet Inventory**.
4. Select an available certified driver from the **Driver Personnel Roster**.
5. Click **Confirm Dispatch Assignment**.

### Assignment Integrity Engine Safety Rules

To prevent conflicting dispatches and multi-trip assignments:

- **Driver Conflict Guard**: A driver currently assigned to an `ACTIVE` or `READY` trip cannot be assigned to another trip. Violations reject with HTTP `409 ConflictException`.
- **Bus Conflict Guard**: A bus currently assigned to an `ACTIVE` or `READY` trip cannot be assigned to another trip. Violations reject with HTTP `409 ConflictException`.
- **Atomic Concurrency Wrapper**: Uses database transactions (`$transaction`) to guarantee isolation and prevent race conditions when multiple dispatchers operate concurrently.

---

## 4. Trip Cancellation Safety Rules

Dispatchers have authority to cancel scheduled trips or emergency-abort active trips:

- **Endpoint**: `POST /admin/trips/:id/cancel`
- **Audit Mandate**: Cancellation requires an audited reason (e.g., *"Mechanical failure; replacement bus dispatched"*).
- **Active Trip Cleanup**:
  - Sets trip status to `CANCELLED`.
  - Clears in-memory geofence states and ETA caches.
  - Emits `trip:cancelled` via WebSocket to instantly notify student and driver client apps.
  - Persists a `TRIP_CANCELLED` record in `AdminAudit`.

---

## 5. Verified Route & Stop Inspection

Administrators can inspect institutional routes via `/admin/routes`:

- **9 Verified BMSIT Transit Routes**:
  - Route 02, Route 03, Route 04, Route 06, Route 07, Route 08, Route 09, Route 10, Route 11.
- **Ordered Stop Sequence**: Lists every physical stop by ordered sequence index (`sequence`), scheduled arrival/departure times, and geographical coordinates.
- **Geofence Enforcement**: Displays the 50-meter circular detection boundary per stop used for automatic arrival logging and dwell tracking.
- **Strict Read-Only Enforcement**: To preserve the verified dataset and eliminate telemetry prediction errors, direct modifications to stop sequences and coordinates are restricted in the administrative console.
