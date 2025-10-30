#!/usr/bin/env node

// Run database migration to add extension tracking fields
import { sql } from '@vercel/postgres';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runMigration() {
  try {
    console.log('Running migration: add-extend-field.sql');

    const migrationSQL = readFileSync(
      join(__dirname, 'add-extend-field.sql'),
      'utf8'
    );

    // Execute migration
    await sql.query(migrationSQL);

    console.log('✓ Migration completed successfully!');
    console.log('Added fields: extended_from_id, is_extension');

  } catch (error) {
    console.error('✗ Migration failed:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

runMigration();
