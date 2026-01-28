/**
 * NPC State Machine Service
 * Core state management with tick loop and long-polling for selective NPC behavior
 */

import { EventEmitter } from 'events';
import type {
  NPCState,
  StateContext,
  StateTransition,
  StateMachineConfig,
  DecisionResult,
  LongPollDecision,
} from '../types/npc';
import { MessageBufferService } from './message-buffer';
import { DecisionLayerService } from './decision-layer';
import { LoggerService } from './logger';

export class NPCStateMachineService extends EventEmitter {
  private state: NPCState = 'IDLE' as NPCState;
  private stateEnteredAt: number = Date.now();
  private activeTarget: string | null = null;
  private lastResponseAt: number = 0;
  private tickIntervalHandle: NodeJS.Timer | null = null;
  private transitionHistory: StateTransition[] = [];
  private config: StateMachineConfig;
  private pendingDecisions: Map<string, DecisionResult> = new Map(); // Queue for decisions made when no one listening

  constructor(
    private messageBuffer: MessageBufferService,
    private decisionLayer: DecisionLayerService,
    private logger: LoggerService,
    config: StateMachineConfig
  ) {
    super();
    this.config = config;
  }

  /**
   * Start the state machine tick loop
   */
  start(): void {
    if (this.tickIntervalHandle) {
      this.logger.warn('State machine already started');
      return;
    }

    this.logger.info(`NPC State Machine started (tick: ${this.config.tickIntervalMs}ms)`);
    this.tickIntervalHandle = setInterval(() => this.tick(), this.config.tickIntervalMs);
    this.emit('started');
  }

  /**
   * Stop the state machine
   */
  stop(): void {
    if (this.tickIntervalHandle) {
      clearInterval(this.tickIntervalHandle);
      this.tickIntervalHandle = null;
      this.logger.info('NPC State Machine stopped');
      this.emit('stopped');
    }
  }

  /**
   * Handle incoming message (buffer immediately)
   */
  onMessageReceived(avatarId: string, avatarName: string, content: string): void {
    // Detect if message contains trigger words
    const isDirectMention = this.decisionLayer.detectMention(content);

    // Add to buffer
    const buffered = this.messageBuffer.addMessage(avatarId, avatarName, content, isDirectMention);

    this.logger.debug(`Buffered message from ${avatarName}${isDirectMention ? ' (mention)' : ''}`);

    // Transition to LISTENING if in IDLE
    if (this.state === 'IDLE') {
      this.transitionTo('LISTENING' as NPCState, 'message received');
    }

    // Fast-track: If high-priority mention and currently LISTENING, trigger immediate decision
    if (isDirectMention && this.state === 'LISTENING') {
      this.logger.debug(`Fast-track mention from ${avatarName} - checking decision immediately`);
      // The next tick will make a decision with this message included
      // Emit a flag to indicate high-priority message
      this.emit('high-priority-mention', { avatarId, avatarName, content });
    }

    this.emit('message-buffered', buffered);
  }

  /**
   * Wait for decision (long-polling)
   * Returns promise that resolves when decision is made about this avatar
   */
  waitForDecision(avatarId: string, timeoutMs: number): Promise<LongPollDecision> {
    return new Promise((resolve) => {
      // Check if there's a pending decision for this avatar
      const pendingDecision = this.pendingDecisions.get(avatarId);
      if (pendingDecision) {
        this.pendingDecisions.delete(avatarId);
        this.logger.debug(`Decision resolved for ${avatarId} from pending queue: respond`);
        resolve({ decided: true, reason: 'selected', decision: pendingDecision });
        return;
      }

      const timeoutHandle = setTimeout(() => {
        removeListeners();
        this.logger.debug(`Long-poll timeout for ${avatarId}`);
        resolve({ decided: false, reason: 'timeout' });
      }, timeoutMs);

      const onDecision = (decision: DecisionResult) => {
        if (decision.targetAvatarId === avatarId) {
          clearTimeout(timeoutHandle);
          removeListeners();
          this.logger.debug(`Decision resolved for ${avatarId}: respond`);
          resolve({ decided: true, reason: 'selected', decision });
        }
        // else: different target, keep waiting
      };

      const removeListeners = () => {
        this.removeListener('decision-made', onDecision);
      };

      // Listen for decision events
      this.on('decision-made', onDecision);
    });
  }

  /**
   * Notify state machine that LLM response is ready
   */
  onLLMResponseReady(response: string): void {
    if (this.state !== 'THINKING') {
      this.logger.warn(`LLM response ready but not in THINKING state (${this.state})`);
      return;
    }

    this.logger.debug(`LLM response ready (${response.length} chars)`);

    // Update active target's last responded time
    if (this.activeTarget) {
      this.messageBuffer.updateLastResponded(this.activeTarget);
      this.lastResponseAt = Date.now();
    }

    // Transition to SPEAKING
    this.transitionTo('SPEAKING' as NPCState, 'LLM response ready');
    this.emit('response-ready', response);
  }

  /**
   * Handle LLM error
   */
  onLLMError(): void {
    this.logger.warn(`LLM error in ${this.state} state`);

    if (this.state === 'THINKING') {
      // Clear active target and go back to IDLE
      if (this.activeTarget) {
        this.messageBuffer.clearBuffer(this.activeTarget);
        this.activeTarget = null;
      }
      this.transitionTo('IDLE' as NPCState, 'LLM error recovery');
    }

    this.emit('llm-error');
  }

  /**
   * Reset state machine (for memory clear/reset commands)
   */
  resetState(): void {
    this.messageBuffer.clearAll();
    this.decisionLayer.clearHistory();
    this.activeTarget = null;
    this.transitionTo('IDLE' as NPCState, 'manual reset');
    this.logger.info('State machine reset');
  }

