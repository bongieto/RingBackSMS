import { decryptMessages } from './encryption';

export const DEFAULT_CONVERSATION_MESSAGE_LIMIT = 50;
export const MAX_CONVERSATION_MESSAGE_LIMIT = 200;

interface ConversationMessageWindowOptions {
  beforeIndex?: number | null;
  limit?: number | null;
}

export interface ConversationMessageWindow {
  messages: unknown[];
  messagePage: {
    totalMessages: number;
    messagesLoaded: number;
    hasMoreMessages: boolean;
    nextBeforeIndex: number | null;
    startIndex: number;
    endIndex: number;
  };
}

function clampPositiveInt(value: number | null | undefined, fallback: number, max: number): number {
  if (!Number.isFinite(value) || !value || value < 1) return fallback;
  return Math.min(Math.floor(value), max);
}

export function parseConversationMessageLimit(value: string | null): number {
  return clampPositiveInt(Number(value), DEFAULT_CONVERSATION_MESSAGE_LIMIT, MAX_CONVERSATION_MESSAGE_LIMIT);
}

export function parseConversationBeforeIndex(value: string | null): number | null {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.floor(parsed);
}

export function buildConversationMessageWindow(
  storedMessages: unknown,
  options: ConversationMessageWindowOptions = {},
): ConversationMessageWindow {
  const allMessages = decryptMessages(storedMessages);
  const totalMessages = allMessages.length;
  const limit = clampPositiveInt(
    options.limit ?? DEFAULT_CONVERSATION_MESSAGE_LIMIT,
    DEFAULT_CONVERSATION_MESSAGE_LIMIT,
    MAX_CONVERSATION_MESSAGE_LIMIT,
  );
  const endIndex = Math.min(Math.max(options.beforeIndex ?? totalMessages, 0), totalMessages);
  const startIndex = Math.max(0, endIndex - limit);
  const messages = allMessages.slice(startIndex, endIndex);

  return {
    messages,
    messagePage: {
      totalMessages,
      messagesLoaded: messages.length,
      hasMoreMessages: startIndex > 0,
      nextBeforeIndex: startIndex > 0 ? startIndex : null,
      startIndex,
      endIndex,
    },
  };
}
