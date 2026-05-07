import Database from "better-sqlite3";
import * as path from "path";
import * as fs from "fs";
import { Settings } from "../config/settings";

const DB_PATH = Settings.DATABASE_PATH;
let dbInstance: Database.Database | null = null;

export function getConnection(): Database.Database {
    if (!dbInstance) {
        const dir = path.dirname(DB_PATH);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        dbInstance = new Database(DB_PATH);
        dbInstance.pragma("journal_mode = WAL");
        dbInstance.pragma("foreign_keys = ON");
    }
    return dbInstance;
}

export function initDb(): void {
    const db = getConnection();
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            user_id TEXT PRIMARY KEY,
            first_name TEXT,
            username TEXT,
            first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            message_count INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS chat_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(user_id)
        );

        CREATE INDEX IF NOT EXISTS idx_chat_history_user_id
            ON chat_history(user_id, created_at);

        CREATE TABLE IF NOT EXISTS whatsapp_sessions (
            id TEXT PRIMARY KEY,
            session_data TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);
    console.log(`Database initialized at ${DB_PATH}`);
}
