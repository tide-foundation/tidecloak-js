export interface UploadPolicyResponse {
  bh: string;
  entryType: string;
}

export interface ValidateAccessResponse {
  allowed: boolean;
  error?: string | null;
  gas?: number;
}

export interface UploadAndValidateResponse {
  allowed: boolean;
  error?: string | null;
  gas?: number;
  bh?: string;
  entryType?: string;
  contractId?: string;
}

export type Claims = Record<string, unknown>;

export default class ClientBase {
  protected url: string;
  protected sessionKeyPrivateRaw?: Uint8Array;
  protected sessionKeyPublicEncoded?: string;
  protected token?: string;

  constructor(url: string) {
    this.url = url;
  }

  protected _createFormData(
    form: Record<string, string | Blob | (string | Blob)[]>
  ): FormData {
    const formData = new FormData();
    Object.entries(form).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) formData.append(`${key}[${i}]`, value[i]);
      } else {
        formData.append(key, value);
      }
    });
    return formData;
  }

  protected async _get(
    endpoint: string,
    timeout = 20000,
    signal: AbortSignal | null = null
  ): Promise<Response> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    let response: Response;
    try {
      response = await fetch(this.url + endpoint, {
        method: "GET",
        signal: signal ?? controller.signal,
      });
      clearTimeout(id);
    } catch {
      throw Error("enclave.networkFailure");
    }
    if (!response.ok) throw Error("Ork.Exceptions.Network.StatusException");
    return response;
  }

  protected async _getSilent(
    endpoint: string,
    timeout = 20000,
    signal: AbortSignal | null = null
  ): Promise<Response> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    let response: Response;
    try {
      response = await fetch(this.url + endpoint, {
        method: "GET",
        signal: signal ?? controller.signal,
      });
      clearTimeout(id);
    } catch {
      throw Error("enclave.networkFailure");
    }
    if (!response.ok) throw Error("Ork.Exceptions.Network.StatusException");
    return response;
  }

  protected async _post(
    endpoint: string,
    data: FormData,
    timeout = 20000
  ): Promise<Response> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    if (this.token) data.append("token", this.token);

    let response: Response;
    try {
      response = await fetch(this.url + endpoint, {
        method: "POST",
        body: data,
        signal: controller.signal,
      });
      clearTimeout(id);
    } catch {
      throw Error("enclave.networkFailure");
    }
    if (!response.ok) throw Error("Ork.Exceptions.Network.StatusException");
    return response;
  }

  protected async _put(endpoint: string, data: FormData): Promise<Response> {
    return fetch(this.url + endpoint, { method: "PUT", body: data });
  }

  protected async _postJSON(endpoint: string, data: unknown): Promise<Response> {
    return fetch(this.url + endpoint, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  }

  protected async _postSilent(
    endpoint: string,
    data: FormData,
    timeout = 20000
  ): Promise<Response> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    let response: Response;
    try {
      response = await fetch(this.url + endpoint, {
        method: "POST",
        body: data,
        signal: controller.signal,
      });
      clearTimeout(id);
    } catch {
      throw Error("enclave.networkFailure");
    }
    return response;
  }

  protected async _handleError(
    response: Response,
    functionName = "",
    throwError = false
  ): Promise<string> {
    let error = "";
    const responseData = await response.text();
    if (responseData.split(":")[0] === "--FAILED--") {
      console.error(responseData);
      error = responseData.split(":")[1];
    }
    if (error !== "") {
      if (throwError) throw Error(functionName + " " + error);
      else return Promise.reject(error);
    }
    return responseData;
  }

  protected async _handleErrorSimulator(response: Response): Promise<string> {
    let error = "";
    const responseData = await response.text();
    if (!response.ok) error = responseData;
    if (error !== "") return Promise.reject(error);
    return responseData;
  }

  AddBearerAuthorization(
    sessionKeyPrivate: Uint8Array,
    sessionKeyPublicEncoded: string,
    token: string
  ): this {
    this.sessionKeyPrivateRaw = sessionKeyPrivate;
    this.sessionKeyPublicEncoded = sessionKeyPublicEncoded;
    this.token = token;
    return this;
  }
}

export class ForsetiClient extends ClientBase {
  constructor(url: string) { super(url); }

  protected async _postJsonAndParse<T = unknown>(
    path: string,
    payload: unknown,
    label: string
  ): Promise<T | string> {
    const res = await this._postJSON(path, payload);
    const text = await this._handleError(res, label);
    try { return JSON.parse(text) as T; }
    catch { return text; }
  }

  async UploadPolicySource(
    vendorId: string,
    modelId: string,
    uploadedBy: string,
    entryType: string,
    sdkVersion: string,
    source: string
  ): Promise<UploadPolicyResponse | string> {
    return await this._postJsonAndParse<UploadPolicyResponse>(
      `/Forseti/Upload/source`,
      { vendorId, modelId, uploadedBy, entryType, sdkVersion, source },
      "Forseti Upload Source"
    );
  }

  async UploadPolicyDll(
    vendorId: string,
    modelId: string,
    uploadedBy: string,
    entryType: string,
    sdkVersion: string,
    dllBase64: string
  ): Promise<UploadPolicyResponse | string> {
    return await this._postJsonAndParse<UploadPolicyResponse>(
      `/Forseti/Upload/dll`,
      { vendorId, modelId, uploadedBy, entryType, sdkVersion, dllBase64 },
      "Forseti Upload DLL"
    );
  }

  async ValidateAccess(
    vvkid: string,
    modelId: string,
    contractId: string,
    resource: string,
    action: string,
    claims: Claims
  ): Promise<ValidateAccessResponse> {
    try {
      const res = await this._postJSON(`/Forseti/Gate/validate`, {
        vvkid, modelId, contractId, resource, action, claims,
      });
      const text = await this._handleError(res, "Forseti Validate");
      let obj: ValidateAccessResponse | null;
      try { obj = JSON.parse(text) as ValidateAccessResponse; }
      catch { obj = null; }
      if (!obj || typeof obj.allowed !== "boolean") return { allowed: false, error: "BadResponse" };
      if (obj.error && obj.error.length) return { allowed: false, error: obj.error };
      return obj;
    } catch (e: unknown) {
      const err = e as { message?: string };
      return { allowed: false, error: err?.message || "Validate.Failed" };
    }
  }

  async GetForsetiSdkVersion(): Promise<string> {
    const res = await this._get(`/Forseti/Meta/sdk-version`);
    const text = await res.text();
    if (!res.ok || !text) throw new Error("Failed to get Forseti SDK version");
    return text.trim();
  }

  /** Unified API */
  async UploadAndValidate(payload: {
    vvkid: string;
    modelId: string;
    resource: string;
    action: string;
    claims: Claims;
    contractId?: string;
    vendorId?: string;
    uploadedBy?: string;
    entryType?: string;
    sdkVersion?: string;
    source?: string;
    dllBase64?: string;
  }): Promise<UploadAndValidateResponse> {
    const res = await this._postJSON(`/Forseti/Gate/upload-validate`, payload);
    const text = await this._handleError(res, "Forseti UploadAndValidate");
    try { return JSON.parse(text) as UploadAndValidateResponse; }
    catch { return { allowed: false, error: "BadResponse" }; }
  }
}
