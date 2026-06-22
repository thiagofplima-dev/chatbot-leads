import fs from 'fs';
import path from 'path';
import { pool } from './connection';

async function migrate() {
  console.log('🔄 Running migrations...');

  const migrationDir = path.resolve(__dirname, 'migrations');
  const files = fs.readdirSync(migrationDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const filePath = path.join(migrationDir, file);
    const sql = fs.readFileSync(filePath, 'utf8');
    console.log(`  → Running ${file}...`);
    try {
      await pool.query(sql);
      console.log(`  ✅ ${file} completed`);
    } catch (error) {
      console.error(`  ❌ ${file} failed:`, error);
      throw error;
    }
  }

  console.log('✅ All migrations completed!');
  await pool.end();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