  /**
   * Get current state context
   */
  getContext(): StateContext {
    return {
      currentState: this.state,
      stateEnteredAt: this.stateEnteredAt,
      activeTarget: this.activeTarget,
      lastResponseAt: this.lastResponseAt,
      transitionHistory: [...this.transitionHistory],
    };
  }

  /**
   * Get current state
   */
  getCurrentState(): NPCState {
    return this.state;
  }

  /**
   * Get active conversation target
   */
  getActiveTarget(): string | null {
    return this.activeTarget;
  }

  /**
   * State machine tick loop (runs every tickIntervalMs)
   */
  private tick(): void {
    const elapsed = Date.now() - this.stateEnteredAt;

    switch (this.state) {
      case 'IDLE':
        this.handleIdleTick();
        break;

      case 'LISTENING':
        this.handleListeningTick(elapsed);
        break;

      case 'THINKING':
        this.handleThinkingTick(elapsed);
        break;

      case 'SPEAKING':
        this.handleSpeakingTick(elapsed);
        break;
    }

    this.emit('tick', {
      state: this.state,
      elapsed,
      bufferSize: this.messageBuffer.getTotalBufferSize(),
    });
  }

  /**
   * Handle IDLE state
   * Transition to LISTENING if messages are buffered
   */
  private handleIdleTick(): void {
    if (this.messageBuffer.getTotalBufferSize() > 0) {
      this.transitionTo('LISTENING' as NPCState, 'messages buffered');
    }
  }

  /**
   * Handle LISTENING state
   * Make decision and transition to THINKING if selected
   */
  private handleListeningTick(elapsed: number): void {
    // Check timeout
    if (elapsed > this.config.timeouts.listeningMs) {
      this.logger.debug(`LISTENING timeout after ${elapsed}ms`);
      this.messageBuffer.cleanExpiredMessages();

      // Always transition to IDLE on timeout (don't try to stay in LISTENING)
      // Next tick will return to LISTENING if messages remain
      this.transitionTo('IDLE' as NPCState, 'listening timeout - restart cycle');
      return;
    }

    // Make decision
    const buffers = this.messageBuffer.getAllBuffers();
    const decision = this.decisionLayer.makeDecision(buffers);

    if (decision.shouldRespond && decision.targetAvatarId) {
      // Check if anyone is listening for this decision (request is still waiting)
      const hasListeners = this.listenerCount('decision-made') > 0;

      if (!hasListeners) {
        // No request is waiting yet - queue the decision for next request
        this.logger.debug(
          `Decision made for ${decision.targetAvatarId} but no listeners - queueing decision`
        );
        this.pendingDecisions.set(decision.targetAvatarId, decision);
        return; // Don't transition to THINKING yet
      }

      this.activeTarget = decision.targetAvatarId;
      this.transitionTo('THINKING' as NPCState, `selected ${decision.targetAvatarId}`);
      this.emit('decision-made', decision);
      this.logger.info(
        `Decision: respond to ${this.messageBuffer.getBuffer(decision.targetAvatarId)?.avatarName} ` +
          `(score: ${decision.priorityScore.toFixed(0)})`
      );
    }
  }

  /**
   * Handle THINKING state
   * Monitor for timeout (LLM hangs)
   */
  private handleThinkingTick(elapsed: number): void {
    if (elapsed > this.config.timeouts.thinkingMs) {
      this.logger.error(
        `LLM timeout after ${elapsed}ms (threshold: ${this.config.timeouts.thinkingMs}ms)`
      );

      // Clear active target and return to IDLE
      if (this.activeTarget) {
        this.messageBuffer.clearBuffer(this.activeTarget);
        this.activeTarget = null;
      }

      this.transitionTo('IDLE' as NPCState, 'LLM timeout');
    }
  }

  /**
   * Handle SPEAKING state
   * Wait for cooldown, then transition back to LISTENING or IDLE
   */
  private handleSpeakingTick(elapsed: number): void {
    if (elapsed > this.config.timeouts.speakingCooldownMs) {
      // Cooldown complete
      if (this.messageBuffer.getTotalBufferSize() > 0) {
        this.transitionTo('LISTENING' as NPCState, 'cooldown complete, messages waiting');
      } else {
        this.transitionTo('IDLE' as NPCState, 'cooldown complete, no messages');
      }
    }
  }

  /**
   * Transition to a new state
   */
  private transitionTo(newState: NPCState, reason: string): void {
    if (newState === this.state) {
      return; // No change
    }

    const transition: StateTransition = {
      from: this.state,
      to: newState,
      reason,
      timestamp: Date.now(),
    };

    this.transitionHistory.push(transition);

    // Keep last 100 transitions
    if (this.transitionHistory.length > 100) {
      this.transitionHistory.shift();
    }

    const oldState = this.state;
    this.state = newState;
    this.stateEnteredAt = Date.now();

    this.logger.debug(`State: ${oldState} → ${newState} (${reason})`);
    this.emit('state-transition', transition);
  }

  /**
   * Get statistics for monitoring
   */
  getStats(): {
    state: NPCState;
    activeTarget: string | null;
    stateAgeMs: number;
    bufferStats: ReturnType<MessageBufferService['getStats']>;
    decisionStats: ReturnType<DecisionLayerService['getStats']>;
    recentTransitions: StateTransition[];
  } {
    return {
      state: this.state,
      activeTarget: this.activeTarget,
      stateAgeMs: Date.now() - this.stateEnteredAt,
      bufferStats: this.messageBuffer.getStats(),
      decisionStats: this.decisionLayer.getStats(),
      recentTransitions: this.transitionHistory.slice(-10),
    };
  }
}
