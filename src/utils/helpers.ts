export function truncateText(text: string, maxLength: number = 4000): string {
    if (text.length <= maxLength) {
        return text;
    }
    return text.substring(0, maxLength - 3) + "...";
}

export function formatUserId(userId: number): string {
    return `user_${userId}`;
}
