export interface User {
    user_id: string;
    first_name: string;
    username: string;
    first_seen: string; // ISO string
    last_seen: string;  // ISO string
    message_count: number;
}

export interface ChatMessage {
    role: "system" | "user" | "assistant";
    content: string;
    created_at?: string; // ISO string
}

export function toDict(message: ChatMessage): { role: string; content: string } {
    return {
        role: message.role,
        content: message.content,
    };
}
