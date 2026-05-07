import { WASocket, WAMessage } from "@whiskeysockets/baileys";
import { ChatRepository } from "../storage/repository";
import { getProvider } from "../providers";
import { Logger } from "../utils/logger";
import { Settings } from "../config/settings";

const chatRepo = new ChatRepository();

export async function handleIncomingMessage(sock: WASocket, msg: WAMessage, sessionId: string) {
    try {
        if (!msg.message) return;

        // Extract message content
        const messageType = Object.keys(msg.message)[0];
        let text = "";
        
        if (messageType === "conversation") {
            text = msg.message.conversation || "";
        } else if (messageType === "extendedTextMessage") {
            text = msg.message.extendedTextMessage?.text || "";
        }
        
        if (!text) return;

        const remoteJid = msg.key.remoteJid;
        if (!remoteJid || remoteJid === "status@broadcast") return;
        
        // Ignore messages sent by the bot itself
        if (msg.key.fromMe) return;

        const pushName = msg.pushName || "User";

        // Upsert user
        chatRepo.upsertUser(remoteJid, pushName, "");

        // Add user message to history
        chatRepo.addMessage(remoteJid, "user", text);

        // Fetch conversation history
        const history = chatRepo.getHistory(remoteJid, Settings.MAX_HISTORY_MESSAGES);

        // Prepare provider messages
        const messagesForProvider = history.map(h => ({
            role: h.role,
            content: h.content
        }));

        Logger.info(`[${sessionId}] Received message from ${remoteJid}: ${text}`);

        // Mark as read
        await sock.readMessages([msg.key]);

        // Show typing indicator
        await sock.sendPresenceUpdate('composing', remoteJid);

        const provider = getProvider();
        let aiResponse = "";
        
        try {
            aiResponse = await provider.chat(messagesForProvider);
        } catch (error: any) {
            Logger.error(`[${sessionId}] AI Provider Error: ${error.message}`);
            aiResponse = "Sorry, I am having trouble processing your request right now. Please try again later.";
        }

        // Add assistant message to history
        chatRepo.addMessage(remoteJid, "assistant", aiResponse);

        // Send reply
        await sock.sendPresenceUpdate('paused', remoteJid);
        await sock.sendMessage(remoteJid, { text: aiResponse }, { quoted: msg });

    } catch (error) {
        Logger.error(`[${sessionId}] Error handling message: ${error}`);
    }
}
