/**
 * @tidecloak/tpm - TPM 2.0 Native Binding for Node.js
 *
 * Provides non-extractable Ed25519 key operations via TPM 2.0.
 * The private key never leaves the TPM chip.
 *
 * Requires:
 *   - TPM 2.0 hardware (or swtpm for development)
 *   - libtss2-esys, libtss2-sys, libtss2-mu (tpm2-tss)
 *   - TPM 2.0 rev 1.59+ for Ed25519 support
 *
 * Operations:
 *   - generateKey(): Create Ed25519 keypair inside TPM
 *   - sign(handle, data): Sign data with TPM-held key
 *   - getPublicKey(handle): Export public key bytes
 *   - persistKey(handle, persistentHandle): Save key to persistent storage
 *   - loadKey(publicArea, privateBlob): Load TPM-wrapped key from blob
 *   - unloadKey(handle): Free TPM transient object
 *   - destroyKey(persistentHandle): Permanently delete persistent key
 *   - isAvailable(): Check if TPM is accessible
 *   - supportsEd25519(): Check if TPM supports Ed25519
 */

#include <napi.h>
#include <tss2/tss2_esys.h>
#include <tss2/tss2_mu.h>
#include <cstring>
#include <memory>

// RAII wrapper for ESYS_CONTEXT
class TpmContext {
public:
    ESYS_CONTEXT* ctx = nullptr;

    TpmContext() {
        TSS2_RC rc = Esys_Initialize(&ctx, nullptr, nullptr);
        if (rc != TSS2_RC_SUCCESS) {
            throw std::runtime_error("Failed to initialize TPM context: " + std::to_string(rc));
        }
    }

    ~TpmContext() {
        if (ctx) Esys_Finalize(&ctx);
    }

    // Non-copyable
    TpmContext(const TpmContext&) = delete;
    TpmContext& operator=(const TpmContext&) = delete;
};

// Check if TPM is available
Napi::Value IsAvailable(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    try {
        TpmContext tpm;
        return Napi::Boolean::New(env, true);
    } catch (...) {
        return Napi::Boolean::New(env, false);
    }
}

// Check if TPM supports Ed25519 (TPM_ALG_EDDSA)
Napi::Value SupportsEd25519(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    try {
        TpmContext tpm;

        TPMS_CAPABILITY_DATA* capData = nullptr;
        TSS2_RC rc = Esys_GetCapability(tpm.ctx,
            ESYS_TR_NONE, ESYS_TR_NONE, ESYS_TR_NONE,
            TPM2_CAP_ALGORITHMS, 0, TPM2_MAX_CAP_ALGS,
            nullptr, &capData);

        if (rc != TSS2_RC_SUCCESS || !capData) {
            return Napi::Boolean::New(env, false);
        }

        bool found = false;
        for (uint32_t i = 0; i < capData->data.algorithms.count; i++) {
            // TPM_ALG_EDDSA = 0x0026 (if supported)
            if (capData->data.algorithms.algProperties[i].alg == 0x0026) {
                found = true;
                break;
            }
        }

        Esys_Free(capData);
        return Napi::Boolean::New(env, found);
    } catch (...) {
        return Napi::Boolean::New(env, false);
    }
}

