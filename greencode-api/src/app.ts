import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { PrismaClient } from '@prisma/client';
import Fastify from 'fastify';
import { env } from './config/env';
import { criarContainer } from './container';
import { rotasAuth } from './http/rotas/auth';
import { rotasEquipamentos } from './http/rotas/equipamentos';
import { rotasJournal } from './http/rotas/journal';
import { rotasLotes } from './http/rotas/lotes';
import { rotasOrganizacoes } from './http/rotas/organizacoes';
import { rotasParametros } from './http/rotas/parametros';
import { rotasRelatorios } from './http/rotas/relatorios';
import { rotasUsuarios } from './http/rotas/usuarios';
import authPlugin from './plugins/auth';
import { registrarErros } from './plugins/erros';

export async function buildApp(prisma: PrismaClient) {
  const app = Fastify({
    logger: { level: env.logLevel },
    // Em desligamento, fecha conexoes keep-alive ociosas para o app.close() nao ficar pendurado.
    forceCloseConnections: 'idle',
  });

  registrarErros(app);

  await app.register(cors, {
    origin: env.corsOrigin === '*' ? true : env.corsOrigin.split(',').map((o) => o.trim()),
  });
  await app.register(rateLimit, { global: false });

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'greencode API',
        description: 'API RESTful de logistica reversa de equipamentos eletronicos (Atividade 2).',
        version: '2.0.0',
      },
      components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
    },
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  await app.register(authPlugin);

  const c = criarContainer(prisma);

  app.get('/health', { schema: { tags: ['Infra'], summary: 'Healthcheck (inclui ping no banco)' } }, async (_req, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', banco: 'ok', timestamp: Date.now() };
    } catch {
      return reply.status(503).send({ status: 'indisponivel', banco: 'falha', timestamp: Date.now() });
    }
  });

  await app.register(rotasAuth(c), { prefix: '/auth' });
  await app.register(rotasUsuarios(c), { prefix: '/usuarios' });
  await app.register(rotasParametros(c), { prefix: '/parametros' });
  await app.register(rotasOrganizacoes(c), { prefix: '/organizacoes' });
  await app.register(rotasLotes(c), { prefix: '/lotes' });
  await app.register(rotasEquipamentos(c), { prefix: '/equipamentos' });
  await app.register(rotasRelatorios(c), { prefix: '/relatorios' });
  await app.register(rotasJournal(c), { prefix: '/journal' });

  // Graceful shutdown: ao fechar o servidor, encerra tambem o pool de conexoes do Prisma.
  app.addHook('onClose', async () => {
    await prisma.$disconnect();
  });

  return app;
}

// Easter egg
// Num pode bater no DevTeam.