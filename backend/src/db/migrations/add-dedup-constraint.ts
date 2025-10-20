import Database from 'better-sqlite3';
import path from 'path';

// Migration to add email metadata fields and unique constraint for deduplication
export function migrateAddDedupConstraint() {
  const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '../../../database.sqlite');
  const db = new Database(DB_PATH);

  console.log('🔄 Running migration: add-dedup-constraint');

  try {
    // Check existing columns
    const tableInfo = db.prepare("PRAGMA table_info(flights)").all() as any[];
    const columnNames = tableInfo.map((col: any) => col.name);

    // Add email metadata columns if they don't exist
    const newColumns = [
      { name: 'email_message_id', type: 'TEXT' },
      { name: 'email_sent_date', type: 'TEXT' },
      { name: 'email_subject', type: 'TEXT' },
    ];

    for (const column of newColumns) {
      if (!columnNames.includes(column.name)) {
        console.log(`  ➕ Adding column: ${column.name}`);
        db.exec(`ALTER TABLE flights ADD COLUMN ${column.name} ${column.type}`);
      } else {
        console.log(`  ✓ Column ${column.name} already exists`);
      }
    }

    // Check if unique index already exists
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='flights_unique_key'").all();

    if (indexes.length === 0) {
      console.log('  ➕ Creating unique index: flights_unique_key');

      db.exec(`
        CREATE UNIQUE INDEX flights_unique_key ON flights(
          user_email,
          confirmation_number,
          flight_date,
          departure_airport,
          arrival_airport,
          flight_number
        )
      `);

      console.log('  ✓ Unique index created');
    } else {
      console.log('  ✓ Unique index flights_unique_key already exists');
    }

    console.log('✅ Migration complete');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    db.close();
  }
}

// Run migration if executed directly
if (require.main === module) {
  migrateAddDedupConstraint();
}
