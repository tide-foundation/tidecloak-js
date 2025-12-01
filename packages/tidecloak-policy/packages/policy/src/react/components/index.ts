// Policy Builder - Zero External Dependencies (Only React)
// Security-focused version with native browser APIs
import { BaseTideRequest } from 'heimdall-tide';

export { PolicyBuilder } from './PolicyBuilder';
export { PolicyCanvas } from './PolicyCanvas';
export { BlockPalette } from './BlockPalette';
export { PropertiesPanel } from './PropertiesPanel';
export { Select } from './Select';
export { useFetch, useMutation } from './useFetch';

// Re-export types and constants via local proxy (NOT @shared directly)
export type { PolicyBlock, Model, CompileResult, Claim } from '../../schema';
export { PREDEFINED_MODELS } from '../../schema';
export { BaseTideRequest };
