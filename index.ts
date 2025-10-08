#!/usr/bin/env node

import { faker } from '@faker-js/faker';
import fs from "fs";
import Database from "better-sqlite3";
import { execSync } from 'child_process';

// Generate or read users data
let users: any[] = [];

if (!fs.existsSync("users.json")) {
    users = faker.helpers.multiple(function createRandomUser() {
        return {
            userId: faker.string.uuid(),
            username: faker.internet.username(),
            email: faker.internet.email(),
            avatar: faker.image.avatar(),
            password: faker.internet.password(),
            birthdate: faker.date.birthdate().toISOString(),
            registeredAt: faker.date.past().toISOString(),
            extraDataJson: JSON.stringify({
                extraData: faker.lorem.sentence(),
                favoritePony: faker.animal.horse(),
                favoriteColor: faker.color.rgb(),
                favoriteNumber: faker.number.int(),
                favoriteAnimal: faker.animal.cat(),
                favoriteFood: faker.food.dish(),
                favoriteBook: faker.book.title(),
                favoriteSong: faker.music.songName(),
                favoriteArtist: faker.music.artist(),
            }),
        };
    }, {
        count: 50000,
    });

    fs.writeFileSync("users.json", JSON.stringify(users, null, 2));
} else {
    users = JSON.parse(fs.readFileSync("users.json", "utf-8"));
}

// Clean up any existing SQLite files (both regular and compressed)
["users.sqlite", "users.sqlite-wal", "users.sqlite-shm", "users.zstd.sqlite"].forEach(file => {
    if (fs.existsSync(file)) {
        fs.unlinkSync(file);
    }
});

// First, create an uncompressed database
console.log("Creating uncompressed database...");
const dbTemp = new Database("users.sqlite");

// Note: WAL mode is not supported by zstd_vfs, so we use DELETE mode
dbTemp.exec("PRAGMA journal_mode = DELETE");
dbTemp.exec("PRAGMA page_size = 8192");  // Larger pages compress better

// Drop table if exists to avoid conflicts
dbTemp.exec("DROP TABLE IF EXISTS users");
dbTemp.exec("CREATE TABLE users (userId TEXT, username TEXT, email TEXT, avatar TEXT, password TEXT, birthdate TEXT, registeredAt TEXT, extraDataJson TEXT)");

console.log("Inserting users into uncompressed database...");
const stmt = dbTemp.prepare("INSERT INTO users (userId, username, email, avatar, password, birthdate, registeredAt, extraDataJson) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");

const insertMany = dbTemp.transaction((users) => {
    for (const user of users) {
        stmt.run(user.userId, user.username, user.email, user.avatar, user.password, user.birthdate, user.registeredAt, user.extraDataJson);
    }
});

insertMany(users);
dbTemp.close();

// Get uncompressed SQLite file size
const sqliteStats = fs.statSync("users.sqlite");
const sqliteSize = sqliteStats.size;
console.log(`Uncompressed SQLite file size: ${sqliteSize} bytes (${(sqliteSize / 1024 / 1024).toFixed(2)} MB)`);

// Now create a compressed version using zstd_vfs
console.log("\nCreating compressed database using zstd_vfs...");

// Use sqlite3 CLI to create compressed database (VACUUM INTO with URI doesn't work well in better-sqlite3)
execSync(`sqlite3 users.sqlite -bail -cmd '.load ./sqlite_zstd_vfs/build/zstd_vfs.so' "VACUUM INTO 'file:users.zstd.sqlite?vfs=zstd&level=6&outer_page_size=16384&threads=4&outer_unsafe=true'"`, {
    stdio: 'inherit'
});

// Get compressed SQLite file size
const compressedStats = fs.statSync("users.zstd.sqlite");
const compressedSize = compressedStats.size;
console.log(`Compressed SQLite file size: ${compressedSize} bytes (${(compressedSize / 1024 / 1024).toFixed(2)} MB)`);

// Calculate compression ratio
const compressionReduction = sqliteSize - compressedSize;
const compressionPercent = ((compressionReduction / sqliteSize) * 100).toFixed(2);
console.log(`Compression savings: ${compressionReduction} bytes (${compressionPercent}%)`);

// Test reading from the compressed database
console.log("\nTesting compressed database (reading row by row)...");

// Use sqlite3 CLI to query the compressed database and verify it works
console.log("Querying 5 random users from compressed database...");
const queryResult = execSync(`sqlite3 :memory: -bail -cmd '.load ./sqlite_zstd_vfs/build/zstd_vfs.so' -cmd ".open 'file:users.zstd.sqlite?mode=ro&vfs=zstd'" "SELECT username, email FROM users LIMIT 5"`, {
    encoding: 'utf-8'
});
console.log(queryResult);

// Count total users
const countResult = execSync(`sqlite3 :memory: -bail -cmd '.load ./sqlite_zstd_vfs/build/zstd_vfs.so' -cmd ".open 'file:users.zstd.sqlite?mode=ro&vfs=zstd'" "SELECT COUNT(*) FROM users"`, {
    encoding: 'utf-8'
});
console.log(`Total users in compressed database: ${countResult.trim()}`);

// Test individual row access by userId
console.log("\nTesting row-by-row access by userId...");
const testUserId = execSync(`sqlite3 :memory: -bail -cmd '.load ./sqlite_zstd_vfs/build/zstd_vfs.so' -cmd ".open 'file:users.zstd.sqlite?mode=ro&vfs=zstd'" "SELECT userId FROM users LIMIT 1"`, {
    encoding: 'utf-8'
}).trim();

const singleUserResult = execSync(`sqlite3 :memory: -bail -cmd '.load ./sqlite_zstd_vfs/build/zstd_vfs.so' -cmd ".open 'file:users.zstd.sqlite?mode=ro&vfs=zstd'" "SELECT username, email FROM users WHERE userId = '${testUserId}'"`, {
    encoding: 'utf-8'
});
console.log(`Single user lookup result: ${singleUserResult.trim()}`);

// Get JSON file size for comparison
const jsonStats = fs.statSync("users.json");
const jsonSize = jsonStats.size;
console.log(`\n=== Size Comparison ===`);
console.log(`JSON file size: ${jsonSize} bytes (${(jsonSize / 1024 / 1024).toFixed(2)} MB)`);
console.log(`Uncompressed SQLite: ${sqliteSize} bytes (${(sqliteSize / 1024 / 1024).toFixed(2)} MB)`);
console.log(`Compressed SQLite (zstd): ${compressedSize} bytes (${(compressedSize / 1024 / 1024).toFixed(2)} MB)`);

const jsonVsCompressed = jsonSize - compressedSize;
const jsonVsCompressedPercent = ((jsonVsCompressed / jsonSize) * 100).toFixed(2);
console.log(`Compressed vs JSON: ${jsonVsCompressedPercent}% smaller`);

// Clean up uncompressed database
fs.unlinkSync("users.sqlite");

console.log("\n✓ Compressed database is ready: users.zstd.sqlite");
