/**
 * @bts/database — Prisma client singleton
 *
 * Instantiates a single PrismaClient and re-exports it so that all
 * consuming apps (`@bts/api`, etc.) share the same connection pool.
 *
 * In development, the client is cached on `globalThis` to survive
 * hot-reloads without exhausting database connections.
 */

import { PrismaClient } from '@prisma/client';

export * from '@prisma/client';


const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
