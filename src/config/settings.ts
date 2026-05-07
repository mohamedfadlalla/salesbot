import * as os from "os";
import * as path from "path";
import * as dotenv from "dotenv";

// Load .env from project root
const PROJECT_ROOT = path.resolve(__dirname, "../../");
dotenv.config({ path: path.join(PROJECT_ROOT, ".env") });

export class Settings {
    // --- AI Provider ---
    static AI_PROVIDER = process.env.AI_PROVIDER || "ollama";

    // Ollama
    static OLLAMA_HOST = process.env.OLLAMA_HOST || "https://ollama.com";
    static OLLAMA_API_KEY = process.env.OLLAMA_API_KEY || "";
    static OLLAMA_MODEL = process.env.OLLAMA_MODEL || "gemma3:27b";

    // OpenRouter
    static OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
    static OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "google/gemini-2.0-flash-001";

    // Gemini
    static GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
    static GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";

    // --- Bot Behavior ---
    static DEBOUNCE_SECONDS = parseFloat(process.env.DEBOUNCE_SECONDS || "3.0");
    static MAX_HISTORY_MESSAGES = parseInt(process.env.MAX_HISTORY_MESSAGES || "20", 10);

    // --- Paths ---
    static DATABASE_PATH = process.env.DATABASE_PATH || "data/whatsapp.db";
    static LOG_LEVEL = process.env.LOG_LEVEL || "INFO";
    static LOG_FILE = process.env.LOG_FILE || "logs/bot.log";

    static validate() {
        const errors: string[] = [];

        if (this.AI_PROVIDER === "ollama" && !this.OLLAMA_API_KEY) {
            errors.push("OLLAMA_API_KEY is required when AI_PROVIDER=ollama");
        }
        if (this.AI_PROVIDER === "openrouter" && !this.OPENROUTER_API_KEY) {
            errors.push("OPENROUTER_API_KEY is required when AI_PROVIDER=openrouter");
        }
        if (this.AI_PROVIDER === "gemini" && !this.GEMINI_API_KEY) {
            errors.push("GEMINI_API_KEY is required when AI_PROVIDER=gemini");
        }
        if (errors.length > 0) {
            throw new Error("Configuration errors:\n  - " + errors.join("\n  - "));
        }
    }
}
