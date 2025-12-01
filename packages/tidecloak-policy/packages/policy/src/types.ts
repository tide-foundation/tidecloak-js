// Policy Builder Types - Zero External Dependencies
// Pure TypeScript types for frontend component library

// Policy Block Types
export type BlockType =
  | "condition"
  | "if_else" // Decision block with Then/Otherwise branches
  | "logic_and"
  | "logic_or"
  | "logic_not"
  | "action_allow"
  | "action_deny";

// Policy Block with hierarchical support
export interface PolicyBlock {
  id: string;
  type: BlockType;
  config: Record<string, any>; // Dynamic configuration based on block type
  order: number; // Order in the flow at current level
  thenBlocks?: string[]; // Block IDs for "then" branch (if_else blocks only)
  elseBlocks?: string[]; // Block IDs for "otherwise" branch (if_else blocks only)
  children?: string[]; // Child block IDs for logic operators (AND/OR/NOT)
}

// Model Field Structure
export interface ModelField {
  key: string;
  type: "string" | "number" | "boolean" | "array" | "object";
  label: string;
  options?: string[]; // For dropdown fields
  required?: boolean;
  /** NEW: default placeholder value that seeds claims UI */
  placeholder?: string | number | boolean;
}

// Model
export interface Model {
  id: string;
  contractId: string;
  name: string;
  description?: string;
  fields: ModelField[];
  category?: "common" | "custom";
}

// Claim (key-value pairs)
export interface Claim {
  key: string;
  value: any;
  type?: "string" | "number" | "boolean";
}

// Policy
export interface Policy {
  id: string;
  name?: string;
  modelId: string;
  mode: "simple" | "advanced";
  blocks?: PolicyBlock[]; // For simple mode
  code?: string; // For advanced mode (C# code)
  claims?: Claim[];
  contractId?: string;
  entryType?: string;
  // Advanced settings
  resource?: string;
  action?: string;
  baseUrl?: string;
}

// Insert Policy (for creating new policies)
export type InsertPolicy = Omit<Policy, "id">;

// Compilation Request
export interface CompileRequest {
  modelId: string;
  mode: "simple" | "advanced";
  blocks?: PolicyBlock[];
  code?: string;
  claims?: Claim[];
  language?: string; // Target language for code generation (e.g., "csharp", "python")
}

// Compilation Result
export interface CompileResult {
  success: boolean;
  message?: string;
  errors?: string[];
  generatedCode?: string;
  plainEnglish?: string;
}

// Language information metadata
export interface LanguageInfo {
  id: string;
  name: string;
  version?: string;
  fileExtension: string;
  supportsValidation: boolean;
}

// Validation result from code validation
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}

// Code Generator Interface
export interface CodeGenerator {
  getLanguageInfo(): LanguageInfo;
  translateBlocks(blocks: PolicyBlock[]): string;
  generateDescription(blocks: PolicyBlock[]): string;
  validateCode(code: string): ValidationResult;
  compile(
    mode: "simple" | "advanced",
    blocks?: PolicyBlock[],
    code?: string,
    claims?: Claim[]
  ): Promise<CompileResult>;
}

// Generator Registry Interface
export interface GeneratorRegistry {
  register(languageId: string, generator: CodeGenerator): void;
  get(languageId: string): CodeGenerator | undefined;
  getAvailableLanguages(): string[];
  isSupported(languageId: string): boolean;
}

// Predefined models available in the system
export const PREDEFINED_MODELS: Model[] = [
  {
    id: "Policy",
    contractId: "SecuredPolicyCreation",
    name: "Cardano policy creation request model.",
    description: "Access control model for creating cardano transactions policies",
    fields: [
      { key: "restrict_equals_model", type: "string", label: "Restricted Model", options: ["CardanoTransaction:1"], required: true, placeholder: "CardanoTransaction:1" },
      { key: "restrict_equals_contract", type: "string", label: "Restricted Contract", options: ["CardanoContract"], required: true, placeholder: "CardanoContract" },
      { key: "threshold", type: "string", label: "Minimum amount of signatures required", required: true, placeholder: "1" },
      { key: "role", type: "string", label: "Role required to sign request", required: true, placeholder: "admin" },
      { key: "Max_Amount", type: "number", label: "Optional: limits user to max amount", required: false, placeholder: 1000 },
    ],
  },
  {
    id: "CardanoTX",
    contractId: "CardanoTx:1",
    name: "Cardano Transactions",
    description: "Access control model for signing cardano transactions",
    fields: [
      { key: "threshold", type: "string", label: "Minimum amount of signatures required", required: true, placeholder: "1" },
      { key: "clientId", type: "string", label: "mechapurse", placeholder: "cardano_vault" },
      { key: "role", type: "string", label: "Role required to sign request", required: true, placeholder: "admin" },
      { key: "Max_Amount", type: "number", label: "Max amount allowed to transact with", required: true, placeholder: 1000 },
    ],
  },
  {
    id: "CustomModel:1",
    name: "Custom Model",
    contractId: "",
    description: "Define your own custom fields for flexible access control",
    fields: [
      { key: "contractId", type: "string", label: "Custom Contract Id", required: true, placeholder: "sha256:..." },
    ],
    category: "custom" as const,
  },
];
