import { ChatMessage } from "../storage/models";

export interface AIProvider {
    /**
     * Send a list of messages and return the assistant's reply.
     * @param messages List of chat messages
     * @returns The assistant's response text
     */
    chat(messages: ChatMessage[]): Promise<string>;

    /**
     * Return True if the provider is reachable and functional.
     */
    healthCheck(): Promise<boolean>;
}
