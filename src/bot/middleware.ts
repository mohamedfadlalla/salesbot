import { Context } from "telegraf";
import { Logger } from "../utils/logger";

const rateLimitWindows = new Map<number, number[]>();
const RATE_LIMIT_MAX = 30;       // max messages
const RATE_LIMIT_WINDOW = 60000; // per 60 seconds (in ms)

export async function rateLimitCheck(ctx: Context): Promise<boolean> {
    if (!ctx.from) return true;
    
    const userId = ctx.from.id;
    const now = Date.now();

    let timestamps = rateLimitWindows.get(userId) || [];
    
    // Clean old timestamps
    timestamps = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW);
    
    if (timestamps.length >= RATE_LIMIT_MAX) {
        Logger.warn(`Rate limited user ${userId}`);
        rateLimitWindows.set(userId, timestamps);
        return false;
    }

    timestamps.push(now);
    rateLimitWindows.set(userId, timestamps);
    return true;
}

export async function logIncoming(ctx: Context): Promise<void> {
    if (!ctx.from || !ctx.message) return;
    
    const user = ctx.from;
    const text = 'text' in ctx.message ? ctx.message.text : 
                 'caption' in ctx.message ? ctx.message.caption : "[non-text]";
    
    const display = text && text.length > 200 ? text.substring(0, 200) + "..." : text || "[non-text]";
    
    Logger.info(`IN  | user=${user.id} (@${user.username || "N/A"}) | ${display}`);
}

export async function logOutgoing(userId: number, text: string): Promise<void> {
    const display = text.length > 200 ? text.substring(0, 200) + "..." : text;
    Logger.info(`OUT | user=${userId} | ${display}`);
}
