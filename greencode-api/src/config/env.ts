import 'dotenv/config';

function obrigatoria(nome: string): string {
  const v = process.env[nome];
  if (!v) throw new Error(`Variavel de ambiente obrigatoria ausente: ${nome} (veja .env.example)`);
  return v;
}

function inteiro(nome: string, padrao: number): number {
  const v = process.env[nome];
  if (v === undefined || v === '') return padrao;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) throw new Error(`Variavel ${nome} deve ser um inteiro nao negativo.`);
  return n;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  /** Porta configuravel por variavel de ambiente (requisito do enunciado). */
  port: inteiro('PORT', 3000),
  host: process.env.HOST ?? '0.0.0.0',
  logLevel: process.env.LOG_LEVEL ?? 'info',
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  databaseUrl: obrigatoria('DATABASE_URL'),
  jwtSecret: obrigatoria('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '30m',
  bcryptRounds: inteiro('BCRYPT_ROUNDS', 10),
  /** Tentativas de login por minuto por IP (protecao contra forca bruta). */
  loginRateLimitMax: inteiro('LOGIN_RATE_LIMIT_MAX', 20),
};

if (env.jwtSecret.length < 32) {
  throw new Error('JWT_SECRET deve ter pelo menos 32 caracteres.');
}
