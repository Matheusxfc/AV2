import { Prisma, PrismaClient } from '@prisma/client';

/** Pode ser o client "normal" ou o client transacional recebido em $transaction(async (tx) => ...). */
export type Db = PrismaClient | Prisma.TransactionClient;

export function criarPrisma(): PrismaClient {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}
