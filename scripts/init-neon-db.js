import { sql } from '@vercel/postgres';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function initDatabase() {
  try {
    console.log('🔄 Initializing Neon Postgres database...');

    // Read SQL file
    const sqlFile = join(__dirname, 'init-db.sql');
    const sqlContent = fs.readFileSync(sqlFile, 'utf-8');

    // Execute the entire SQL file at once
    try {
      await sql.query(sqlContent);
      console.log('✅ Database initialized successfully!');
    } catch (err) {
      // If it fails, try executing statement by statement
      console.log('⚠️  Batch execution failed, trying statement by statement...');

      const statements = sqlContent
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--') && !s.match(/^\/\*/));

      for (const statement of statements) {
        try {
          await sql.query(statement);
          console.log(`✓ Executed: ${statement.substring(0, 50)}...`);
        } catch (err) {
          // Ignore "already exists" errors
          if (!err.message.includes('already exists') && !err.message.includes('duplicate')) {
            console.error(`❌ Failed to execute: ${statement.substring(0, 50)}...`);
            throw err;
          } else {
            console.log(`⚠️  Skipped (already exists): ${statement.substring(0, 50)}...`);
          }
        }
      }
      console.log('✅ Database initialized successfully!');
    }

    // Verify tables exist
    const tables = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;

    console.log('📋 Tables found:');
    tables.rows.forEach(row => console.log(`  - ${row.table_name}`));

    // Test connection
    const result = await sql`SELECT NOW() as current_time, version() as postgres_version`;
    console.log('\n🕒 Current time:', result.rows[0].current_time);
    console.log('🐘 Postgres version:', result.rows[0].postgres_version.split(',')[0]);

    process.exit(0);
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    process.exit(1);
  }
}

initDatabase();
