/**
 * NPC State Machine Type Definitions
 * Defines types for selective, human-like NPC behavior
 */

export enum NPCState {
  IDLE = 'IDLE',
  LISTENING = 'LISTENING',
  THINKING = 'THINKING',
  SPEAKING = 'SPEAKING'
}

export interface StateContext {
  currentState: NPCState;
  stateEnteredAt: number;
  activeTarget: string | null;
  lastResponseAt: number;
  transitionHistory: StateTransition[];
}

export interface StateTransition {
  from: NPCState;
  to: NPCState;
  reason: string;
  timestamp: number;
}

export interface BufferedMessage {
  id: string;
  avatarId: string;
  avatarName: string;
  content: string;
  receivedAt: number;
  isDirectMention: boolean;
}

export interface AvatarBuffer {
  avatarId: string;
  avatarName: string;
  messages: BufferedMessage[];
  firstMessageAt: number;
  lastMessageAt: number;
  totalMessages: number;
  lastRespondedAt: number | null;
}

export interface DecisionResult {
  shouldRespond: boolean;
  targetAvatarId: string | null;
  reason: string;
  priorityScore: number;
}

export interface LongPollDecision {
  decided: boolean;
  reason: string;
  decision?: DecisionResult;
}

// Configuration interfaces
export interface NPCConfig {
  enabled: boolean;
  stateMachine: StateMachineConfig;
  buffer: BufferConfig;
  decision: DecisionConfig;
}

export interface StateMachineConfig {
  tickIntervalMs: number;
  timeouts: {
    listeningMs: number;
    thinkingMs: number;
    speakingCooldownMs: number;
  };
}

export interface BufferConfig {
  maxMessagesPerAvatar: number;
  maxTotalBufferSize: number;
  aggregationWindowMs: number;
  expiryMs: number;
}

export interface DecisionConfig {
  responseThreshold: number;
  responseChance: number;
  triggerWords: string[];
  scoring: {
    directMentionBonus: number;
    recentInteractionBonus: number;
    messageCountMultiplier: number;
    consecutiveBonus: number;
    maxTimeDecay: number;
    timeDecayRate: number;
    randomnessRange: number;
  };
  cooldownMs: number;
}
