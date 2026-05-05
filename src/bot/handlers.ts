import { Telegraf, Context } from "telegraf";
import { message } from "telegraf/filters";
import { Settings } from "../config/settings";
import { getProvider } from "../providers";
import { ChatRepository } from "../storage/repository";
import { SYSTEM_MESSAGE } from "./system_message";
import { rateLimitCheck, logIncoming, logOutgoing } from "./middleware";
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

async function replyAfterWait(userId: number, chatId: number, ctx: Context) {
    const buffered = messageBuffers.get(userId) || [];
    if (buffered.length === 0) return;
    
    messageBuffers.set(userId, []);
    
    const combined = buffered.join("\n\n");
    Logger.info(`Processing ${buffered.length} buffered messages for user ${userId}`);

    try {
        await ctx.telegram.sendChatAction(chatId, "typing");
        
        const messages = await buildHistory(userId);
        messages.push({ role: "user", content: combined });
        
        await repo.addMessage(userId, "user", combined);
        
        const reply = await aiProvider.chat(messages);
        
        await repo.addMessage(userId, "assistant", reply);
        
        await ctx.telegram.sendMessage(chatId, reply);
        await logOutgoing(userId, reply);
    } catch (e) {
        Logger.error(`Error generating response for user ${userId}:`, e);
        await ctx.telegram.sendMessage(
            chatId,
            "عذراً، حصل خطأ تقني. حاول مرة تانية بعد شوية 🙏"
        );
    } finally {
        pendingTasks.delete(userId);
    }
}

export function registerHandlers(bot: Telegraf) {
    bot.start(async (ctx) => {
        if (!ctx.from) return;
        const user = ctx.from;
        
        await repo.upsertUser(user.id, user.first_name || "", user.username || "");
        Logger.info(`New user started: ${user.id} (@${user.username || "N/A"})`);
        
        const welcome = "أهلاً وسهلاً بيك! 👋\n\n" +
            "أنا أحمد، مستشار تسويق رقمي متخصص في بناء الحضور الرقمي " +
            "للشركات السودانية.\n\n" +
            "كيف أقدر أساعدك اليوم؟";
            
        await ctx.reply(welcome);
        await logOutgoing(user.id, welcome);
    });

    bot.command("reset", async (ctx) => {
        if (!ctx.from) return;
        const userId = ctx.from.id;
        
        await repo.clearHistory(userId);
        messageBuffers.set(userId, []);
        
        if (pendingTasks.has(userId)) {
            clearTimeout(pendingTasks.get(userId));
            pendingTasks.delete(userId);
        }
        
        const msg = "تم مسح المحادقة السابقة. نبدأ من جديد! 🔄";
        await ctx.reply(msg);
        Logger.info(`User ${userId} reset their history`);
    });

    bot.command("stats", async (ctx) => {
        const userCount = await repo.getUserCount();
        const msgCount = await repo.getTotalMessages();
        
        const statsText = `📊 إحصائيات البوت:\n\n` +
            `👥 عدد المستخدمين: ${userCount}\n` +
            `💬 إجمالي الرسائل: ${msgCount}\n` +
            `🤖 مزود الذكاء: ${Settings.AI_PROVIDER}\n`;
            
        await ctx.reply(statsText);
    });

    bot.on(message("text"), async (ctx) => {
        if (!ctx.from || !ctx.message) return;
        
        const user = ctx.from;
        const userText = ctx.message.text.trim();
        if (!userText) return;
        
        await repo.upsertUser(user.id, user.first_name || "", user.username || "");
        
        if (!(await rateLimitCheck(ctx))) {
            await ctx.reply("بطيء شوية يا صديق، أنا بحاول أوصل لكل الناس 😅");
            return;
        }
        
        await logIncoming(ctx);
        
        const buffered = messageBuffers.get(user.id) || [];
        buffered.push(userText);
        messageBuffers.set(user.id, buffered);
        
        if (pendingTasks.has(user.id)) {
            clearTimeout(pendingTasks.get(user.id));
        }
        
        const timeout = setTimeout(() => {
            replyAfterWait(user.id, ctx.chat.id, ctx);
        }, Settings.DEBOUNCE_SECONDS * 1000);
        
        pendingTasks.set(user.id, timeout);
    });
    
    Logger.info("All handlers registered");
}
