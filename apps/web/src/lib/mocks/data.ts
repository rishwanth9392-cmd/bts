import type { Bus, Route, BoardingState } from '@bts/shared';

export const mockRoute: Route = {
  id: 'R-04',
  name: 'BTS-04',
  stops: ['Main Gate', 'Library', 'Hostel A', 'Science Block']
};

export const mockStudentState: BoardingState = {
  status: 'APPROACHING',
  eta: 3,
  pickupStop: 'Main Gate'
};

export const mockFleet: Bus[] = [
  { id: 'BUS-102', number: 'KA-01-F-1234', routeId: 'R-04', capacity: 24, occupancy: 18, status: 'ON_ROUTE', location: { lat: 12.9716, lng: 77.5946 } },
  { id: 'BUS-103', number: 'KA-01-F-1235', routeId: 'R-05', capacity: 40, occupancy: 40, status: 'ON_ROUTE', location: { lat: 12.9720, lng: 77.5950 } },
  { id: 'BUS-104', number: 'KA-01-F-1236', capacity: 24, occupancy: 0, status: 'IDLE' },
  { id: 'BUS-105', number: 'KA-01-F-1237', routeId: 'R-02', capacity: 40, occupancy: 12, status: 'ON_ROUTE', location: { lat: 12.9710, lng: 77.5940 } },
  { id: 'BUS-106', number: 'KA-01-F-1238', capacity: 24, occupancy: 0, status: 'MAINTENANCE' },
  { id: 'BUS-107', number: 'KA-01-F-1239', routeId: 'R-01', capacity: 40, occupancy: 5, status: 'ON_ROUTE', location: { lat: 12.9730, lng: 77.5920 } },
];
