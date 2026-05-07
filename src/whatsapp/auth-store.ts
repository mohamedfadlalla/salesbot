import { initAuthCreds, BufferJSON, AuthenticationState, SignalDataTypeMap } from "@whiskeysockets/baileys";
import { getConnection } from "../storage/database";

export const useSqliteAuthState = async (sessionId: string): Promise<{ state: AuthenticationState, saveCreds: () => void }> => {
    const db = getConnection();

    const readData = (id: string) => {
        try {
            const row = db.prepare("SELECT session_data FROM whatsapp_sessions WHERE id = ?").get(id) as { session_data: string } | undefined;
            if (row && row.session_data) {
                return JSON.parse(row.session_data, BufferJSON.reviver);
            }
        } catch (e) {
            console.error("Error reading auth state", e);
        }
        return null;
    };

    const writeData = (id: string, data: any) => {
        try {
            const str = JSON.stringify(data, BufferJSON.replacer);
            db.prepare(`
                INSERT INTO whatsapp_sessions (id, session_data) 
                VALUES (?, ?)
                ON CONFLICT(id) DO UPDATE SET 
                    session_data = excluded.session_data,
                    updated_at = CURRENT_TIMESTAMP
            `).run(id, str);
        } catch (e) {
            console.error("Error writing auth state", e);
        }
    };

    const removeData = (id: string) => {
        try {
            db.prepare("DELETE FROM whatsapp_sessions WHERE id = ?").run(id);
        } catch (e) {
            console.error("Error removing auth state", e);
        }
    };

    const credsKey = `${sessionId}:creds`;
    
    let creds = readData(credsKey);
    if (!creds) {
        creds = initAuthCreds();
        writeData(credsKey, creds);
    }

    return {
        state: {
            creds,
            keys: {
                get: (type: keyof SignalDataTypeMap, ids: string[]) => {
                    const data: { [id: string]: any } = {};
                    for (const id of ids) {
                        const key = `${sessionId}:${type}:${id}`;
                        const val = readData(key);
                        if (val) {
                            data[id] = val;
                        }
                    }
                    return data;
                },
                set: (data: any) => {
                    for (const category in data) {
                        for (const id in data[category]) {
                            const val = data[category][id];
                            const key = `${sessionId}:${category}:${id}`;
                            if (val) {
                                writeData(key, val);
                            } else {
                                removeData(key);
                            }
                        }
                    }
                }
            }
        },
        saveCreds: () => {
            writeData(credsKey, creds);
        }
    };
};
