export { default as IAMService } from './IAMService.js';
export { default as TideCloak } from "../lib/tidecloak.js";
export { RequestEnclave, ApprovalEnclaveNew } from "../lib/tidecloak.js";
export { TideMemory, BaseTideRequest } from "heimdall-tide";

// Re-export types for native mode (TypeScript will pick these up from types.ts)
/** @typedef {import('./types.js').NativeAdapter} NativeAdapter */
/** @typedef {import('./types.js').NativeTokenData} NativeTokenData */
/** @typedef {import('./types.js').NativeAuthCallbackResult} NativeAuthCallbackResult */
/** @typedef {import('./types.js').NativeConfig} NativeConfig */
