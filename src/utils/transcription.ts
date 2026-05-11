import * as fs from "fs";
import * as path from "path";
import { pipeline } from "stream/promises";
import { createWriteStream } from "fs";
import Groq from "groq-sdk";
import { downloadContentFromMessage, WAMessage } from "@whiskeysockets/baileys";
import { Settings } from "../config/settings";
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
    const extension = mimetype.split("/")[1]?.split(";")[0]?.trim() || "ogg";
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
 * Transcribe an audio WhatsApp message to text using the Groq API.
 * 
 * @param msg The WhatsApp message containing audio
 * @returns The transcribed text
 */
export async function transcribeAudio(msg: WAMessage): Promise<string> {
    let audioPath: string | null = null;

    try {
        Logger.info("Downloading audio from WhatsApp message...");
        audioPath = await downloadAudio(msg);

        Logger.info("Sending audio to Groq for transcription...");
        const transcribedText = await transcribeWithGroq(audioPath);

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
 * Transcribe an audio file using Groq's Whisper API.
 * Uses `groq-sdk` directly with a file stream.
 */
async function transcribeWithGroq(audioPath: string): Promise<string> {
    const groq = new Groq({ apiKey: Settings.GROQ_API_KEY });

    Logger.debug(`Sending transcription request to Groq with model ${Settings.GROQ_MODEL}`);

    const transcription = await groq.audio.transcriptions.create({
        file: fs.createReadStream(audioPath),
        model: Settings.GROQ_MODEL,
        language: "ar",
        temperature: 0,
        response_format: "verbose_json",
    });

    return transcription.text;
}