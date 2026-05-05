import sqlite3 from "sqlite3";
import { open, Database } from "sqlite";
import * as path from "path";
import * as fs from "fs";
import { Settings } from "../config/settings";

const DB_PATH = Settings.DATABASE_PATH;

export async function getConnection(): Promise<Database> {
    const db = await open({
        filename: DB_PATH,
        driver: sqlite3.Database
    });
    
    await db.exec("PRAGMA journal_mode=WAL");
    await db.exec("PRAGMA foreign_keys=ON");
    
    return db;
}

export async function initDb(): Promise<void> {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    const db = await getConnection();
    try {
        await db.exec(`
            CREATE TABLE IF NOT EXISTS users (
                user_id INTEGER PRIMARY KEY,
                first_name TEXT,
                username TEXT,
                first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                message_count INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS chat_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(user_id)
            );

            CREATE INDEX IF NOT EXISTS idx_chat_history_user_id
                ON chat_history(user_id, created_at);
        `);
        console.log(`Database initialized at ${DB_PATH}`);
    } finally {
        await db.close();
    }
}
