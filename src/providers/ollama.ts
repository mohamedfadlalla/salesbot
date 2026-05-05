import axios from "axios";
import { AIProvider } from "./base";
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
