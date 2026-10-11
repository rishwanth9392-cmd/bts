const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const count = await prisma.route.count();
  console.log('Routes Count:', count);
  const drivers = await prisma.driver.findMany({ include: { user: true } });
  console.log('Drivers:', drivers.map(d => d.user.email));
  const routeStop = await prisma.routeStop.findFirst({ include: { stop: true } });
  console.log('Sample RouteStop:', routeStop);
}
main().finally(() => prisma.$disconnect());
