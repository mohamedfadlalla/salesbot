import { WASocket, WAMessage } from "@whiskeysockets/baileys";
import { ChatRepository } from "../storage/repository";
import { getProvider } from "../providers";
import { Logger } from "../utils/logger";
import { Settings } from "../config/settings";
import { SYSTEM_PROMPT } from "../config/system-prompt";
import { ChatMessage } from "../storage/models";
import { isAudioMessage, transcribeAudio } from "../utils/transcription";

const chatRepo = new ChatRepository();

export async function handleIncomingMessage(sock: WASocket, msg: WAMessage, sessionId: string) {
    try {
        if (!msg.message) return;

        const remoteJid = msg.key.remoteJid;
        if (!remoteJid || remoteJid === "status@broadcast") return;
        
        // Ignore messages sent by the bot itself
        if (msg.key.fromMe) return;

        const pushName = msg.pushName || "User";

        // Detect message type and extract text
        let text = "";

        // Handle audio messages — transcribe to text first
        if (isAudioMessage(msg)) {
            Logger.info(`[${sessionId}] Received audio message from ${remoteJid}, transcribing...`);

            // Mark as read early since audio processing takes time
            await sock.readMessages([msg.key]);
            await sock.sendPresenceUpdate('composing', remoteJid);

            try {
                text = await transcribeAudio(msg);
                Logger.info(`[${sessionId}] Transcription result: "${text}"`);
            } catch (transcribeError: any) {
                Logger.error(`[${sessionId}] Transcription failed: ${transcribeError.message}`);
                const fallbackMsg = "عذراً، لم أتمكن من فهم الرسالة الصوتية. ممكن تكتب الرسالة؟";
                await sock.sendPresenceUpdate('paused', remoteJid);
                await sock.sendMessage(remoteJid, { text: fallbackMsg }, { quoted: msg });
                return;
            }

            // If transcription returned unclear/empty, ask user to type
            if (!text || text === "[unclear]") {
                const unclearMsg = "عذراً، الصوت مش واضح كفاية. ممكن تعيد التسجيل أو تكتب الرسالة؟";
                await sock.sendPresenceUpdate('paused', remoteJid);
                await sock.sendMessage(remoteJid, { text: unclearMsg }, { quoted: msg });
                return;
            }
        } else {
            // Extract text from text messages
            const messageType = Object.keys(msg.message)[0];
            
            if (messageType === "conversation") {
                text = msg.message.conversation || "";
            } else if (messageType === "extendedTextMessage") {
                text = msg.message.extendedTextMessage?.text || "";
            }
            
            if (!text) return;
        }

        // Upsert user
        chatRepo.upsertUser(remoteJid, pushName, "");

        // Add user message to history (for audio, this is the transcribed text)
        chatRepo.addMessage(remoteJid, "user", text);

        // Fetch conversation history
        const history = chatRepo.getHistory(remoteJid, Settings.MAX_HISTORY_MESSAGES);

        // Prepare provider messages with system prompt prepended
        const messagesForProvider: ChatMessage[] = [
            { role: "system", content: SYSTEM_PROMPT },
            ...history.map(h => ({
                role: h.role as ChatMessage["role"],
                content: h.content
            }))
        ];

        Logger.info(`[${sessionId}] Received message from ${remoteJid}: ${text}`);

        // Mark as read (already marked for audio messages above)
        if (!isAudioMessage(msg)) {
            await sock.readMessages([msg.key]);
        }

        // Show typing indicator (already shown for audio messages above)
        if (!isAudioMessage(msg)) {
            await sock.sendPresenceUpdate('composing', remoteJid);
        }

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
