import { z } from 'zod';

/**
 * Configuración de la aplicación, validada al arrancar.
 *
 * Se valida con Zod para que un `.env` incompleto falle de inmediato y con un
 * mensaje claro, en vez de producir un error raro de PostgreSQL a mitad de una
 * petición.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().default(''),
  DB_NAME: z.string().min(1),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
  JWT_EXPIRES_IN: z.string().default('8h'),

  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const detalle = parsed.error.issues
    .map((i) => `  - ${i.path.join('.') || '(raíz)'}: ${i.message}`)
    .join('\n');
  console.error(
    `\nConfiguración inválida. Revisá server/.env:\n${detalle}\n\n` +
      'Tip: copiá server/.env.example a server/.env y completá los valores.\n',
  );
  process.exit(1);
}

export const env = parsed.data;

export const isProd = env.NODE_ENV === 'production';

export const corsOrigins = env.CORS_ORIGIN.split(',')
  .map((o) => o.trim())
  .filter(Boolean);
