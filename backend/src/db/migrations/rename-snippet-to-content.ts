import Database from 'better-sqlite3';
import path from 'path';

// Migration to rename raw_email_snippet to raw_email_content
export function migrateRenameSnippetToContent() {
  const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '../../../database.sqlite');
  const db = new Database(DB_PATH);

  console.log('🔄 Running migration: rename-snippet-to-content');

  try {
    // Check if the column needs to be renamed
    const tableInfo = db.prepare("PRAGMA table_info(flights)").all() as any[];
    const columnNames = tableInfo.map((col: any) => col.name);

    if (columnNames.includes('raw_email_snippet') && !columnNames.includes('raw_email_content')) {
      console.log('  ➕ Renaming column: raw_email_snippet -> raw_email_content');

      // SQLite 3.25.0+ supports ALTER TABLE ... RENAME COLUMN
      try {
        db.exec('ALTER TABLE flights RENAME COLUMN raw_email_snippet TO raw_email_content');
        console.log('  ✓ Column renamed successfully');
      } catch (error: any) {
        // If RENAME COLUMN not supported, create new column and copy data
        if (error.message.includes('syntax error') || error.message.includes('near "COLUMN"')) {
          console.log('  ⚠️  RENAME COLUMN not supported, using fallback approach');

          // Add new column
          db.exec('ALTER TABLE flights ADD COLUMN raw_email_content TEXT');

          // Copy data from old column to new column
          db.exec('UPDATE flights SET raw_email_content = raw_email_snippet');

          console.log('  ✓ New column created and data copied');
        } else {
          throw error;
        }
      }
    } else if (columnNames.includes('raw_email_content')) {
      console.log('  ✓ Column raw_email_content already exists');
    } else {
      console.log('  ➕ Adding column: raw_email_content');
      db.exec('ALTER TABLE flights ADD COLUMN raw_email_content TEXT');
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
  migrateRenameSnippetToContent();
}
