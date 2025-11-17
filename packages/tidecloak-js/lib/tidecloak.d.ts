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
}
export { RequestEnclave, ApprovalEnclave, ApprovalEnclaveNew, TideMemory } from "heimdall-tide";