export interface ConversationMessageSummary {
  lastMessagePreview: string | null;
  messageCount: number;
  messageSummarySyncedAt: Date;
}

interface ConversationMessageLike {
  content?: unknown;
}

const MAX_PREVIEW_LENGTH = 240;

export function summarizeConversationMessages(messages: unknown[]): ConversationMessageSummary {
  let lastMessagePreview: string | null = null;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index] as ConversationMessageLike | null | undefined;
    const content = typeof message?.content === 'string' ? message.content.trim() : '';
    if (content.length > 0) {
      lastMessagePreview = content.slice(0, MAX_PREVIEW_LENGTH);
      break;
    }
  }

  return {
    lastMessagePreview,
    messageCount: messages.length,
    messageSummarySyncedAt: new Date(),
  };
}

export function messagesFromPreview(preview: string | null | undefined): Array<{ content: string }> {
  return preview ? [{ content: preview }] : [];
}
