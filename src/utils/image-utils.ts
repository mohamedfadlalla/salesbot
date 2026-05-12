import * as fs from "fs";
import * as path from "path";
import { pipeline } from "stream/promises";
import { createWriteStream } from "fs";
import { downloadContentFromMessage, WAMessage } from "@whiskeysockets/baileys";
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
 * Generate a unique temp filename for an image file.
 */
function tempImagePath(extension: string = "jpg"): string {
    ensureTmpDir();
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return path.join(TMP_DIR, `image-${timestamp}-${random}.${extension}`);
}

/**
 * Detect if a WAMessage contains an image message.
 */
export function isImageMessage(msg: WAMessage): boolean {
    if (!msg.message) return false;
    return !!msg.message.imageMessage;
}

/**
 * Map common WhatsApp image MIME types to file extensions.
 */
const MIME_TO_EXT: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
};

function mimeToExtension(mime: string | null | undefined): string {
    if (!mime) return "jpg"; // fallback
    const normalized = mime.toLowerCase().trim();
    return MIME_TO_EXT[normalized] || "jpg";
}

/**
 * Download an image from a WhatsApp message and return the image buffer.
 * Cleans up the temp file after reading into memory.
 *
 * @param msg The WhatsApp message containing an image
 * @returns Object with the image buffer and MIME type
 */
export async function downloadImage(msg: WAMessage): Promise<{ buffer: Buffer; mimeType: string }> {
    const imageMsg = msg.message?.imageMessage;
    if (!imageMsg) {
        throw new Error("No image message found in WAMessage");
    }

    const mimeType = imageMsg.mimetype || "image/jpeg";
    const ext = mimeToExtension(mimeType);
    Logger.debug(`Image message MIME type: "${mimeType}", using extension: .${ext}`);

    const imagePath = tempImagePath(ext);

    try {
        const stream = await downloadContentFromMessage(imageMsg, "image");
        await pipeline(stream, createWriteStream(imagePath));

        const stat = fs.statSync(imagePath);
        Logger.debug(`Image downloaded to ${imagePath} (${stat.size} bytes)`);

        // Read into buffer
        const buffer = fs.readFileSync(imagePath);

        return { buffer, mimeType };
    } finally {
        // Clean up the temp file
        if (fs.existsSync(imagePath)) {
            try {
                fs.unlinkSync(imagePath);
                Logger.debug(`Cleaned up temp image file: ${imagePath}`);
            } catch (e) {
                Logger.warn(`Failed to clean up temp image file: ${imagePath}`);
            }
        }
    }
}