import { buildApp } from './app';
import { env } from './config/env';
import { criarPrisma } from './infra/prisma';

async function main(): Promise<void> {
  const prisma = criarPrisma();
  const app = await buildApp(prisma);

  await app.listen({ port: env.port, host: env.host });
  app.log.info(`greencode API no ar: http://localhost:${env.port}  |  documentacao: http://localhost:${env.port}/docs`);

  // ---- Graceful shutdown ---------------------------------------------------
  // Para de aceitar novas conexoes, aguarda as requisicoes em andamento terminarem,
  // fecha o pool do Prisma e so entao encerra o processo.
  let encerrando = false;
  const encerrar = async (sinal: string) => {
    if (encerrando) return;
    encerrando = true;
    app.log.info(`${sinal} recebido: encerrando com graceful shutdown...`);

    // Rede de seguranca: se algo travar, forca a saida apos 15s.
    const watchdog = setTimeout(() => {
      app.log.error('Tempo limite de shutdown excedido; forcando saida.');
      process.exit(1);
    }, 15_000);
    watchdog.unref();

    try {
      await app.close(); // aguarda requisicoes em andamento + dispara onClose (prisma.$disconnect)
      app.log.info('Servidor encerrado com sucesso.');
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'Falha no shutdown');
      process.exit(1);
    }
  };

  // SIGINT (Ctrl+C) funciona em Windows e Linux; SIGTERM e o sinal do Docker/systemd.
  process.on('SIGINT', () => void encerrar('SIGINT'));
  process.on('SIGTERM', () => void encerrar('SIGTERM'));
}

main().catch((err) => {
  console.error('Falha ao iniciar o servidor:', err);
  process.exit(1);
});
