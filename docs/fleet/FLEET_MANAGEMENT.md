# BTS Fleet & Asset Management Guide

---

## 1. Vehicle Inventory Management

The vehicle management subsystem (`/admin/buses`) maintains physical assets, seat capacities, and availability states for the campus transit system.

### Vehicle Attributes & Validation

- **Registration Plate Number**: Unique institutional registration (e.g., `KA-04-F-1234`). Uniqueness is strictly enforced at database and API levels.
- **Vehicle Model & Make**: Optional manufacturer details (e.g., `Tata Marcopolo BS6`, `Ashok Leyland Viking`).
- **Seating Capacity**: Must be strictly greater than zero ($> 0$). Used as the divisor for real-time occupancy calculations.
- **Operational Status**:
  - `ACTIVE`: Vehicle is roadworthy and eligible for dispatch.
  - `INACTIVE`: Vehicle is temporarily taken out of daily service.
  - `MAINTENANCE`: Vehicle is under workshop repair or safety inspection.
- **Availability Toggle (`isActive`)**: Controls whether the bus is visible in dispatch selectors.

---

## 2. Deactivation Safety Guards

To prevent accidental fleet disruption while vehicles are in transit:

- **Bus Deactivation Guard**:
  - Setting `isActive: false` or status to `INACTIVE` / `MAINTENANCE` on a bus is blocked if that bus is currently tied to an `ACTIVE` trip.
  - Rejection: HTTP `400 BadRequestException` with message:
    `"Cannot deactivate bus '...' because it is currently assigned to active trip '...'."`
  - Client Behavior: The UI optimistically reverts the switch and presents a persistent notification banner.

- **Driver Deactivation Guard**:
  - Setting `isActive: false` on a driver is blocked if that driver is currently operating an `ACTIVE` trip.
  - Rejection: HTTP `400 BadRequestException` with message:
    `"Cannot deactivate driver '...' because they are currently operating active trip '...'."`
  - Client Behavior: The UI reverts the toggle and alerts the administrator.

---

## 3. Driver Personnel Management & Conflict Guards

The driver personnel console (`/admin/drivers`) manages commercial drivers and assignment availability.

### Driver Provisioning & Security

- **User Account Binding**: Each driver record is linked to a system `User` entity with `Role.DRIVER`.
- **Credential Protection**:
  - Driver passwords and tokens are never exposed in API responses (`passwordHash`, `refreshToken`, and session tokens are stripped from all projections).
  - Provisioning supports custom initial passwords or institutional defaults (`Driver@BTS2026`).
  - Driver records display full name, commercial driving license number, contact phone, and account email.

### Conflict Safety Rules

- Drivers may only be assigned to a single transit run at any given moment.
- Attempting to dispatch a driver currently tied to an `ACTIVE` or `READY` trip rejects with HTTP `409 ConflictException`.

---

## 4. Vehicle Maintenance Ticket Lifecycle

The fleet service desk (`/admin/maintenance`) tracks work orders and workshop diagnostics to maintain fleet safety standards.

### Categories

- `ENGINE`: Engine diagnostics, oil changes, transmission servicing.
- `TIRES`: Tire rotations, tread depth inspection, brake pad assembly replacements.
- `ELECTRICAL`: Alternator, battery checks, GPS hardware, telematics sensors.
- `GENERAL`: Bodywork, seating upholstery, periodic institutional fitness certification.

### Ticket Status Progression

```
  ┌──────────────┐        ┌──────────────┐        ┌──────────────┐
  │   REPORTED   │  ───>  │ IN_PROGRESS  │  ───>  │   RESOLVED   │
  └──────────────┘        └──────────────┘        └──────────────┘
   Awaiting inspection     Under active repair     Completed & certified
```

1. **REPORTED**: Created by an administrator or driver reporting an issue via `POST /admin/maintenance`.
2. **IN_PROGRESS**: Assigned to mechanical staff with diagnosis notes via `PATCH /admin/maintenance/:id`.
3. **RESOLVED**: Maintenance finished. Sets `resolvedAt = now()` and logs `MAINTENANCE_UPDATED` into the audit trail.
