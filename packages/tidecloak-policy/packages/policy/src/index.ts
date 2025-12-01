// Core logic exports
export { compilePolicy } from './compilePolicy';
export { CSharpGenerator } from './generators/CSharpGenerator';
export { getGenerator, generatorRegistry } from './generators/registry';

// Type exports
export type {
  Policy,
  PolicyBlock,
  Model,
  ModelField,
  Claim,
  CodeGenerator,
  CompileResult,
  CompileRequest,
  GeneratorRegistry,
  BlockType,
} from './types';
