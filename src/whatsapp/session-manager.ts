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

    async startSession(sessionId: string) {
        if (this.sessions.has(sessionId)) {
            Logger.info(`Session ${sessionId} is already running.`);
            return;
        }

        Logger.info(`Starting session: ${sessionId}`);

        const { state, saveCreds } = await useSqliteAuthState(sessionId);
        const { version, isLatest } = await fetchLatestBaileysVersion();
        
        Logger.info(`Using WA v${version.join('.')}, isLatest: ${isLatest}`);

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
                const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
                Logger.info(`[${sessionId}] Connection closed due to: ${(lastDisconnect?.error as Error)?.message}, reconnecting: ${shouldReconnect}`);
                
                this.sessions.delete(sessionId);
                
                if (shouldReconnect) {
                    setTimeout(() => this.startSession(sessionId), 5000);
                } else {
                    Logger.info(`[${sessionId}] Logged out. Delete session from DB to restart.`);
                }
            } else if (connection === "open") {
                Logger.info(`[${sessionId}] Connection opened successfully.`);
            }
        });

        sock.ev.on("creds.update", saveCreds);

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
