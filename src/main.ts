import { Telegraf } from "telegraf";
import { Settings } from "./config/settings";
import { initDb } from "./storage/database";
import { getProvider } from "./providers";
import { Logger } from "./utils/logger";
import { registerHandlers } from "./bot/handlers";
import { runUserClient } from "./bot/user_client";

async function healthCheck() {
    const errors: string[] = [];

    try {
        Settings.validate();
        console.log("✅ Config: OK");
    } catch (e: any) {
        errors.push(`Config: ${e.message}`);
        console.log(`❌ Config: ${e.message}`);
    }

    try {
        await initDb();
        console.log("✅ Database: OK");
    } catch (e: any) {
        errors.push(`Database: ${e.message}`);
        console.log(`❌ Database: ${e.message}`);
    }

    try {
        const provider = getProvider();
        if (await provider.healthCheck()) {
            console.log(`✅ AI Provider (${Settings.AI_PROVIDER}): OK`);
        } else {
            errors.push(`AI Provider (${Settings.AI_PROVIDER}): health check failed`);
            console.log(`❌ AI Provider (${Settings.AI_PROVIDER}): health check failed`);
        }
    } catch (e: any) {
        errors.push(`AI Provider: ${e.message}`);
        console.log(`❌ AI Provider: ${e.message}`);
    }

    if (errors.length > 0) {
        console.log(`\n${errors.length} check(s) failed.`);
        process.exit(1);
    } else {
        console.log("\nAll checks passed.");
        process.exit(0);
    }
}

async function runBotMode() {
    Logger.info("=".repeat(60));
    Logger.info("Starting bot (mode=bot)...");
    Logger.info("=".repeat(60));

    Settings.validate();
    await initDb();
    
    const provider = getProvider();
    if (!(await provider.healthCheck())) {
        Logger.error("AI provider health check failed on startup");
        process.exit(1);
    }
    Logger.info(`AI provider (${Settings.AI_PROVIDER}) is healthy`);

    const bot = new Telegraf(Settings.BOT_TOKEN);
    registerHandlers(bot);

    process.once('SIGINT', () => {
        Logger.info("Received signal SIGINT, shutting down...");
        bot.stop('SIGINT');
    });
    process.once('SIGTERM', () => {
        Logger.info("Received signal SIGTERM, shutting down...");
        bot.stop('SIGTERM');
    });

    Logger.info("Bot is running — polling for updates...");
    bot.launch();
}

async function main() {
    const args = process.argv.slice(2);
    if (args.includes("--health")) {
        await healthCheck();
    } else if (Settings.TELEGRAM_MODE === "user") {
        Settings.validate();
        await initDb();
        
        const provider = getProvider();
        if (!(await provider.healthCheck())) {
            Logger.error("AI provider health check failed on startup");
            process.exit(1);
        }
        Logger.info(`AI provider (${Settings.AI_PROVIDER}) is healthy`);
        
        await runUserClient();
    } else {
        await runBotMode();
    }
}

if (require.main === module) {
    main().catch(e => {
        console.error(e);
        process.exit(1);
    });
}
