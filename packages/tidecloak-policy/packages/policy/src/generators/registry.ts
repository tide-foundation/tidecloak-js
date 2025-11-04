import type { CodeGenerator, GeneratorRegistry } from "../types";

/**
 * Simple in-memory registry for code generators
 * Developers can register their own generators for different languages
 */
class SimpleGeneratorRegistry implements GeneratorRegistry {
  private generators: Map<string, CodeGenerator> = new Map();

  register(languageId: string, generator: CodeGenerator): void {
    this.generators.set(languageId.toLowerCase(), generator);
  }

  get(languageId: string): CodeGenerator | undefined {
    return this.generators.get(languageId.toLowerCase());
  }

  getAvailableLanguages(): string[] {
    return Array.from(this.generators.keys());
  }

  isSupported(languageId: string): boolean {
    return this.generators.has(languageId.toLowerCase());
  }
}

/**
 * Global registry instance
 * Import this to register or retrieve generators
 */
export const generatorRegistry = new SimpleGeneratorRegistry();

/**
 * Helper to get a generator with error handling
 */
export function getGenerator(languageId: string): CodeGenerator {
  const generator = generatorRegistry.get(languageId);
  if (!generator) {
    throw new Error(
      `No generator registered for language: ${languageId}. Available: ${generatorRegistry.getAvailableLanguages().join(", ")}`
    );
  }
  return generator;
}

// Auto-register C# generator
import { CSharpGenerator } from "./CSharpGenerator";
generatorRegistry.register("csharp", new CSharpGenerator());
