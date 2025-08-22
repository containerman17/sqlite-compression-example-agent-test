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

db.exec("PRAGMA journal_mode = WAL");

// Drop table if exists to avoid conflicts
db.exec("DROP TABLE IF EXISTS users");
db.exec("CREATE TABLE users (userId TEXT, username TEXT, email TEXT, avatar TEXT, password TEXT, birthdate TEXT, registeredAt TEXT, extraDataJson TEXT)");

console.log("Inserting users into database...");
const stmt = db.prepare("INSERT INTO users (userId, username, email, avatar, password, birthdate, registeredAt, extraDataJson) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");

const insertMany = db.transaction((users) => {
    for (const user of users) {
        stmt.run(user.userId, user.username, user.email, user.avatar, user.password, user.birthdate, user.registeredAt, user.extraDataJson);
    }
});

insertMany(users);

// Dump all users from the database
console.log("Dumping all users from database...");
const allUsers = db.prepare("SELECT * FROM users").all();
console.log(`Total users in database: ${allUsers.length}`);

// Force WAL checkpoint to write all data to main database file
console.log("Checkpointing WAL to ensure data is written to main file...");
db.exec("PRAGMA wal_checkpoint(FULL)");

// Run VACUUM
console.log("Running VACUUM...");
db.exec("VACUUM");

// Get JSON file size
const jsonStats = fs.statSync("users.json");
const jsonSize = jsonStats.size;
console.log(`JSON file size: ${jsonSize} bytes (${(jsonSize / 1024 / 1024).toFixed(2)} MB)`);

// Get SQLite file size after VACUUM
const sqliteStats = fs.statSync("users.sqlite");
const sqliteSize = sqliteStats.size;
console.log(`SQLite file size after VACUUM: ${sqliteSize} bytes (${(sqliteSize / 1024 / 1024).toFixed(2)} MB)`);

const reduction = jsonSize - sqliteSize;
const reductionPercent = ((reduction / jsonSize) * 100).toFixed(2);
console.log(`Size reduction vs JSON: ${reduction} bytes (${reductionPercent}%)`);

db.close();

["users.sqlite", "users.sqlite-wal", "users.sqlite-shm"].forEach(file => {
    if (fs.existsSync(file)) {
        fs.unlinkSync(file);
    }
});
