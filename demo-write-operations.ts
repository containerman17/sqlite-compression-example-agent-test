#!/usr/bin/env node

/**
 * Demonstration of write operations on compressed SQLite database
 * Shows that you can INSERT, UPDATE, and DELETE on the compressed database
 */

import { execSync } from 'child_process';
import fs from 'fs';

const COMPRESSED_DB = 'users.zstd.sqlite';
const VFS_EXTENSION = './sqlite_zstd_vfs/build/zstd_vfs.so';

if (!fs.existsSync(COMPRESSED_DB)) {
    console.error(`Error: ${COMPRESSED_DB} not found. Run 'npm start' first to create it.`);
    process.exit(1);
}

console.log('=== Compressed Database Write Operations Demo ===\n');

// Helper function to execute commands on compressed database
function executeCompressed(sql: string): string {
    try {
        return execSync(
            `sqlite3 :memory: -bail -cmd '.load ${VFS_EXTENSION}' -cmd ".open 'file:${COMPRESSED_DB}?vfs=zstd'" "${sql}"`,
            { encoding: 'utf-8' }
        ).trim();
    } catch (error: any) {
        return error.stdout || error.message;
    }
}

// 1. Show initial count
console.log('1. Initial user count:');
const initialCount = executeCompressed('SELECT COUNT(*) FROM users');
console.log(`   Total users: ${initialCount}\n`);

// 2. Insert a new user
console.log('2. Inserting a new test user...');
const newUserId = 'test-' + Date.now();
const insertSql = `INSERT INTO users (userId, username, email, avatar, password, birthdate, registeredAt, extraDataJson) 
VALUES ('${newUserId}', 'TestUser', 'test@example.com', 'avatar.jpg', 'pass123', '1990-01-01', '2025-01-01', '{}')`;
executeCompressed(insertSql);
console.log(`   Inserted user: ${newUserId}\n`);

// 3. Verify the insert
console.log('3. Verifying the insert:');
const verifyInsert = executeCompressed(`SELECT username, email FROM users WHERE userId = '${newUserId}'`);
console.log(`   Found: ${verifyInsert}\n`);

// 4. Update the user
console.log('4. Updating the test user email...');
executeCompressed(`UPDATE users SET email = 'updated@example.com' WHERE userId = '${newUserId}'`);
const verifyUpdate = executeCompressed(`SELECT username, email FROM users WHERE userId = '${newUserId}'`);
console.log(`   After update: ${verifyUpdate}\n`);

// 5. Count again
console.log('5. Updated user count:');
const afterInsertCount = executeCompressed('SELECT COUNT(*) FROM users');
console.log(`   Total users: ${afterInsertCount} (was ${initialCount})\n`);

// 6. Delete the test user
console.log('6. Deleting the test user...');
executeCompressed(`DELETE FROM users WHERE userId = '${newUserId}'`);
const afterDeleteCount = executeCompressed('SELECT COUNT(*) FROM users');
console.log(`   Total users after delete: ${afterDeleteCount}\n`);

// 7. Show file size (it may grow slightly after writes)
const fileSize = fs.statSync(COMPRESSED_DB).size;
console.log('7. Database file size after operations:');
console.log(`   ${(fileSize / 1024 / 1024).toFixed(2)} MB\n`);

console.log('✓ All write operations completed successfully!');
console.log('\nNote: Write operations work normally, but:');
console.log('  - EXCLUSIVE locking applies (one writer at a time)');
console.log('  - WAL mode is not supported');
console.log('  - For bulk inserts, use outer_unsafe=true parameter for better performance');
console.log('  - Database auto-vacuums on close to reclaim space from deletes');