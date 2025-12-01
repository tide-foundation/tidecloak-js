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
}

// Model
export interface Model {
  id: string;
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

// Predefined models available in the system
export const PREDEFINED_MODELS: Model[] = [
  {
    id: 'ForsetiModel:1',
    name: 'Forseti Access Model',
    description: 'Access control model for Forseti authorization system',
    fields: [
      { key: 'realm_resource', type: 'array', label: 'Realm Resource Roles' },
      { key: 'resource_access', type: 'object', label: 'Resource Access' },
      { key: 'stage', type: 'string', label: 'Stage', options: ['validate', 'test', 'production'] },
      { key: 'sub', type: 'string', label: 'Subject (User ID)' },
    ],
  },
  {
    id: 'UserAccessModel:1',
    name: 'User Access Model',
    description: 'Simple role-based access control model',
    fields: [
      { key: 'role', type: 'string', label: 'User Role', options: ['admin', 'editor', 'viewer'] },
      { key: 'department', type: 'string', label: 'Department' },
      { key: 'permissions', type: 'array', label: 'Permissions' },
    ],
  },
  {
    id: 'DocumentModel:1',
    name: 'Document Access Model',
    description: 'Document-based access control',
    fields: [
      { key: 'user.role', type: 'string', label: 'User Role', options: ['owner', 'editor', 'viewer'] },
      { key: 'user.id', type: 'string', label: 'User ID' },
      { key: 'document.owner', type: 'string', label: 'Document Owner' },
      { key: 'document.type', type: 'string', label: 'Document Type', options: ['public', 'private', 'shared'] },
    ],
  },
];