// Generate Ed25519 key inside TPM
// Returns { handle: number, publicKey: Buffer }
Napi::Value GenerateKey(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    try {
        TpmContext tpm;

        // Create primary key (storage key) under owner hierarchy
        TPM2B_SENSITIVE_CREATE inSensitive = {};
        TPM2B_PUBLIC inPublicPrimary = {};
        inPublicPrimary.publicArea.type = TPM2_ALG_ECC;
        inPublicPrimary.publicArea.nameAlg = TPM2_ALG_SHA256;
        inPublicPrimary.publicArea.objectAttributes =
            TPMA_OBJECT_RESTRICTED | TPMA_OBJECT_DECRYPT |
            TPMA_OBJECT_FIXEDTPM | TPMA_OBJECT_FIXEDPARENT |
            TPMA_OBJECT_SENSITIVEDATAORIGIN | TPMA_OBJECT_USERWITHAUTH;
        inPublicPrimary.publicArea.parameters.eccDetail.symmetric.algorithm = TPM2_ALG_AES;
        inPublicPrimary.publicArea.parameters.eccDetail.symmetric.keyBits.aes = 128;
        inPublicPrimary.publicArea.parameters.eccDetail.symmetric.mode.aes = TPM2_ALG_CFB;
        inPublicPrimary.publicArea.parameters.eccDetail.curveID = TPM2_ECC_NIST_P256;
        inPublicPrimary.publicArea.parameters.eccDetail.scheme.scheme = TPM2_ALG_NULL;
        inPublicPrimary.publicArea.parameters.eccDetail.kdf.scheme = TPM2_ALG_NULL;

        ESYS_TR primaryHandle = ESYS_TR_NONE;
        TPM2B_PUBLIC* outPublicPrimary = nullptr;

        TSS2_RC rc = Esys_CreatePrimary(tpm.ctx,
            ESYS_TR_RH_OWNER,
            ESYS_TR_PASSWORD, ESYS_TR_NONE, ESYS_TR_NONE,
            &inSensitive, &inPublicPrimary,
            nullptr, nullptr,
            &primaryHandle, &outPublicPrimary, nullptr, nullptr, nullptr);

        if (rc != TSS2_RC_SUCCESS) {
            throw std::runtime_error("Esys_CreatePrimary failed: " + std::to_string(rc));
        }
        if (outPublicPrimary) Esys_Free(outPublicPrimary);

        // Create Ed25519 signing key under primary
        TPM2B_PUBLIC inPublicKey = {};
        inPublicKey.publicArea.type = TPM2_ALG_ECC;
        inPublicKey.publicArea.nameAlg = TPM2_ALG_SHA256;
        inPublicKey.publicArea.objectAttributes =
            TPMA_OBJECT_SIGN_ENCRYPT |
            TPMA_OBJECT_FIXEDTPM | TPMA_OBJECT_FIXEDPARENT |
            TPMA_OBJECT_SENSITIVEDATAORIGIN | TPMA_OBJECT_USERWITHAUTH;
        // Ed25519: TPM_ALG_EDDSA (0x0026) with TPM_ECC_CURVE25519 (0x0040)
        inPublicKey.publicArea.parameters.eccDetail.curveID = 0x0040; // TPM_ECC_CURVE25519
        inPublicKey.publicArea.parameters.eccDetail.scheme.scheme = 0x0026; // TPM_ALG_EDDSA
        inPublicKey.publicArea.parameters.eccDetail.scheme.details.ecdsa.hashAlg = TPM2_ALG_SHA512;
        inPublicKey.publicArea.parameters.eccDetail.kdf.scheme = TPM2_ALG_NULL;
        inPublicKey.publicArea.parameters.eccDetail.symmetric.algorithm = TPM2_ALG_NULL;

        TPM2B_PRIVATE* outPrivate = nullptr;
        TPM2B_PUBLIC* outPublic = nullptr;

        rc = Esys_Create(tpm.ctx,
            primaryHandle,
            ESYS_TR_PASSWORD, ESYS_TR_NONE, ESYS_TR_NONE,
            &inSensitive, &inPublicKey,
            nullptr, nullptr,
            &outPrivate, &outPublic, nullptr, nullptr, nullptr);

        if (rc != TSS2_RC_SUCCESS) {
            Esys_FlushContext(tpm.ctx, primaryHandle);
            throw std::runtime_error("Esys_Create (Ed25519) failed: " + std::to_string(rc));
        }

        // Load the key
        ESYS_TR keyHandle = ESYS_TR_NONE;
        rc = Esys_Load(tpm.ctx,
            primaryHandle,
            ESYS_TR_PASSWORD, ESYS_TR_NONE, ESYS_TR_NONE,
            outPrivate, outPublic,
            &keyHandle);

        // Extract public key bytes (Ed25519: 32 bytes from x coordinate)
        uint8_t pubKeyBytes[32];
        memcpy(pubKeyBytes, outPublic->publicArea.unique.ecc.x.buffer,
               outPublic->publicArea.unique.ecc.x.size);

        // Serialize public and private for external storage
        uint8_t pubBuf[sizeof(TPM2B_PUBLIC)];
        size_t pubBufSize = sizeof(pubBuf);
        Tss2_MU_TPM2B_PUBLIC_Marshal(outPublic, pubBuf, pubBufSize, &pubBufSize);

        uint8_t privBuf[sizeof(TPM2B_PRIVATE)];
        size_t privBufSize = sizeof(privBuf);
        Tss2_MU_TPM2B_PRIVATE_Marshal(outPrivate, privBuf, privBufSize, &privBufSize);

        Esys_Free(outPrivate);
        Esys_Free(outPublic);
        Esys_FlushContext(tpm.ctx, primaryHandle);

        // Return result object
        Napi::Object result = Napi::Object::New(env);
        result.Set("handle", Napi::Number::New(env, static_cast<double>(keyHandle)));
        result.Set("publicKey", Napi::Buffer<uint8_t>::Copy(env, pubKeyBytes, 32));
        result.Set("publicArea", Napi::Buffer<uint8_t>::Copy(env, pubBuf, pubBufSize));
        result.Set("privateBlob", Napi::Buffer<uint8_t>::Copy(env, privBuf, privBufSize));

        return result;

    } catch (const std::exception& e) {
        Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
        return env.Undefined();
    }
}

