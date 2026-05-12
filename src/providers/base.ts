import { ChatMessage } from "../storage/models";

export interface ImageDescription {
    description: string;
    isBankTransaction: boolean;
}

export interface AIProvider {
    /**
     * Send a list of messages and return the assistant's reply.
     * @param messages List of chat messages
     * @returns The assistant's response text
     */
    chat(messages: ChatMessage[]): Promise<string>;

    /**
     * Describe an image using a multimodal vision model.
     * This is a SEPARATE instance from the main chat() method.
     * The provider should use a vision-capable model to analyze the image
     * and determine if it's a bank transaction receipt.
     * 
     * @param imageBuffer Raw image data buffer
     * @param mimeType MIME type of the image (e.g., "image/jpeg", "image/png")
     * @returns Structured description with bank transaction flag
     */
    describeImage(imageBuffer: Buffer, mimeType: string): Promise<ImageDescription>;

    /**
     * Return True if the provider is reachable and functional.
     */
    healthCheck(): Promise<boolean>;
}