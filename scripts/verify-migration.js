#!/usr/bin/env node

// Verify migration was successful
import { sql } from '@vercel/postgres';

async function verifyMigration() {
  try {
    console.log('Verifying migration...\n');

    const result = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'video_metadata'
        AND column_name IN ('extended_from_id', 'is_extension')
      ORDER BY column_name
    `;

    if (result.rows.length === 2) {
      console.log('✓ Migration verified successfully!\n');
      console.log('Added columns:');
      result.rows.forEach(row => {
        console.log(`  - ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable})`);
      });
    } else {
      console.log('✗ Migration incomplete. Expected 2 columns, found:', result.rows.length);
    }

  } catch (error) {
    console.error('✗ Verification failed:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

verifyMigration();
