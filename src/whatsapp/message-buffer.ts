import { WASocket, WAMessage } from "@whiskeysockets/baileys";

const DEBOUNCE_DELAY_MS = 5000; // 5 seconds

interface BufferEntry {
    timer: NodeJS.Timeout;
    texts: string[];
    lastMsg: WAMessage;
    sock: WASocket;
}

type OnCompleteCallback = (
    remoteJid: string,
    combinedText: string,
    lastMsg: WAMessage,
    sock: WASocket
) => Promise<void>;

class MessageBuffer {
    private buffers: Map<string, BufferEntry> = new Map();

    /**
     * Push a message text into the user's buffer.
     * Resets the 5-second debounce timer every time a new message arrives.
     * When the timer expires, the onComplete callback is invoked with
     * all accumulated texts joined together.
     */
    push(
        remoteJid: string,
        text: string,
        msg: WAMessage,
        sock: WASocket,
        onComplete: OnCompleteCallback
    ): void {
        const existing = this.buffers.get(remoteJid);

        if (existing) {
            // Clear existing timer — user sent another message before it fired
            clearTimeout(existing.timer);
            existing.texts.push(text);
            existing.lastMsg = msg;
            existing.timer = setTimeout(
                () => this.flush(remoteJid, onComplete),
                DEBOUNCE_DELAY_MS
            );
        } else {
            // First message from this user — start a new buffer
            const timer = setTimeout(
                () => this.flush(remoteJid, onComplete),
                DEBOUNCE_DELAY_MS
            );
            this.buffers.set(remoteJid, {
                timer,
                texts: [text],
                lastMsg: msg,
                sock,
            });
        }
    }

    /**
     * Flush the buffer for a user: call the completion callback with
     * the combined message, then clean up.
     */
    private async flush(
        remoteJid: string,
        onComplete: OnCompleteCallback
    ): Promise<void> {
        const entry = this.buffers.get(remoteJid);
        if (!entry) return;

        // Remove from map immediately so new messages start fresh
        this.buffers.delete(remoteJid);

        const combinedText = entry.texts.join("\n\n---\n\n");

        try {
            await onComplete(remoteJid, combinedText, entry.lastMsg, entry.sock);
        } catch (err) {
            console.error(`[MessageBuffer] Error flushing buffer for ${remoteJid}:`, err);
        }
    }

    /**
     * Check if a user currently has buffered messages waiting.
     */
    hasPending(remoteJid: string): boolean {
        return this.buffers.has(remoteJid);
    }

    /**
     * Get the number of buffered texts for a user (0 if none).
     */
    pendingCount(remoteJid: string): number {
        const entry = this.buffers.get(remoteJid);
        return entry ? entry.texts.length : 0;
    }
}

export const messageBuffer = new MessageBuffer();