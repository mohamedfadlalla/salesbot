import axios from "axios";
import { AIProvider, ImageDescription } from "./base";
import { Settings } from "../config/settings";
import { ChatMessage, toDict } from "../storage/models";

export class OllamaProvider implements AIProvider {
    private host: string;
    private model: string;
    private headers: Record<string, string>;

    constructor() {
        this.host = Settings.OLLAMA_HOST;
        this.model = Settings.OLLAMA_MODEL;
        this.headers = {
            "Authorization": `Bearer ${Settings.OLLAMA_API_KEY}`,
            "Content-Type": "application/json"
        };
        console.log(`OllamaProvider initialized (host=${this.host}, model=${this.model})`);
    }

    async chat(messages: ChatMessage[]): Promise<string> {
        const payload = {
            model: this.model,
            messages: messages.map(toDict),
            stream: false
        };

        const response = await axios.post(`${this.host}/api/chat`, payload, {
            headers: this.headers
        });

        return response.data.message.content;
    }

    async describeImage(imageBuffer: Buffer, mimeType: string): Promise<ImageDescription> {
        // Convert the image buffer to base64
        const base64Image = imageBuffer.toString("base64");

        // The data URI format for the image
        const dataUri = `data:${mimeType};base64,${base64Image}`;

        // Prompt specifically for image description and bank transaction detection
        const prompt = `You are an image analysis assistant. Analyze this image carefully.

Describe what you see in this image in detail. If this image shows a bank transaction receipt, bank transfer confirmation, money transfer slip, or any financial transaction proof, you MUST start your response with exactly "BANK_TRANSACTION:" followed by the description.

If it is NOT a bank transaction or financial receipt, just provide a clear description of what the image contains.

Be concise but thorough in your description.`;

        const payload = {
            model: this.model,
            messages: [
                {
                    role: "user",
                    content: prompt,
                    images: [dataUri]
                }
            ],
            stream: false
        };

        const response = await axios.post(`${this.host}/api/chat`, payload, {
            headers: this.headers
        });

        const content = response.data.message.content;
        const isBankTransaction = content.startsWith("BANK_TRANSACTION:");

        // Clean the description by removing the BANK_TRANSACTION prefix if present
        const description = isBankTransaction
            ? content.replace("BANK_TRANSACTION:", "").trim()
            : content.trim();

        return {
            description,
            isBankTransaction
        };
    }

    async healthCheck(): Promise<boolean> {
        try {
            await axios.get(`${this.host}/api/tags`, { headers: this.headers });
            return true;
        } catch (e) {
            console.error("Ollama health check failed:", e);
            return false;
        }
    }
}