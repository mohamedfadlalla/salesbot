import axios from "axios";
import { AIProvider } from "./base";
import { Settings } from "../config/settings";
import { ChatMessage, toDict } from "../storage/models";

export class OpenRouterProvider implements AIProvider {
    private apiKey: string;
    private model: string;
    private baseUrl = "https://openrouter.ai/api/v1/chat/completions";

    constructor() {
        this.apiKey = Settings.OPENROUTER_API_KEY;
        this.model = Settings.OPENROUTER_MODEL;
        console.log(`OpenRouterProvider initialized (model=${this.model})`);
    }

    async chat(messages: ChatMessage[]): Promise<string> {
        const payload = {
            model: this.model,
            messages: messages.map(toDict)
        };

        const response = await axios.post(this.baseUrl, payload, {
            headers: {
                "Authorization": `Bearer ${this.apiKey}`,
                "Content-Type": "application/json"
            },
            timeout: 60000
        });

        return response.data.choices[0].message.content;
    }

    async healthCheck(): Promise<boolean> {
        try {
            const payload = {
                model: this.model,
                messages: [{ role: "user", content: "ping" }],
                max_tokens: 5
            };
            
            const response = await axios.post(this.baseUrl, payload, {
                headers: {
                    "Authorization": `Bearer ${this.apiKey}`,
                    "Content-Type": "application/json"
                },
                timeout: 10000
            });
            
            return response.status === 200;
        } catch (e) {
            console.error("OpenRouter health check failed:", e);
            return false;
        }
    }
}
