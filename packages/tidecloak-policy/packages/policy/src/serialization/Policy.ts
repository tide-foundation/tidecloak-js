import { TideMemory } from "./TideMemory";
import { BigIntToByteArray, StringToUint8Array } from "./Utils";

export class Policy{
    version: string;
    contractId: string;
    modelId: string;
    keyId: string;
    params: PolicyParameters;

    constructor(data: {version: string, contractId: string, modelId: string, keyId: string, params: Map<string, any>}){
        if(typeof data["version"] !== "string") throw 'Version is not a string';
        this.version = data["version"];
        if(typeof data["contractId"] !== "string") throw 'ContractId is not a string';
        this.contractId = data["contractId"];
        if(typeof data["modelId"] !== "string") throw 'ModelId is not a string';
        this.modelId = data["modelId"];
        if(typeof data["keyId"] !== "string") throw 'KeyId is not a string';
        this.keyId = data["keyId"];

        if(!data["params"]) throw 'Params is null';
        this.params = new PolicyParameters(data["params"]);
        
    }
    toBytes(){
        let d = [
            TideMemory.CreateFromArray([
                StringToUint8Array(this.version),
                StringToUint8Array(this.contractId),
                StringToUint8Array(this.modelId),
                StringToUint8Array(this.keyId),
                this.params.toBytes()
        ])];
        
        return TideMemory.CreateFromArray(d);
    }
}

export class PolicyParameters {
    params : Map<string, any>;
    constructor(data: Map<string, any>) {
        this.params = new Map(data);
    }

    toBytes(): Uint8Array {
        let params = [];
        
        for (const [key, value] of this.params) {
            const nameBytes = StringToUint8Array(key);
            let dataBytes, typeStr;
            
            if (typeof value === 'string') {
                dataBytes = StringToUint8Array(value);
                typeStr = "str";
            } else if (typeof value === 'number' && Number.isInteger(value)) {
                const buffer = new ArrayBuffer(4);
                const view = new DataView(buffer);
                view.setInt32(0, value, true); // little-endian
                dataBytes = new Uint8Array(buffer);
                typeStr = "num";
            } else if (typeof value === 'bigint') {
                dataBytes = BigIntToByteArray(value);
                typeStr = "bnum";
            } else if (typeof value === 'boolean') {
                dataBytes = new Uint8Array([value ? 1 : 0]);
                typeStr = "bln";
            } else if (value instanceof Uint8Array) {
                dataBytes = value;
                typeStr = "byt";
            } else {
                throw new Error(
                    `Could not serialize key '${key}' of type '${typeof value}'`
                );
            }
            
            const typeBytes = StringToUint8Array(typeStr);
            const paramMemory = TideMemory.CreateFromArray([nameBytes, typeBytes, dataBytes]);
            params.push(paramMemory);
        }
        
        return TideMemory.CreateFromArray(params);
    }
}