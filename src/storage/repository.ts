import { getConnection } from "./database";
import { ChatMessage } from "./models";

export class ChatRepository {
    async upsertUser(userId: number, firstName: string = "", username: string = ""): Promise<void> {
        const db = await getConnection();
        try {
            await db.run(
                `INSERT INTO users (user_id, first_name, username, message_count)
                 VALUES (?, ?, ?, 1)
                 ON CONFLICT(user_id) DO UPDATE SET
                     first_name = excluded.first_name,
                     username = excluded.username,
                     last_seen = CURRENT_TIMESTAMP,
                     message_count = message_count + 1`,
                [userId, firstName, username]
            );
        } finally {
            await db.close();
        }
    }

    async getUserCount(): Promise<number> {
        const db = await getConnection();
        try {
            const row = await db.get("SELECT COUNT(*) as cnt FROM users");
            return row ? row.cnt : 0;
        } finally {
            await db.close();
        }
    }

    async getTotalMessages(): Promise<number> {
        const db = await getConnection();
        try {
            const row = await db.get("SELECT COALESCE(SUM(message_count), 0) as cnt FROM users");
            return row ? row.cnt : 0;
        } finally {
            await db.close();
        }
    }

    async getHistory(userId: number, maxMessages: number = 20): Promise<ChatMessage[]> {
        const db = await getConnection();
        try {
            const rows = await db.all(
                `SELECT role, content, created_at
                 FROM chat_history
                 WHERE user_id = ?
                 ORDER BY created_at DESC
                 LIMIT ?`,
                [userId, maxMessages]
            );
            
            // Reverse to get chronological order
            rows.reverse();
            return rows.map(row => ({
                role: row.role as "system" | "user" | "assistant",
                content: row.content,
                created_at: row.created_at
            }));
        } finally {
            await db.close();
        }
    }

    async addMessage(userId: number, role: "system" | "user" | "assistant", content: string): Promise<void> {
        const db = await getConnection();
        try {
            await db.run(
                "INSERT INTO chat_history (user_id, role, content) VALUES (?, ?, ?)",
                [userId, role, content]
            );
        } finally {
            await db.close();
        }
    }

    async clearHistory(userId: number): Promise<void> {
        const db = await getConnection();
        try {
            await db.run("DELETE FROM chat_history WHERE user_id = ?", [userId]);
            console.log(`Cleared chat history for user ${userId}`);
        } finally {
            await db.close();
        }
    }
}
