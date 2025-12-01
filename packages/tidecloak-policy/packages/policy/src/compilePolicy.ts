import type { PolicyBlock, Claim, CompileResult } from "./types";
import { getGenerator } from "./generators/registry";

/**
 * Client-side policy compilation
 * No server required - runs entirely in the browser
 */
export async function compilePolicy(
  mode: "simple" | "advanced",
  blocks?: PolicyBlock[],
  code?: string,
  claims?: Claim[],
  language: string = "csharp"
): Promise<CompileResult> {
  try {
    const generator = getGenerator(language);
    return await generator.compile(mode, blocks, code, claims);
  } catch (error) {
    return {
      success: false,
      message: "Compilation failed",
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}
