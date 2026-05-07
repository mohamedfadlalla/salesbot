import { getConnection } from "./database";
import { ChatMessage } from "./models";

export class ChatRepository {
    upsertUser(userId: string, firstName: string = "", username: string = ""): void {
        const db = getConnection();
        const stmt = db.prepare(`
            INSERT INTO users (user_id, first_name, username, message_count)
            VALUES (?, ?, ?, 1)
            ON CONFLICT(user_id) DO UPDATE SET
                first_name = excluded.first_name,
                username = excluded.username,
                last_seen = CURRENT_TIMESTAMP,
                message_count = message_count + 1
        `);
        stmt.run(userId, firstName, username);
    }

    getUserCount(): number {
        const db = getConnection();
        const row = db.prepare("SELECT COUNT(*) as cnt FROM users").get() as { cnt: number } | undefined;
        return row ? row.cnt : 0;
    }

    getTotalMessages(): number {
        const db = getConnection();
        const row = db.prepare("SELECT COALESCE(SUM(message_count), 0) as cnt FROM users").get() as { cnt: number } | undefined;
        return row ? row.cnt : 0;
    }

    getHistory(userId: string, maxMessages: number = 20): ChatMessage[] {
        const db = getConnection();
        const rows = db.prepare(`
            SELECT role, content, created_at
            FROM chat_history
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT ?
        `).all(userId, maxMessages) as { role: string; content: string; created_at: string }[];
        
        // Reverse to get chronological order
        rows.reverse();
        return rows.map(row => ({
            role: row.role as "system" | "user" | "assistant",
            content: row.content,
            created_at: row.created_at
        }));
    }

    addMessage(userId: string, role: "system" | "user" | "assistant", content: string): void {
        const db = getConnection();
        const stmt = db.prepare("INSERT INTO chat_history (user_id, role, content) VALUES (?, ?, ?)");
        stmt.run(userId, role, content);
    }

    clearHistory(userId: string): void {
        const db = getConnection();
        const stmt = db.prepare("DELETE FROM chat_history WHERE user_id = ?");
        stmt.run(userId);
        console.log(`Cleared chat history for user ${userId}`);
    }
}
