import type { PolicyBlock, Claim, CompileResult } from "./schema";

/**
 * Language information metadata
 */
export interface LanguageInfo {
  id: string;
  name: string;
  version?: string;
  fileExtension: string;
  supportsValidation: boolean;
}

/**
 * Validation result from code validation
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}

/**
 * Abstract interface for code generators
 * Implement this interface to add support for new programming languages
 * 
 * @example
 * ```typescript
 * class PythonGenerator implements CodeGenerator {
 *   translateBlocks(blocks: PolicyBlock[]): string {
 *     // Convert blocks to Python code
 *     return "def authorize(context):\n  return True";
 *   }
 *   
 *   generateDescription(blocks: PolicyBlock[]): string {
 *     return "Allow all access";
 *   }
 *   
 *   // ... implement other methods
 * }
 * ```
 */
export interface CodeGenerator {
  /**
   * Get language metadata
   */
  getLanguageInfo(): LanguageInfo;

  /**
   * Translate policy blocks into target language code
   * 
   * @param blocks - Array of policy blocks representing the visual policy
   * @returns Generated code in the target language
   */
  translateBlocks(blocks: PolicyBlock[]): string;

  /**
   * Generate a plain English description of the policy
   * 
   * @param blocks - Array of policy blocks
   * @returns Human-readable description of what the policy does
   */
  generateDescription(blocks: PolicyBlock[]): string;

  /**
   * Validate code written in the target language
   * 
   * @param code - Code string to validate
   * @returns Validation result with any errors or warnings
   */
  validateCode(code: string): ValidationResult;

  /**
   * Compile/process the policy (either from blocks or raw code)
   * 
   * @param mode - Simple mode (blocks) or advanced mode (raw code)
   * @param blocks - Policy blocks (for simple mode)
   * @param code - Raw code (for advanced mode)
   * @param claims - Test claims for validation
   * @returns Compilation result with generated code and description
   */
  compile(
    mode: "simple" | "advanced",
    blocks?: PolicyBlock[],
    code?: string,
    claims?: Claim[]
  ): Promise<CompileResult>;
}

/**
 * Registry for managing multiple code generators
 */
export interface GeneratorRegistry {
  /**
   * Register a new code generator
   */
  register(languageId: string, generator: CodeGenerator): void;

  /**
   * Get a registered generator by language ID
   */
  get(languageId: string): CodeGenerator | undefined;

  /**
   * Get all registered language IDs
   */
  getAvailableLanguages(): string[];

  /**
   * Check if a language is supported
   */
  isSupported(languageId: string): boolean;
}
