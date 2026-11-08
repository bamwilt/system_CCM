import { getPool, closePool } from '../config/database';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

async function runSeeds(): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    const seedsDir = join(process.cwd(), '..', 'database', 'seeds');
    const files = readdirSync(seedsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      console.log(`▶  Seeding ${file}...`);
      const sql = readFileSync(join(seedsDir, file), 'utf-8');
      await client.query(sql);
      console.log(`✅ Seeded ${file}`);
    }

    console.log('Seeding complete.');
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  } finally {
    client.release();
    await closePool();
  }
}

runSeeds();
