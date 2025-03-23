import { ModelRegistry } from "../../modules/tide-js/Models/ModelRegistry.js";


export function CreateCardanoTxBodySignRequest(data, expiry) {
    return ModelRegistry.getHumanReadableModelBuilder("CardanoTxBodySignRequest", data, expiry);
}