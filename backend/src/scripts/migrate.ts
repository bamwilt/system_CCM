import { getPool, closePool } from '../config/database';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

async function runMigrations(): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    // Create migrations tracking table
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Find migration files
    const migrationsDir = join(process.cwd(), '..', 'database', 'migrations');
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const result = await client.query(
        'SELECT 1 FROM _migrations WHERE filename = $1',
        [file]
      );

      if (result.rows.length > 0) {
        console.log(`⏭  Skipping ${file} (already applied)`);
        continue;
      }

      console.log(`▶  Applying ${file}...`);
      const sql = readFileSync(join(migrationsDir, file), 'utf-8');
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO _migrations (filename) VALUES ($1)',
        [file]
      );
      await client.query('COMMIT');
      console.log(`✅ Applied ${file}`);
    }

    console.log('Migrations complete.');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    client.release();
    await closePool();
  }
}

runMigrations();
