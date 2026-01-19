export type MessageRole = 'system' | 'user' | 'assistant';

export interface Message {
  role: MessageRole;
  content: string;
}

export interface ConversationState {
  history: Message[];
  systemPrompt: string;
  lastActivityTime: number;
}
