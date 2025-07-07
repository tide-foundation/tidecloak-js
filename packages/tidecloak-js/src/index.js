import { ModelRegistry } from '../modules/tide-js/Models/ModelRegistry.js';

export { default as IAMService } from './IAMService.js';
export { default as TideCloak } from "../lib/tidecloak.js";
export { bytesToBase64, base64ToBytes } from "../modules/tide-js/Cryptide/Serialization.js";

export function getHumanReadableObject(modelId, data, expiry) {
    return ModelRegistry.getHumanReadableModelBuilder(modelId, data, expiry).getHumanReadableObject();
}
