import Database from 'better-sqlite3';
import path from 'path';

// Migration to add time and additional columns to flights table
export function migrateAddTimeColumns() {
  const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '../../../database.sqlite');
  const db = new Database(DB_PATH);

  console.log('🔄 Running migration: add-time-columns');

  try {
    // Check if columns already exist
    const tableInfo = db.prepare("PRAGMA table_info(flights)").all() as any[];
    const columnNames = tableInfo.map((col: any) => col.name);

    const columnsToAdd = [
      { name: 'departure_time_local', type: 'TEXT' },
      { name: 'arrival_time_local', type: 'TEXT' },
      { name: 'cabin', type: 'TEXT' },
      { name: 'passenger_names', type: 'TEXT' },
      { name: 'notes', type: 'TEXT' },
    ];

    for (const column of columnsToAdd) {
      if (!columnNames.includes(column.name)) {
        console.log(`  ➕ Adding column: ${column.name}`);
        db.exec(`ALTER TABLE flights ADD COLUMN ${column.name} ${column.type}`);
      } else {
        console.log(`  ✓ Column ${column.name} already exists`);
      }
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
  migrateAddTimeColumns();
}
