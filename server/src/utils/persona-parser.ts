/**
 * Persona parsing utilities - extracts structured facts from persona files
 */
import type { PersonaData, PersonaFacts } from '../types/index';

/**
 * Section markers in persona files
 */
const FACTS_MARKER = '---FACTS---';
const WORLD_MARKER = '---WORLD---';

/**
 * Parses persona file content into system prompt and structured facts
 * @param content - Raw persona file content
 * @returns Parsed persona data with system prompt and facts
 */
export function parsePersonaContent(content: string): PersonaData {
  const lines = content.split('\n');

  // Find section markers
  const factsIndex = lines.findIndex((line) => line.trim() === FACTS_MARKER);
  const worldIndex = lines.findIndex((line) => line.trim() === WORLD_MARKER);

  // If no markers found, entire content is system prompt (backward compatible)
  if (factsIndex === -1 && worldIndex === -1) {
    return {
      systemPrompt: content.trim(),
      facts: { character: {}, world: {} },
    };
  }

  // Find first marker position
  const firstMarkerIndex = Math.min(
    factsIndex === -1 ? Infinity : factsIndex,
    worldIndex === -1 ? Infinity : worldIndex
  );

  // System prompt is everything before first marker
  const systemPrompt = lines.slice(0, firstMarkerIndex).join('\n').trim();

  // Parse FACTS section
  let characterFacts: Record<string, string> = {};
  if (factsIndex !== -1) {
    const factsEndIndex = worldIndex > factsIndex ? worldIndex : lines.length;
    const factsLines = lines.slice(factsIndex + 1, factsEndIndex);
    characterFacts = parseKeyValuePairs(factsLines);
  }

  // Parse WORLD section
  let worldFacts: Record<string, string> = {};
  if (worldIndex !== -1) {
    const worldEndIndex = factsIndex > worldIndex ? factsIndex : lines.length;
    const worldLines = lines.slice(worldIndex + 1, worldEndIndex);
    worldFacts = parseKeyValuePairs(worldLines);
  }

  return {
    systemPrompt,
    facts: {
      character: characterFacts,
      world: worldFacts,
    },
  };
}

/**
 * Parses key:value pairs from lines of text
 * @param lines - Array of lines to parse
 * @returns Record of key-value pairs
 */
export function parseKeyValuePairs(lines: string[]): Record<string, string> {
  const pairs: Record<string, string> = {};

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines, comments, and section markers
    if (
      !trimmed ||
      trimmed.startsWith('#') ||
      trimmed === FACTS_MARKER ||
      trimmed === WORLD_MARKER
    ) {
      continue;
    }

    // Parse key:value format
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex > 0) {
      const key = trimmed.substring(0, colonIndex).trim();
      const value = trimmed.substring(colonIndex + 1).trim();

      if (key && value) {
        pairs[key] = value;
      }
    }
  }

  return pairs;
}

/**
 * Formats structured facts as readable text
 * @param facts - Persona facts to format
 * @returns Formatted text representation
 */
export function formatFactsAsText(facts: PersonaFacts): string {
  const lines: string[] = [];

  // Format character facts
  const characterKeys = Object.keys(facts.character);
  if (characterKeys.length > 0) {
    lines.push('CHARACTER FACTS:');
    for (const key of characterKeys) {
      lines.push(`  ${key}: ${facts.character[key]}`);
    }
  }

  // Format world facts
  const worldKeys = Object.keys(facts.world);
  if (worldKeys.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push('WORLD FACTS:');
    for (const key of worldKeys) {
      lines.push(`  ${key}: ${facts.world[key]}`);
    }
  }

  return lines.join('\n');
}
