import * as fs from "fs";
import * as path from "path";
import { Settings } from "../config/settings";

export class Logger {
    private static getTimestamp(): string {
        return new Date().toISOString();
    }

    private static writeLog(level: string, message: string, ...args: any[]) {
        const timestamp = this.getTimestamp();
        let formattedArgs = args.length ? " " + args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(" ") : "";
        const logLine = `${timestamp} | ${level.padEnd(8)} | ${message}${formattedArgs}`;

        // Console output
        if (level === "ERROR") {
            console.error(logLine);
        } else if (level === "WARN") {
            console.warn(logLine);
        } else {
            console.log(logLine);
        }

        // File output
        try {
            const logPath = Settings.LOG_FILE;
            const logDir = path.dirname(logPath);
            if (!fs.existsSync(logDir)) {
                fs.mkdirSync(logDir, { recursive: true });
            }
            fs.appendFileSync(logPath, logLine + "\n", { encoding: "utf-8" });
        } catch (e) {
            console.error("Failed to write to log file", e);
        }
    }

    static info(message: string, ...args: any[]) {
        this.writeLog("INFO", message, ...args);
    }

    static error(message: string, ...args: any[]) {
        this.writeLog("ERROR", message, ...args);
    }

    static warn(message: string, ...args: any[]) {
        this.writeLog("WARN", message, ...args);
    }

    static debug(message: string, ...args: any[]) {
        if (Settings.LOG_LEVEL === "DEBUG") {
            this.writeLog("DEBUG", message, ...args);
        }
    }
}
