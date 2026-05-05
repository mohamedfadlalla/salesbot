import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { NewMessage, NewMessageEvent } from "telegram/events";
import * as fs from "fs";
import * as path from "path";
import { Settings } from "../config/settings";
import { getProvider } from "../providers";
import { ChatRepository } from "../storage/repository";
import { SYSTEM_MESSAGE } from "./system_message";
import { rateLimitCheck } from "./middleware";
import { Logger } from "../utils/logger";

const repo = new ChatRepository();
const aiProvider = getProvider();

const messageBuffers = new Map<number, string[]>();
const pendingTasks = new Map<number, NodeJS.Timeout>();

async function buildHistory(userId: number) {
    const messages: any[] = [{ role: "system", content: SYSTEM_MESSAGE }];
    const history = await repo.getHistory(userId, Settings.MAX_HISTORY_MESSAGES);
    for (const msg of history) {
        messages.push({ role: msg.role, content: msg.content });
    }
    return messages;
}

// Simple rate limiter for user client
const rateLimitWindows = new Map<number, number[]>();
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW = 60000;

function rateLimitCheckUser(userId: number): boolean {
    const now = Date.now();
    let timestamps = rateLimitWindows.get(userId) || [];
    timestamps = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW);
    
    if (timestamps.length >= RATE_LIMIT_MAX) {
        Logger.warn(`Rate limited user ${userId}`);
        return false;
    }
    
    timestamps.push(now);
    rateLimitWindows.set(userId, timestamps);
    return true;
}

async function keepTyping(client: TelegramClient, chatId: bigInt.BigInteger, signal: { cancelled: boolean }) {
    while (!signal.cancelled) {
        try {
            await client.invoke(new (require("telegram").Api).messages.SetTyping({
                peer: chatId,
                action: new (require("telegram").Api).SendMessageTypingAction()
            }));
            await new Promise(resolve => setTimeout(resolve, 4000));
        } catch (e) {
            break;
        }
    }
}

async function replyAfterWait(userId: number, chatId: bigInt.BigInteger, client: TelegramClient) {
    const buffered = messageBuffers.get(userId) || [];
    if (buffered.length === 0) return;
    
    messageBuffers.set(userId, []);
    
    const combined = buffered.join("\n\n");
    Logger.info(`Processing ${buffered.length} buffered messages for user ${userId}`);
    
    const signal = { cancelled: false };
    keepTyping(client, chatId, signal);

    try {
        const messages = await buildHistory(userId);
        messages.push({ role: "user", content: combined });
        
        await repo.addMessage(userId, "user", combined);
        
        const reply = await aiProvider.chat(messages);
        
        await repo.addMessage(userId, "assistant", reply);
        
        await client.sendMessage(chatId, { message: reply });
        Logger.info(`OUT | user=${userId} | ${reply.substring(0, 200)}${reply.length > 200 ? '...' : ''}`);
    } catch (e) {
        Logger.error(`Error generating response for user ${userId}:`, e);
        await client.sendMessage(chatId, { message: "عذراً، حصل خطأ تقني. حاول مرة تانية بعد شوية 🙏" });
    } finally {
        signal.cancelled = true;
        pendingTasks.delete(userId);
    }
}

export async function runUserClient() {
    Logger.info("=".repeat(60));
    Logger.info("Starting user client (Telegram)...");
    Logger.info("=".repeat(60));

    const sessionDataDir = path.join(process.cwd(), "data");
    if (!fs.existsSync(sessionDataDir)) {
        fs.mkdirSync(sessionDataDir, { recursive: true });
    }
    
    const sessionPath = path.join(sessionDataDir, `${Settings.SESSION_NAME}.session`);
    let sessionString = "";
    if (fs.existsSync(sessionPath)) {
        sessionString = fs.readFileSync(sessionPath, "utf8");
    }

    const stringSession = new StringSession(sessionString);
    const client = new TelegramClient(stringSession, Settings.API_ID, Settings.API_HASH, {
        connectionRetries: 5,
    });

    await client.start({
        phoneNumber: async () => {
            const input = require("input");
            return await input.text("Please enter your number: ");
        },
        password: async () => {
            const input = require("input");
            return await input.text("Please enter your password: ");
        },
        phoneCode: async () => {
            const input = require("input");
            return await input.text("Please enter the code you received: ");
        },
        onError: (err) => console.log(err),
    });

    Logger.info("You should now be connected.");
    fs.writeFileSync(sessionPath, client.session.save() as unknown as string);
    
    client.addEventHandler(async (event: NewMessageEvent) => {
        const message = event.message;
        
        if (!message.isPrivate || message.out) return;
        
        const sender = await message.getSender();
        if (!sender) return;
        
        const userId = Number((sender as any).id);
        const userText = message.text?.trim() || "";
        
        if (!userText) return;
        
        await repo.upsertUser(userId, (sender as any).firstName || "", (sender as any).username || "");

        // Commands
        if (userText === "/start") {
            const welcome = "أهلاً وسهلاً بيك! 👋\n\n" +
                "أنا أحمد، مستشار تسويق رقمي متخصص في بناء الحضور الرقمي " +
                "للشركات السودانية.\n\n" +
                "كيف أقدر أساعدك اليوم؟";
            await client.sendMessage(message.chatId!, { message: welcome });
            return;
        } else if (userText === "/reset") {
            await repo.clearHistory(userId);
            messageBuffers.set(userId, []);
            if (pendingTasks.has(userId)) {
                clearTimeout(pendingTasks.get(userId));
                pendingTasks.delete(userId);
            }
            await client.sendMessage(message.chatId!, { message: "تم مسح المحادقة السابقة. نبدأ من جديد! 🔄" });
            return;
        } else if (userText === "/stats") {
            const userCount = await repo.getUserCount();
            const msgCount = await repo.getTotalMessages();
            const statsText = `📊 إحصائيات البوت:\n\n` +
                `👥 عدد المستخدمين: ${userCount}\n` +
                `💬 إجمالي الرسائل: ${msgCount}\n` +
                `🤖 مزود الذكاء: ${Settings.AI_PROVIDER}\n`;
            await client.sendMessage(message.chatId!, { message: statsText });
            return;
        }
        
        if (!rateLimitCheckUser(userId)) {
            await client.sendMessage(message.chatId!, { message: "بطيء شوية يا صديق، أنا بحاول أوصل لكل الناس 😅" });
            return;
        }
        
        const display = userText.length > 200 ? userText.substring(0, 200) + "..." : userText;
        Logger.info(`IN  | user=${userId} (@${(sender as any).username || "N/A"}) | ${display}`);

        const buffered = messageBuffers.get(userId) || [];
        buffered.push(userText);
        messageBuffers.set(userId, buffered);

        if (pendingTasks.has(userId)) {
            clearTimeout(pendingTasks.get(userId));
        }

        const timeout = setTimeout(() => {
            replyAfterWait(userId, message.chatId!, client);
        }, Settings.DEBOUNCE_SECONDS * 1000);

        pendingTasks.set(userId, timeout);
        
    }, new NewMessage({}));

    Logger.info("User client is running...");
}
