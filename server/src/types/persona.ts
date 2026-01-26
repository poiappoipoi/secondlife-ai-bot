/**
 * Persona type definitions
 */

/**
 * Persona configuration loaded from JSON file
 */
export interface Persona {
  /**
   * Unique identifier for the persona
   */
  id: string;

  /**
   * Display name of the persona
   */
  name: string;

  /**
   * Description of the persona
   */
  description: string;

  /**
   * System prompt that defines the persona's behavior
   */
  systemPrompt: string;

  /**
   * Model-specific parameters (optional)
   */
  parameters?: {
    temperature?: number;
    topP?: number;
    repeatPenalty?: number;
    maxTokens?: number;
  };

  /**
   * Metadata (optional)
   */
  metadata?: {
    author?: string;
    version?: string;
    tags?: string[];
    [key: string]: unknown;
  };
}
