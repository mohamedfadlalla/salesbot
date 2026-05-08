import * as fs from "fs";
import * as path from "path";
import { pipeline } from "stream/promises";
import { createWriteStream } from "fs";
import axios from "axios";
import { downloadContentFromMessage, WAMessage } from "@whiskeysockets/baileys";
import { Settings } from "../config/settings";
import { TRANSCRIPTION_PROMPT } from "../config/transcription-prompt";
import { Logger } from "./logger";

const TMP_DIR = path.resolve(__dirname, "../../tmp");

/**
 * Ensure the tmp directory exists.
 */
function ensureTmpDir(): void {
    if (!fs.existsSync(TMP_DIR)) {
        fs.mkdirSync(TMP_DIR, { recursive: true });
    }
}

/**
 * Generate a unique temp filename for an audio file.
 */
function tempAudioPath(extension: string = "ogg"): string {
    ensureTmpDir();
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return path.join(TMP_DIR, `audio-${timestamp}-${random}.${extension}`);
}

/**
 * Detect if a WAMessage contains an audio/voice message.
 */
export function isAudioMessage(msg: WAMessage): boolean {
    if (!msg.message) return false;
    return !!msg.message.audioMessage;
}

/**
 * Download audio from a WhatsApp message and save it to a temporary file.
 * Returns the path to the downloaded audio file.
 * 
 * downloadContentFromMessage is async and returns a Node.js Readable (Transform) stream.
 * We use stream.pipeline to pipe it directly to a file — the most robust approach.
 */
async function downloadAudio(msg: WAMessage): Promise<string> {
    const audioMsg = msg.message?.audioMessage;
    if (!audioMsg) {
        throw new Error("No audio message found in WAMessage");
    }

    const mimetype = audioMsg.mimetype || "audio/ogg";
    const extension = mimetype.split("/").pop() || "ogg";
    const audioPath = tempAudioPath(extension);

    // downloadContentFromMessage is async, returns a Promise<Stream>
    const stream = await downloadContentFromMessage(audioMsg, "audio");
    
    // Pipe stream directly to file using pipeline (handles errors & cleanup automatically)
    await pipeline(stream, createWriteStream(audioPath));

    const stat = fs.statSync(audioPath);
    Logger.debug(`Audio downloaded to ${audioPath} (${stat.size} bytes)`);
    return audioPath;
}

/**
 * Read an audio file and return its base64-encoded data URI.
 */
function encodeAudioAsDataUri(audioPath: string): string {
    const audioBuffer = fs.readFileSync(audioPath);
    const extension = path.extname(audioPath).replace(".", "");
    const mimeType = `audio/${extension}`;
    const base64 = audioBuffer.toString("base64");
    return `data:${mimeType};base64,${base64}`;
}

/**
 * Transcribe an audio WhatsApp message to text using the LLM provider.
 * 
 * This uses a stateless approach — no chat history, only the transcription
 * system prompt + audio data sent to the LLM.
 * 
 * @param msg The WhatsApp message containing audio
 * @returns The transcribed text
 */
export async function transcribeAudio(msg: WAMessage): Promise<string> {
    let audioPath: string | null = null;

    try {
        Logger.info("Downloading audio from WhatsApp message...");
        audioPath = await downloadAudio(msg);

        Logger.info("Encoding audio as base64 data URI...");
        const audioDataUri = encodeAudioAsDataUri(audioPath);

        Logger.info("Sending audio to LLM for transcription...");
        const transcribedText = await callTranscriptionLlm(audioDataUri);

        Logger.info(`Transcription result: "${transcribedText}"`);
        return transcribedText;

    } catch (error: any) {
        Logger.error(`Transcription failed: ${error.message}`);
        throw error;
    } finally {
        // Clean up the temp file
        if (audioPath && fs.existsSync(audioPath)) {
            try {
                fs.unlinkSync(audioPath);
                Logger.debug(`Cleaned up temp audio file: ${audioPath}`);
            } catch (e) {
                Logger.warn(`Failed to clean up temp file: ${audioPath}`);
            }
        }
    }
}

/**
 * Call the LLM (via Ollama API directly) for transcription.
 * This is a separate, stateless call — no chat history, only the audio + instruction.
 * 
 * For multimodal audio support, the audio is passed as a data URI string in the 
 * user message content.
 */
async function callTranscriptionLlm(audioDataUri: string): Promise<string> {
    const host = Settings.OLLAMA_HOST;
    const model = Settings.OLLAMA_MODEL;
    const headers = {
        "Authorization": `Bearer ${Settings.OLLAMA_API_KEY}`,
        "Content-Type": "application/json"
    };

    const payload = {
        model: model,
        messages: [
            {
                role: "system",
                content: TRANSCRIPTION_PROMPT
            },
            {
                role: "user",
                content: `Transcribe this audio to text:\n${audioDataUri}`
            }
        ],
        stream: false
    };

    Logger.debug(`Sending transcription request to ${host}/api/chat with model ${model}`);

    const response = await axios.post(`${host}/api/chat`, payload, {
        headers,
        timeout: 120000 // 2-minute timeout for audio processing
    });

    const transcribedText = response.data.message.content.trim();
    return transcribedText;
}