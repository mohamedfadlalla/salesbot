import makeWASocket, { DisconnectReason, WASocket, fetchLatestBaileysVersion, Browsers } from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import * as qrcode from "qrcode-terminal";
import { Logger } from "../utils/logger";
import { useSqliteAuthState } from "./auth-store";
import { handleIncomingMessage } from "./handlers";
import pino from "pino";

class SessionManager {
    private sessions: Map<string, WASocket> = new Map();
    private logger = pino({ level: "silent" });
    private reconnectAttempts: Map<string, number> = new Map();
    private maxReconnectAttempts = 5;

    async startSession(sessionId: string) {
        if (this.sessions.has(sessionId)) {
            Logger.info(`Session ${sessionId} is already running.`);
            return;
        }

        Logger.info(`Starting session: ${sessionId}`);

        const { state, saveCreds, getWriteErrorCount } = await useSqliteAuthState(sessionId);
        const { version, isLatest } = await fetchLatestBaileysVersion();
        
        Logger.info(`Using WA v${version.join('.')}, isLatest: ${isLatest}`);

        // If there were previous write failures, stop reconnecting
        if (getWriteErrorCount() > 0) {
            Logger.info(`[${sessionId}] Detected ${getWriteErrorCount()} prior auth write failures.`);
        }

        const sock = makeWASocket({
            version,
            auth: state,
            printQRInTerminal: false,
            logger: this.logger as any,
            browser: Browsers.ubuntu('Chrome'),
            generateHighQualityLinkPreview: true,
        });

        this.sessions.set(sessionId, sock);

        sock.ev.on("connection.update", async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                Logger.info(`[${sessionId}] QR Code generated, please scan:`);
                qrcode.generate(qr, { small: true });
            }

            if (connection === "close") {
                const errorMessage = (lastDisconnect?.error as Error)?.message || "";
                const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
                Logger.info(`[${sessionId}] Connection closed due to: ${errorMessage}, reconnecting: ${shouldReconnect}`);
                
                this.sessions.delete(sessionId);
                
                if (!shouldReconnect) {
                    Logger.info(`[${sessionId}] Logged out. Delete session from DB to restart.`);
                    return;
                }

                // Check if auth write keeps failing — if so, break the loop
                const errCount = getWriteErrorCount();
                if (errCount >= 3) {
                    Logger.error(`[${sessionId}] Auth state write failed ${errCount} times. Database is likely read-only.`);
                    Logger.error(`[${sessionId}] To fix, run on the server:`);
                    Logger.error(`  chown -R $(whoami) /home/ubuntu/salesbot/data/`);
                    Logger.error(`  chmod -R 755 /home/ubuntu/salesbot/data/`);
                    Logger.error(`[${sessionId}] After fixing permissions, restart the bot. Stopping reconnection.`);
                    return;
                }

                // Track reconnect attempts for non-auth-related disconnects
                const attempts = (this.reconnectAttempts.get(sessionId) || 0) + 1;
                this.reconnectAttempts.set(sessionId, attempts);

                if (attempts > this.maxReconnectAttempts) {
                    Logger.error(`[${sessionId}] Reconnect attempts exceeded ${this.maxReconnectAttempts}. Giving up.`);
                    this.reconnectAttempts.delete(sessionId);
                    return;
                }

                setTimeout(() => this.startSession(sessionId), 5000);
            } else if (connection === "open") {
                Logger.info(`[${sessionId}] Connection opened successfully.`);
                // Reset reconnect counter on successful connection
                this.reconnectAttempts.delete(sessionId);
            }
        });

        // Wrap saveCreds listener to catch errors and track write failures
        sock.ev.on("creds.update", async () => {
            try {
                saveCreds();
            } catch (e: any) {
                Logger.error(`[${sessionId}] Failed to save auth credentials: ${e.message}`);
            }
        });

        sock.ev.on("messages.upsert", async (m) => {
            if (m.type === "notify") {
                for (const msg of m.messages) {
                    await handleIncomingMessage(sock, msg, sessionId);
                }
            }
        });
    }

    getSession(sessionId: string) {
        return this.sessions.get(sessionId);
    }
}

export const sessionManager = new SessionManager();
