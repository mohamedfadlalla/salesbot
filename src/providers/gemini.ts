import { GoogleGenerativeAI, Content } from "@google/generative-ai";
import { AIProvider } from "./base";
import { Settings } from "../config/settings";
import { ChatMessage } from "../storage/models";

export class GeminiProvider implements AIProvider {
    private genai: GoogleGenerativeAI;
    private model: any;

    constructor() {
        this.genai = new GoogleGenerativeAI(Settings.GEMINI_API_KEY);
        this.model = this.genai.getGenerativeModel({ model: Settings.GEMINI_MODEL });
        console.log(`GeminiProvider initialized (model=${Settings.GEMINI_MODEL})`);
    }

    async chat(messages: ChatMessage[]): Promise<string> {
        const geminiMessages: Content[] = [];
        let systemContent = "";
        
        for (const msg of messages) {
            if (msg.role === "system") {
                systemContent = msg.content;
            } else if (msg.role === "assistant") {
                geminiMessages.push({ role: "model", parts: [{ text: msg.content }] });
            } else {
                geminiMessages.push({ role: "user", parts: [{ text: msg.content }] });
            }
        }

        // Reinitialize model if there's a system instruction
        if (systemContent) {
            this.model = this.genai.getGenerativeModel({ 
                model: Settings.GEMINI_MODEL,
                systemInstruction: systemContent
            });
        }

        let history: Content[] = [];
        if (geminiMessages.length > 1) {
            history = geminiMessages.slice(0, -1);
        }

        const chat = this.model.startChat({ history });
        const lastMsg = geminiMessages[geminiMessages.length - 1];
        
        const response = await chat.sendMessage(lastMsg.parts[0].text);
        return response.response.text();
    }

    async healthCheck(): Promise<boolean> {
        try {
            await this.model.generateContent({
                contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
                generationConfig: { maxOutputTokens: 5 }
            });
            return true;
        } catch (e) {
            console.error("Gemini health check failed:", e);
            return false;
        }
    }
}