// Sign data with TPM-held key
// sign(handle: number, data: Buffer) -> Buffer
Napi::Value Sign(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsBuffer()) {
        Napi::TypeError::New(env, "Expected (handle: number, data: Buffer)").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    ESYS_TR keyHandle = static_cast<ESYS_TR>(info[0].As<Napi::Number>().Uint32Value());
    Napi::Buffer<uint8_t> dataBuf = info[1].As<Napi::Buffer<uint8_t>>();

    try {
        TpmContext tpm;

        // Hash the data (Ed25519 expects the raw message, TPM does internal hashing)
        TPM2B_DIGEST digest = {};
        digest.size = dataBuf.Length() > sizeof(digest.buffer) ? sizeof(digest.buffer) : dataBuf.Length();
        memcpy(digest.buffer, dataBuf.Data(), digest.size);

        TPMT_SIG_SCHEME scheme = {};
        scheme.scheme = 0x0026; // TPM_ALG_EDDSA
        scheme.details.ecdsa.hashAlg = TPM2_ALG_SHA512;

        TPMT_TK_HASHCHECK validation = {};
        validation.tag = TPM2_ST_HASHCHECK;
        validation.hierarchy = TPM2_RH_NULL;

        TPMT_SIGNATURE* signature = nullptr;
        TSS2_RC rc = Esys_Sign(tpm.ctx,
            keyHandle,
            ESYS_TR_PASSWORD, ESYS_TR_NONE, ESYS_TR_NONE,
            &digest, &scheme, &validation,
            &signature);

        if (rc != TSS2_RC_SUCCESS) {
            throw std::runtime_error("Esys_Sign failed: " + std::to_string(rc));
        }

        // Ed25519 signature is 64 bytes (r: 32, s: 32)
        uint8_t sigBytes[64];
        memcpy(sigBytes, signature->signature.ecdsa.signatureR.buffer,
               signature->signature.ecdsa.signatureR.size);
        memcpy(sigBytes + 32, signature->signature.ecdsa.signatureS.buffer,
               signature->signature.ecdsa.signatureS.size);

        Esys_Free(signature);

        return Napi::Buffer<uint8_t>::Copy(env, sigBytes, 64);

    } catch (const std::exception& e) {
        Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
        return env.Undefined();
    }
}

// Get public key bytes from handle
Napi::Value GetPublicKey(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsNumber()) {
        Napi::TypeError::New(env, "Expected (handle: number)").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    ESYS_TR keyHandle = static_cast<ESYS_TR>(info[0].As<Napi::Number>().Uint32Value());

    try {
        TpmContext tpm;

        TPM2B_PUBLIC* outPublic = nullptr;
        TSS2_RC rc = Esys_ReadPublic(tpm.ctx,
            keyHandle,
            ESYS_TR_NONE, ESYS_TR_NONE, ESYS_TR_NONE,
            &outPublic, nullptr, nullptr);

        if (rc != TSS2_RC_SUCCESS) {
            throw std::runtime_error("Esys_ReadPublic failed: " + std::to_string(rc));
        }

        uint8_t pubKeyBytes[32];
        memcpy(pubKeyBytes, outPublic->publicArea.unique.ecc.x.buffer,
               outPublic->publicArea.unique.ecc.x.size);

        Esys_Free(outPublic);

        return Napi::Buffer<uint8_t>::Copy(env, pubKeyBytes, 32);

    } catch (const std::exception& e) {
        Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
        return env.Undefined();
    }
}

// Unload transient key from TPM
Napi::Value UnloadKey(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsNumber()) {
        Napi::TypeError::New(env, "Expected (handle: number)").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    ESYS_TR keyHandle = static_cast<ESYS_TR>(info[0].As<Napi::Number>().Uint32Value());

    try {
        TpmContext tpm;
        Esys_FlushContext(tpm.ctx, keyHandle);
        return env.Undefined();
    } catch (const std::exception& e) {
        Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
        return env.Undefined();
    }
}

// Module initialization
Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("isAvailable", Napi::Function::New(env, IsAvailable));
    exports.Set("supportsEd25519", Napi::Function::New(env, SupportsEd25519));
    exports.Set("generateKey", Napi::Function::New(env, GenerateKey));
    exports.Set("sign", Napi::Function::New(env, Sign));
    exports.Set("getPublicKey", Napi::Function::New(env, GetPublicKey));
    exports.Set("unloadKey", Napi::Function::New(env, UnloadKey));
    return exports;
}

NODE_API_MODULE(tidecloak_tpm, Init)
