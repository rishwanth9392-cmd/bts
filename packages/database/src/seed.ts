import {
  PrismaClient,
  Role,
  BusStatus,
  TripStatus,
  BoardingStatus,
  BoardingMethod,
  BoardingEventType,
  MaintenanceCategory,
  MaintenanceStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const ADMIN_PASSWORD = 'Admin@BTS2026';
const SALT_ROUNDS = 10;

const routesData = [
  {
    name: "ROUTE NO: 02",
    stops: [
      { name: "Shanthi Nagar Bus stop", time: "7.05 AM" },
      { name: "MG Road (Trinity Circle)", time: "7.15 AM" },
      { name: "Ulsoor Police Station", time: "7.20 AM" },
      { name: "Ulsoor Adarsha Theatre", time: "7.25 AM" },
      { name: "Shanthi Sagar Ulsoor Lake", time: "7.30 AM" },
      { name: "Thomas Cafe Petrol Bunk", time: "7.33 AM" },
      { name: "Coles Park", time: "7.35 AM" },
      { name: "Nandi Durga Road", time: "7.37 AM" },
      { name: "JC Tower Munireddy Palya (Snow City)", time: "7.40 AM" },
      { name: "Matadhalli Bus stop (Radhakrishna Theatre)", time: "7.44 AM" },
      { name: "RT Nagar Post Officе", time: "7.48 AM" },
      { name: "RT Nagar Police Station", time: "7.51 AM" },
      { name: "CBI Bus Stop", time: "7.53 AM" },
      { name: "Hebbal Bus Stop", time: "7.55 AM" },
      { name: "BMSIT&M", time: "8.20 AM" }
    ]
  },
  {
    name: "ROUTENO:3",
    stops: [
      { name: "Devegowda Petrol Bunk", time: "6.50 AM" },
      { name: "Kamakya Fashion Factory", time: "6.55 AM" },
      { name: "Janatha Bazaar", time: "6.57 AM" },
      { name: "PES College", time: "6.59 AM" },
      { name: "Nayandahalli Junction", time: "7.02 AM" },
      { name: "KHB Colony", time: "7.10 AM" },
      { name: "Pavithra Paradise", time: "7.15 AM" },
      { name: "Basaveshwara Nagar Water Tank", time: "7.18 AM" },
      { name: "Shankar mutt", time: "7.20 AM" },
      { name: "Rajaji Nagar Metro Station", time: "7.22 AM" },
      { name: "Mahalakshmi Layout Entrance", time: "7.25 AM" },
      { name: "Mysore sandal soap factory", time: "7.27 AM" },
      { name: "Govardhan Theatre", time: "7.30 AM" },
      { name: "Yeshwanthapura fly over", time: "7.35 AM" },
      { name: "BMSIT&M", time: "8.20 AM" }
    ]
  },
  {
    name: "ROUTE NO: 4",
    stops: [
      { name: "Uttarahalli Bus Stand", time: "6.57 AM" },
      { name: "Patalamma Temple", time: "7.02 AM" },
      { name: "Nachiyar Café", time: "7.07 AM" },
      { name: "Gopalan Mall (RR Nagar)", time: "7.11 AM" },
      { name: "Jnanabharathi University Gate", time: "7.15 AM" },
      { name: "Jnanabharathi University Admin block", time: "7.18 AM" },
      { name: "Naagarabhavi Circle", time: "7.22 AM" },
      { name: "Maalgala", time: "7.25 AM" },
      { name: "Summanahalli Bridge", time: "7.28 AM" },
      { name: "Laggeri Pipeline", time: "7.32 AM" },
      { name: "Nandini Layout", time: "7.35 AM" },
      { name: "Rajkumar Memorial", time: "7.38 AM" },
      { name: "Modern Bakery Gate", time: "7.39 AM" },
      { name: "IBC Platinum City", time: "7.45 AM" },
      { name: "HMT Auditorium", time: "7.48 AM" },
      { name: "Gangamma Circle", time: "7.50 AM" },
      { name: "MS palya", time: "7.52 AM" },
      { name: "Sambram College", time: "7.55 AM" },
      { name: "BMSIT&M", time: "8.20 AM" }
    ]
  },
  {
    name: "ROUTE NO:6",
    stops: [
      { name: "BMSCE", time: "6.55 AM" },
      { name: "Ramakrishna Ashram", time: "6.58 AM" },
      { name: "Chamarajpet", time: "7.05 AM" },
      { name: "Goodshed Road", time: "7.08 AM" },
      { name: "Shantala Silk House", time: "7.10 AM" },
      { name: "Central Stop", time: "7.15 AM" },
      { name: "Malleswaram 13th cross", time: "7.18 AM" },
      { name: "Malleswaram 18th cross", time: "7.20 AM" },
      { name: "Tata Institute", time: "7.22 AM" },
      { name: "Sadhashiva Nagar Police Station", time: "7.25 AM" },
      { name: "MS Ramaiah Hospital", time: "7.27 AM" },
      { name: "Punjab National Bank", time: "7.30 AM" },
      { name: "Devasandra Bus Stop", time: "7.32 AM" },
      { name: "Kanthi Sweets New BEL Road", time: "7.35 AM" },
      { name: "BEL Circle", time: "7.38 AM" },
      { name: "HMT Gate (Ramachandra Pura)", time: "7.38 AM" },
      { name: "Gangamma Circle", time: "7.45 AM" },
      { name: "Airforce Camp", time: "7.48 AM" },
      { name: "MS Palya", time: "7.50 AM" },
      { name: "BMSIT&M Girls Hostel", time: "8.05 AM" },
      { name: "BMSITM", time: "8.20 AM" }
    ]
  },
  {
    name: "ROUTE NO:-07",
    stops: [
      { name: "Navaranga Theatre", time: "7.10 AM" },
      { name: "Mariyappana Palya", time: "7.12 AM" },
      { name: "Harichandra Ghat", time: "7.14 AM" },
      { name: "Devaiah Park", time: "7.16 AM" },
      { name: "Malleswaram Circle", time: "7.18 AM" },
      { name: "Malleswaram 8th cross", time: "7.20 AM" },
      { name: "Malleswaram 15th cross", time: "7.22 AM" },
      { name: "Chitramutt / Coffee Day", time: "7.24 AM" },
      { name: "8th main Ganesh Temple", time: "7.26 AM" },
      { name: "Malleshwaram 18th cross", time: "7.28 AM" },
      { name: "Shadashiva Nagar Bhashyam Circle", time: "7.30 AM" },
      { name: "Mekhri Circle", time: "7.32 AM" },
      { name: "Aswath Nagar Bus Stop", time: "7.34 AM" },
      { name: "Geddalahalli Bus stop", time: "7.36 AM" },
      { name: "Sanjay Nagar Bus Stoр", time: "7.38 AM" },
      { name: "Bhadrappa Layout", time: "7.42 AM" },
      { name: "Kodigehalli Gate", time: "7.50 AM" },
      { name: "Bydarayanapura (Udupi Kitchen)", time: "7.53 AM" },
      { name: "GKVK", time: "7.55 AM" },
      { name: "Aerodrome", time: "7.57 AM" },
      { name: "Yelahanka NES", time: "8.05 AM" }
    ]
  },
  {
    name: "ROUTE NO :-08",
    stops: [
      { name: "BEL Circle", time: "7.42 AM" },
      { name: "BEL colony", time: "7.45 AM" },
      { name: "Doddabommasandra Arch", time: "7.40 AM" },
      { name: "Chamundeshwari Layout", time: "7.43 AM" },
      { name: "Nanjappa Circle", time: "7.52 AM" },
      { name: "Vidyaranyapura 1 Block", time: "7.54 AM" },
      { name: "Vidyaranyapura Canara Bank", time: "7.56 AM" },
      { name: "VidyaranyapuraPost Office", time: "7.58 AM" }
    ]
  },
  {
    name: "ROUTE NO: 09",
    stops: [
      { name: "8Th Mile Bus stop", time: "7.20 AM" },
      { name: "Dasarahalli Bus stop", time: "7.23 AM" },
      { name: "Jalahalli Cross", time: "7.28 AM" },
      { name: "Sri Ayyapa Temple Bus Stop", time: "7.32 AM" },
      { name: "Shettihalli Bus Stoр", time: "7.40 AM" },
      { name: "KH Halli Railway Bridge", time: "7.43 AM" },
      { name: "KG Halli (HMT Water Factory)", time: "7.45 AM" },
      { name: "HMT Auditorium", time: "7.50 AM" },
      { name: "BMSIT&M Girls Hostel", time: "8.05 AM" },
      { name: "BMSIT&M", time: "8.20 AM" }
    ]
  },
  {
    name: "ROUTE NO : BMSIT 10",
    stops: [
      { name: "Hoskote before Toll", time: "6.55 AM" },
      { name: "Budigire Cross", time: "6.57 AM" },
      { name: "Medahalli RTO Office", time: "7.00 AM" },
      { name: "TC Palya Signal", time: "7.02 AM" },
      { name: "KR Puram", time: "7.05 AM" },
      { name: "ITI Main Gate", time: "7.12 AM" },
      { name: "Ramamurthy Nagar Church", time: "7.15 AM" },
      { name: "Ramamurthy Nagar Aladamara", time: "7.15 AM" },
      { name: "Ramamurthy Nagar Central Bank", time: "7.18 AM" },
      { name: "Vijaya Bank Colony", time: "7.25 AM" },
      { name: "Kalyannagar Depot", time: "7.40 AM" },
      { name: "HBR Layout", time: "7.45 AM" },
      { name: "Manyatha Techpark", time: "7.46 AM" },
      { name: "Veeranna Palya", time: "7.50 AM" },
      { name: "BMSIT&M", time: "8.20 AM" }
    ]
  },
  {
    name: "ROUTE NO: 11",
    stops: [
      { name: "KFC CМH Road Indiranagar", time: "7.05 AM" },
      { name: "New Thippasandra Main Road", time: "7.10 AM" },
      { name: "BEML Gate", time: "7.15 AM" },
      { name: "NGEF", time: "7.20 AM" },
      { name: "Baiyappanahalli Metro Station", time: "7.22 AM" },
      { name: "Bennaganahalli", time: "7.25 AM" },
      { name: "Kasthuri Nagar", time: "7.30 AM" },
      { name: "Ramamurthy Nagar Bridge under pass", time: "7.32 AM" },
      { name: "Vijaya Bank Colony", time: "7.35 AM" },
      { name: "Horamavu Signal/Banaswadi Fly Over", time: "7.37 AM" },
      { name: "Babusapalya", time: "7.39 AM" },
      { name: "Kalyannagar", time: "7.40 AM" },
      { name: "Hennur Cross", time: "7.42 AM" },
      { name: "Nagawara КЕВ", time: "7.44 AM" },
      { name: "BMSIT&M", time: "8.20 AM" }
    ]
  }
];

async function main() {
  console.log('Clearing existing data...');
  
  await prisma.adminAudit.deleteMany();
  await prisma.busMaintenance.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.boardingEvent.deleteMany();
  await prisma.pickupAssignment.deleteMany();
  await prisma.geofence.deleteMany();
  await prisma.locationHistory.deleteMany();
  await prisma.tripAudit.deleteMany();
  await prisma.trip.deleteMany();
  await prisma.routeStop.deleteMany();
  await prisma.stop.deleteMany();
  await prisma.route.deleteMany();
  await prisma.bus.deleteMany();
  await prisma.student.deleteMany();
  await prisma.driver.deleteMany();
  await prisma.user.deleteMany();

  console.log('Creating Admin & Drivers...');
  
  const adminPasswordHash = bcrypt.hashSync(ADMIN_PASSWORD, SALT_ROUNDS);
  
  const admin = await prisma.user.create({
    data: {
      email: 'admin@bmsit.edu',
      role: Role.ADMIN,
      passwordHash: adminPasswordHash,
    },
  });

  const driver1 = await prisma.user.create({
    data: {
      email: 'swamy_driver@bmsit.edu',
      role: Role.DRIVER,
      driver: { create: { licenseNumber: 'KA-DL-1001' } }
    },
    include: { driver: true }
  });

  const driver2 = await prisma.user.create({
    data: {
      email: 'sarmasth_driver@bmsit.edu',
      role: Role.DRIVER,
      driver: { create: { licenseNumber: 'KA-DL-1002' } }
    },
    include: { driver: true }
  });

  const student1 = await prisma.user.create({
    data: {
      email: 'rahul@student.bmsit.edu',
      role: Role.STUDENT,
      student: { create: { usn: '1BM21CS001' } }
    },
    include: { student: true }
  });

  const student2 = await prisma.user.create({
    data: {
      email: 'anjali@student.bmsit.edu',
      role: Role.STUDENT,
      student: { create: { usn: '1BM21CS002' } }
    },
    include: { student: true }
  });

  const bus1 = await prisma.bus.create({
    data: {
      plateNumber: 'KA-01-F-1234',
      capacity: 40,
      status: BusStatus.ACTIVE,
      isActive: true,
    }
  });

  console.log('Creating Routes & Stops...');

  let activeRouteId = '';
  
  for (const r of routesData) {
    const route = await prisma.route.create({
      data: { name: r.name }
    });
    
    // Store one for trips later
    if (!activeRouteId) activeRouteId = route.id;

    for (let i = 0; i < r.stops.length; i++) {
      const stopData = r.stops[i];
      let stop = await prisma.stop.findFirst({ where: { name: stopData.name } });
      if (!stop) {
        stop = await prisma.stop.create({
          data: {
            name: stopData.name,
            lat: null, // explicitly null
            lng: null, // explicitly null
          }
        });
      }
      
      await prisma.routeStop.create({
        data: {
          routeId: route.id,
          stopId: stop.id,
          sequence: i + 1,
          scheduledTime: stopData.time
        }
      });
    }
  }

  console.log('Creating Active Trip & Boarding Events...');
  
  const trip = await prisma.trip.create({
    data: {
      busId: bus1.id,
      routeId: activeRouteId,
      driverId: driver1.driver!.id,
      status: TripStatus.ACTIVE,
      startTime: new Date(),
    }
  });

  await prisma.tripAudit.create({
    data: {
      tripId: trip.id,
      driverId: driver1.driver!.id,
      action: 'TRIP_STARTED',
      metadata: { seeded: true },
    },
  });

  const routeStops = await prisma.routeStop.findMany({
    where: { routeId: activeRouteId },
    include: { stop: true },
    orderBy: { sequence: 'asc' }
  });

  if (routeStops.length > 1) {
    const stop1 = routeStops[0].stop;
    const stop2 = routeStops[1].stop;

    await prisma.pickupAssignment.create({
      data: { studentId: student1.student!.id, routeId: activeRouteId, stopId: stop1.id }
    });

    await prisma.boardingEvent.create({
      data: {
        studentId: student1.student!.id,
        tripId: trip.id,
        stopId: stop1.id,
        method: BoardingMethod.APP,
        status: BoardingStatus.CONFIRMED,
        type: BoardingEventType.BOARD
      }
    });
  }

  console.log('Creating Admin Audit & Maintenance records...');

  await prisma.adminAudit.create({
    data: {
      adminId: admin.id,
      action: 'SYSTEM_INITIALIZED',
      targetType: 'SYSTEM',
      targetId: 'SEED',
      metadata: { seeded: true, timestamp: new Date().toISOString() },
    },
  });

  await prisma.busMaintenance.create({
    data: {
      busId: bus1.id,
      category: MaintenanceCategory.GENERAL,
      description: 'Routine 10,000 km fleet inspection and brake pad verification',
      status: MaintenanceStatus.RESOLVED,
      reportedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      resolvedAt: new Date(),
      notes: 'Brakes and tires inspected. Fleet ready for service.',
      reportedById: admin.id,
      resolvedById: admin.id,
    },
  });

  console.log('Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
