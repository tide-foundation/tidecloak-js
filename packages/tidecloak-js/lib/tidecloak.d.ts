export function getHumanReadableObject(modelId: any, data: any, expiry: any): void;
export default TideCloak;
declare function TideCloak(config: any): void;
declare class TideCloak {
    constructor(config: any);
    didInitialize: boolean;
    init: (initOptions?: {}) => any;
    login: (options: any) => any;
    ensureTokenReady: () => Promise<void>;
    encrypt: (toEncrypt: any) => Promise<any>;
    initEnclave: () => void;
    decrypt: (toDecrypt: any) => Promise<any>;
    createLoginUrl: (options: any) => Promise<string>;
    logout: (options: any) => any;
    createLogoutUrl: (options: any) => any;
    register: (options: any) => any;
    createRegisterUrl: (options: any) => Promise<string>;
    createAccountUrl: (options: any) => string;
    accountManagement: () => any;
    hasRealmRole: (role: any) => boolean;
    hasResourceRole: (role: any, resource: any) => boolean;
    loadUserProfile: () => any;
    loadUserInfo: () => any;
    isTokenExpired: (minValidity: any) => boolean;
    updateToken: (minValidity: any) => any;
    clearToken: () => void;
    checkThresholdRule: (key: any, idSubstring: any, outputKey: any, ruleSettings: any, draftJson: any) => {
        roles: string[];
        threshold: number;
    };
    createCardanoTxDraft: (txBody: any) => string;
    sign: (signModel: any, authFlow: any, draft: any, authorizers: any, ruleSetting: any, expiry: any) => Promise<Uint8Array<ArrayBuffer>[]>;
    signCardanoTx: (txBody: any, authorizers: any, ruleSettings: any, expiry: any) => Promise<string>;
    createRuleSettingsDraft: (ruleSettings: any, previousRuleSetting: any, previousRuleSettingCert: any) => string;
}
export { RequestEnclave, ApprovalEnclave } from "heimdall-tide";
export { bytesToBase64, base64ToBytes } from "../modules/tide-js/Cryptide/Serialization.js";
