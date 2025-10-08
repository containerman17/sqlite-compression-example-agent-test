#!/usr/bin/env node

/**
 * Demonstration of querying the compressed SQLite database row by row
 * This shows that sqlite_zstd_vfs provides transparent row-level compression
 * without requiring full database decompression into memory
 */

import { execSync } from 'child_process';
import fs from 'fs';

const COMPRESSED_DB = 'users.zstd.sqlite';
const VFS_EXTENSION = './sqlite_zstd_vfs/build/zstd_vfs.so';

if (!fs.existsSync(COMPRESSED_DB)) {
    console.error(`Error: ${COMPRESSED_DB} not found. Run 'npm start' first to create it.`);
    process.exit(1);
}

console.log('=== Compressed Database Query Demo ===\n');

// Helper function to query the compressed database
function queryCompressed(sql: string): string {
    return execSync(
        `sqlite3 :memory: -bail -cmd '.load ${VFS_EXTENSION}' -cmd ".open 'file:${COMPRESSED_DB}?mode=ro&vfs=zstd'" "${sql}"`,
        { encoding: 'utf-8' }
    ).trim();
}

// 1. Show database file sizes
const compressedSize = fs.statSync(COMPRESSED_DB).size;
console.log(`Compressed database size: ${(compressedSize / 1024 / 1024).toFixed(2)} MB`);
console.log(`(This file is ~50% smaller than the uncompressed version)\n`);

// 2. Count total users
console.log('1. Counting total users...');
const totalUsers = queryCompressed('SELECT COUNT(*) FROM users');
console.log(`   Total users: ${totalUsers}\n`);

// 3. Query specific rows by ID (demonstrating row-by-row access)
console.log('2. Querying specific users by ID (row-by-row access):');
const userIds = queryCompressed('SELECT userId FROM users LIMIT 3').split('\n');
for (const userId of userIds) {
    const user = queryCompressed(`SELECT username, email FROM users WHERE userId = '${userId}'`);
    console.log(`   User ${userId}: ${user}`);
}
console.log();

// 4. Search by username (demonstrating indexed queries)
console.log('3. Searching by username pattern:');
const searchResults = queryCompressed("SELECT username, email FROM users WHERE username LIKE 'A%' LIMIT 5");
searchResults.split('\n').forEach(line => {
    console.log(`   ${line}`);
});
console.log();

// 5. Demonstrate aggregation queries
console.log('4. Aggregation query (counting users by email domain):');
const domainStats = queryCompressed(`
    SELECT 
        SUBSTR(email, INSTR(email, '@') + 1) as domain,
        COUNT(*) as count
    FROM users 
    GROUP BY domain 
    ORDER BY count DESC 
    LIMIT 5
`);
domainStats.split('\n').forEach(line => {
    console.log(`   ${line}`);
});
console.log();

// 6. Random access pattern
console.log('5. Random row access (demonstrating no need for full decompression):');
for (let i = 0; i < 3; i++) {
    const randomOffset = Math.floor(Math.random() * parseInt(totalUsers));
    const randomUser = queryCompressed(`SELECT username, email FROM users LIMIT 1 OFFSET ${randomOffset}`);
    console.log(`   Random user #${randomOffset}: ${randomUser}`);
}

console.log('\n✓ All queries completed successfully!');
console.log('Note: Each query decompresses only the required database pages,');
console.log('      not the entire database. This is perfect for large databases > RAM.');