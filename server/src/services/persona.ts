/**
 * Persona service - loads and manages persona configurations from markdown files
 */
import path from 'path';
import { existsSync } from 'fs';
import type { PersonaFacts, PersonaData } from '../types/index';
import { parsePersonaContent, formatFactsAsText } from '../utils/persona-parser';

/**
 * Manages persona loading from markdown files
 */
export class PersonaService {
  private readonly personasDir: string;
  private currentPersonaName: string = '';
  private currentSystemPrompt: string = '';
  private currentFacts: PersonaFacts = { character: {}, world: {} };

  constructor(personasDir?: string) {
    this.personasDir = personasDir ?? path.join(process.cwd(), 'personas');
  }

  /**
   * Loads a persona from markdown file
   * @param filename - Name of the persona file (e.g., "cat-maid.md")
   * @returns The loaded system prompt
   * @throws Error if file doesn't exist or is empty
   */
  async loadPersona(filename: string): Promise<string> {
    const filePath = path.join(this.personasDir, filename);

    if (!existsSync(filePath)) {
      throw new Error(`Persona file not found: ${filePath}`);
    }

    try {
      const file = Bun.file(filePath);
      const content = await file.text();

      if (!content.trim()) {
        throw new Error(`Persona file is empty: ${filePath}`);
      }

      // Parse persona content
      const parsed = parsePersonaContent(content);
      this.currentPersonaName = filename.replace(/\.md$/, '');
      this.currentSystemPrompt = parsed.systemPrompt;
      this.currentFacts = parsed.facts;

      // Count facts
      const charFactCount = Object.keys(this.currentFacts.character).length;
      const worldFactCount = Object.keys(this.currentFacts.world).length;

      console.log(
        `[Persona] Loaded: ${this.currentPersonaName} from ${filename} ` +
          `(${charFactCount} character, ${worldFactCount} world facts)`
      );

      return this.currentSystemPrompt;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Failed to load persona file: ${filePath}`);
    }
  }

  /**
   * Gets the current persona name
   */
  getPersonaName(): string {
    return this.currentPersonaName || 'Unknown';
  }

  /**
   * Gets the system prompt from the current persona
   */
  getSystemPrompt(): string {
    if (!this.currentSystemPrompt) {
      throw new Error('No persona loaded');
    }
    return this.currentSystemPrompt;
  }

  /**
   * Lists all available persona files in the personas directory
   */
  async listPersonas(): Promise<string[]> {
    try {
      if (!existsSync(this.personasDir)) {
        return [];
      }

      // Read directory contents
      const files: string[] = [];
      const glob = new Bun.Glob('*.md');
      for await (const file of glob.scan(this.personasDir)) {
        files.push(file);
      }
      return files.sort();
    } catch {
      return [];
    }
  }

  /**
   * Gets the structured facts from current persona
   */
  getFacts(): PersonaFacts {
    return this.currentFacts;
  }

  /**
   * Gets a specific character fact by key
   */
  getCharacterFact(key: string): string | undefined {
    return this.currentFacts.character[key];
  }

  /**
   * Gets a specific world fact by key
   */
  getWorldFact(key: string): string | undefined {
    return this.currentFacts.world[key];
  }

  /**
   * Formats facts as readable text
   */
  getFactsAsText(): string {
    return formatFactsAsText(this.currentFacts);
  }

  /**
   * Gets complete persona data (system prompt + facts)
   */
  getPersonaData(): PersonaData {
    return {
      systemPrompt: this.currentSystemPrompt,
      facts: this.currentFacts,
    };
  }
}
