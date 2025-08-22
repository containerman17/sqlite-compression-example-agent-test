#!/usr/bin/env node

import { faker } from '@faker-js/faker';
import fs from "fs";
import Database from "better-sqlite3";

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

// Clean up any existing SQLite files
["users.sqlite", "users.sqlite-wal", "users.sqlite-shm"].forEach(file => {
    if (fs.existsSync(file)) {
        fs.unlinkSync(file);
    }
});

const db = new Database("users.sqlite");

// Load sqlite-zstd extension
console.log("Loading sqlite-zstd extension...");
db.loadExtension("./libsqlite_zstd.so");

db.exec("PRAGMA journal_mode = WAL");
// Recommended settings for sqlite-zstd
db.exec("PRAGMA busy_timeout = 2000");
db.exec("PRAGMA auto_vacuum = FULL");

// Drop table if exists to avoid conflicts
db.exec("DROP TABLE IF EXISTS users");
db.exec("CREATE TABLE users (userId TEXT PRIMARY KEY, username TEXT, email TEXT, avatar TEXT, password TEXT, birthdate TEXT, registeredAt TEXT, extraDataJson TEXT)");

console.log("Inserting users into database...");
const stmt = db.prepare("INSERT INTO users (userId, username, email, avatar, password, birthdate, registeredAt, extraDataJson) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");

const insertMany = db.transaction((users) => {
    for (const user of users) {
        stmt.run(user.userId, user.username, user.email, user.avatar, user.password, user.birthdate, user.registeredAt, user.extraDataJson);
    }
});

insertMany(users);

// Get size before compression
console.log("\n=== Size before compression ===");
const beforeStats = fs.statSync("users.sqlite");
const beforeSize = beforeStats.size;
console.log(`SQLite file size before compression: ${beforeSize} bytes (${(beforeSize / 1024 / 1024).toFixed(2)} MB)`);

// Enable transparent compression on extraDataJson column
console.log("\nEnabling transparent compression on extraDataJson column...");
db.exec(`SELECT zstd_enable_transparent('{"table": "users", "column": "extraDataJson", "compression_level": 19, "dict_chooser": "''a''"}')`);

// Run incremental maintenance to compress existing data
console.log("Running compression maintenance...");
db.exec("SELECT zstd_incremental_maintenance(null, 1)");

// Force WAL checkpoint to write all data to main database file
console.log("Checkpointing WAL to ensure data is written to main file...");
db.exec("PRAGMA wal_checkpoint(FULL)");

// Run VACUUM to reclaim space
console.log("Running VACUUM to reclaim space...");
db.exec("VACUUM");

// Get size after compression
console.log("\n=== Size after compression ===");
const afterStats = fs.statSync("users.sqlite");
const afterSize = afterStats.size;
console.log(`SQLite file size after compression: ${afterSize} bytes (${(afterSize / 1024 / 1024).toFixed(2)} MB)`);

// Test that data is still queryable
console.log("\n=== Testing data accessibility ===");
const allUsers = db.prepare("SELECT * FROM users").all();
console.log(`Total users in database: ${allUsers.length}`);

// Test a specific query
const sampleUser = db.prepare("SELECT * FROM users LIMIT 1").get();
console.log(`Sample user data (first user): ${sampleUser.username}, extraData length: ${sampleUser.extraDataJson.length} chars`);

// Get compression statistics
console.log("\n=== Compression statistics ===");
const compressionStats = db.prepare("SELECT * FROM _zstd_configs").all();
console.log("Compression configuration:", compressionStats);

try {
    const dictStats = db.prepare("SELECT id, length(dict) as dict_size FROM _zstd_dicts").all();
    console.log("Dictionary info:", dictStats);
} catch (e) {
    console.log("Dictionary table structure may vary by sqlite-zstd version");
}

// Get JSON file size for comparison
console.log("\n=== Overall size comparison ===");
const jsonStats = fs.statSync("users.json");
const jsonSize = jsonStats.size;
console.log(`JSON file size: ${jsonSize} bytes (${(jsonSize / 1024 / 1024).toFixed(2)} MB)`);
console.log(`SQLite uncompressed: ${beforeSize} bytes (${(beforeSize / 1024 / 1024).toFixed(2)} MB)`);
console.log(`SQLite compressed: ${afterSize} bytes (${(afterSize / 1024 / 1024).toFixed(2)} MB)`);

const compressionReduction = beforeSize - afterSize;
const compressionPercent = ((compressionReduction / beforeSize) * 100).toFixed(2);
console.log(`\nCompression savings: ${compressionReduction} bytes (${compressionPercent}% reduction)`);

const totalReduction = jsonSize - afterSize;
const totalPercent = ((totalReduction / jsonSize) * 100).toFixed(2);
console.log(`Total size reduction vs JSON: ${totalReduction} bytes (${totalPercent}% reduction)`);

db.close();

// Clean up - keeping the compressed database for inspection
console.log("\nDatabase file 'users.sqlite' has been kept for inspection.");
console.log("The extraDataJson column is now transparently compressed with zstd.");
