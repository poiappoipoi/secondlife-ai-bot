/**
 * Persona service - loads and manages persona configurations from markdown files
 */
import path from 'path';
import { existsSync } from 'fs';

/**
 * Manages persona loading from markdown files
 */
export class PersonaService {
  private readonly personasDir: string;
  private currentPersonaName: string = '';
  private currentSystemPrompt: string = '';

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

      this.currentPersonaName = filename.replace(/\.md$/, '');
      this.currentSystemPrompt = content.trim();

      console.log(`[Persona] Loaded: ${this.currentPersonaName} from ${filename}`);

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
}
