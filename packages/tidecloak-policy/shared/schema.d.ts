export type BlockType = "condition" | "if_else" | "logic_and" | "logic_or" | "logic_not" | "action_allow" | "action_deny";
export interface PolicyBlock {
    id: string;
    type: BlockType;
    config: Record<string, any>;
    order: number;
    thenBlocks?: string[];
    elseBlocks?: string[];
    children?: string[];
}
export interface ModelField {
    key: string;
    type: "string" | "number" | "boolean" | "array" | "object";
    label: string;
    options?: string[];
    required?: boolean;
}
export interface Model {
    id: string;
    name: string;
    description?: string;
    fields: ModelField[];
    category?: "common" | "custom";
}
export interface Claim {
    key: string;
    value: any;
    type?: "string" | "number" | "boolean";
}
export interface Policy {
    id: string;
    name?: string;
    modelId: string;
    mode: "simple" | "advanced";
    blocks?: PolicyBlock[];
    code?: string;
    claims?: Claim[];
    contractId?: string;
    entryType?: string;
}
export type InsertPolicy = Omit<Policy, "id">;
export interface CompileRequest {
    modelId: string;
    mode: "simple" | "advanced";
    blocks?: PolicyBlock[];
    code?: string;
    claims?: Claim[];
    language?: string;
}
export interface CompileResult {
    success: boolean;
    message?: string;
    errors?: string[];
    generatedCode?: string;
    plainEnglish?: string;
}
export declare const PREDEFINED_MODELS: Model[];
