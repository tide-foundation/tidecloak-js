import React, {
  useState,
  useEffect,
  forwardRef,
  useImperativeHandle,
  useMemo,
} from 'react';
import { PolicyCanvas } from './PolicyCanvas';
import { BlockPalette } from './BlockPalette';
import { PropertiesPanel } from './PropertiesPanel';
import { Select } from './Select';
import type { PolicyBlock, Model, CompileResult, Claim, ModelField } from '../../types';
import { PREDEFINED_MODELS } from '../../types';
import '../../style.css';

import { bytesToBase64, StringToUint8Array } from '../../serialization/Utils';
import { TideMemory } from '../../serialization/TideMemory';
import { Policy, PolicyParameters } from '../../serialization/Policy';
import { BaseTideRequest } from "heimdall-tide";

// Only Forseti is supported right now
type CompilableCodeType = 'Forseti';
const SUPPORTED_CODE_TYPES: CompilableCodeType[] = ['Forseti'];

// Default class name for simple mode generated code
const DEFAULT_ENTRY_TYPE = 'GeneratedPolicy';

// Find the first C# public class name in a snippet (very basic)
function extractClassName(code: string | null): string | null {
  if (!code) return null;
  const m = code.match(/\bpublic\s+(?:sealed\s+)?class\s+([A-Za-z_][A-Za-z0-9_]*)/);
  return m ? m[1] : null;
}

// Ensure the generated code uses the desired class name for the public class
function ensureClassName(code: string, desired: string): string {
  const m = code.match(/\bpublic\s+(?:sealed\s+)?class\s+([A-Za-z_][A-Za-z0-9_]*)/);
  if (!m) return code;
  const current = m[1];
  if (current === desired) return code;
  return code.replace(
    new RegExp(`\\bpublic\\s+(?:sealed\\s+)?class\\s+${current}\\b`),
    (full) => full.replace(current, desired)
  );
}

export type PolicyBuilderHandle = {
  getResult: () => BaseTideRequest;
  compile: (opts?: { contractId?: string; keyId?: string }) => Promise<BaseTideRequest>;
  reset: () => BaseTideRequest;
};

interface PolicyBuilderProps {
  initialContractId?: string;
  initialKeyId?: string;

  initialBlocks?: PolicyBlock[];
  models?: Model[];

  onFinalResult?: (p: BaseTideRequest) => void;
  onCompiled?: (p: BaseTideRequest) => void;

  onStateChange?: (s: {
    modelId: string | null;
    claims: Claim[];
    mode: 'simple' | 'advanced';
    blocks: PolicyBlock[];
    code: string;
  }) => void;
}

// Inline SVG Icons
const Icons = {
  Code: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="16 18 22 12 16 6"></polyline>
      <polyline points="8 6 2 12 8 18"></polyline>
    </svg>
  ),
  RotateCcw: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="1 4 1 10 7 10"></polyline>
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
    </svg>
  ),
  ChevronDown: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="6 9 12 15 18 9"></polyline>
    </svg>
  ),
  ChevronUp: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="18 15 12 9 6 15"></polyline>
    </svg>
  ),
  Copy: () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="9" y="9" width="13" height="13"></rect>
      <rect x="2" y="2" width="13" height="13"></rect>
    </svg>
  ),
  ArrowUp: () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="18 15 12 9 6 15"></polyline>
    </svg>
  ),
  ArrowDown: () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="6 9 12 15 18 9"></polyline>
    </svg>
  ),
  X: () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
};

type PayloadItem = { id: string; value: string; collapsed?: boolean };

const PolicyBuilderImpl: React.ForwardRefRenderFunction<
  PolicyBuilderHandle,
  PolicyBuilderProps
> = (
  {
    initialContractId = '',
    initialKeyId = '',
    initialBlocks = [],
    models = PREDEFINED_MODELS,
    onFinalResult,
    onCompiled,
    onStateChange,
  },
  ref
) => {
  const [blocks, setBlocks] = useState<PolicyBlock[]>(initialBlocks);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<Model | null>(models[0] || null);
  const [compileResult, setCompileResult] = useState<CompileResult | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [customFields, setCustomFields] = useState<ModelField[]>([]);
  const [mode, setMode] = useState<'simple' | 'advanced'>('simple');
  const [advancedCode, setAdvancedCode] = useState<string>('');
  const [isCompiling, setIsCompiling] = useState(false);

  // IDs are per-policy
  const [contractId, setContractId] = useState<string>(initialContractId);
  const [keyId, setKeyId] = useState<string>(initialKeyId);

  // entryType & code type
  const [entryType, setEntryType] = useState<string>(DEFAULT_ENTRY_TYPE);
  const [codeType, setCodeType] = useState<CompilableCodeType>('Forseti');

  // Payload: multiple free-form values
  const [payloadItems, setPayloadItems] = useState<PayloadItem[]>([]);
  const [payloadError, setPayloadError] = useState<string | null>(null);

  // Guard feedback banner
  const [claimGuardMsg, setClaimGuardMsg] = useState<string | null>(null);

  const isCustomModel = selectedModel?.id === 'CustomModel:1';
  const effectiveModel =
    selectedModel?.id === 'CustomModel:1' && selectedModel
      ? { ...selectedModel, fields: customFields }
      : selectedModel;

  // Required keys
  const requiredKeys = useMemo((): Set<string> => {
    const fields = effectiveModel?.fields || [];
    return new Set(fields.filter(f => f.required).map(f => f.key));
  }, [effectiveModel]);

  const getFinalSource = (result: CompileResult | null): string | null => {
    if (mode === 'advanced' && advancedCode.trim()) {
      return advancedCode.trim();
    }
    if (result?.success && result.generatedCode?.trim()) {
      const src = result.generatedCode.trim();
      return ensureClassName(src, entryType || DEFAULT_ENTRY_TYPE);
    }
    return null;
  };
  const selectFinalCode = (result: CompileResult | null): string | null => getFinalSource(result);

  // Parse a single payload string into a JS value: JSON → boolean/number → string
  const parseOneValue = (rawIn: string): unknown => {
    const raw = rawIn.trim();
    if (!raw) return ''; // preserve empty as empty string
    try {
      return JSON.parse(raw);
    } catch {
      const lower = raw.toLowerCase();
      if (lower === 'true') return true;
      if (lower === 'false') return false;
      const asNum = Number(raw);
      if (!Number.isNaN(asNum) && raw.match(/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/)) {
        return asNum;
      }
      return raw; // string
    }
  };

  // Convert a JS value to bytes (object/array → JSON, primitives → text)
  const valueToBytes = (v: unknown): Uint8Array => {
    if (v === null) return StringToUint8Array('null');
    const t = typeof v;
    if (t === 'string') return StringToUint8Array(v as string);
    if (t === 'number' || t === 'boolean') return StringToUint8Array(String(v));
    return StringToUint8Array(JSON.stringify(v)); // objects/arrays
  };

  // Build a Policy (stable ordering)
  const buildPolicy = (result: CompileResult | null, overrides?: { contractId?: string; keyId?: string }): BaseTideRequest => {
    const version = '1';
    const modelId = selectedModel?.id;
    if (!modelId) throw new Error("PolicyBuilder: 'modelId' is required to build Policy");

    const cid = overrides?.contractId ?? contractId;
    const kid = overrides?.keyId ?? keyId;

    if (!kid || kid.trim().length === 0) {
      throw new Error("PolicyBuilder: 'keyId' is required to build Policy");
    }

    // claims → PolicyParameters
    let params: PolicyParameters;
    const obj: Map<string, any> = new Map();
    for (const c of claims) obj.set(c.key, c.value);
    params = new PolicyParameters(obj);

    const policy_bytes = new Policy({
      version,
      contractId: cid,
      modelId,
      keyId: kid,
      params: params.params,
    }).toBytes();

    const src = getFinalSource(result);

    if (!codeType) throw new Error('Missing required data: codeType');
    const compilableT = [StringToUint8Array(codeType)];

    if (src) {
      let langPayload: TideMemory;

      // Build payload array memory from payloadItems (if any)
      const payloadArray: Uint8Array[] = [];
      payloadItems.forEach((item, idx) => {
        const parsed = parseOneValue(item.value);
        payloadArray.push(valueToBytes(parsed));
      });
      

      if (codeType === 'Forseti') {
        if (!entryType || !entryType.trim()) throw new Error('Entry Type is required for Forseti');

        // [0]=source, [1]=entryType, [2]=payloadArray]
        langPayload = TideMemory.CreateFromArray([
          StringToUint8Array(src),
          StringToUint8Array(entryType.trim()),
          TideMemory.CreateFromArray(payloadArray)
        ]);
      } else {
        throw Error("Not implemented for code types not Forseti");
      }

      compilableT.push(langPayload);
    }

    const draft_bytes = TideMemory.CreateFromArray([policy_bytes, TideMemory.CreateFromArray(compilableT)]);

    const policySignRequest = new BaseTideRequest("Policy", "1", "Policy:1", draft_bytes, new TideMemory());
    return policySignRequest;
  };

  const publish = (p: BaseTideRequest) => {
    onFinalResult?.(p);
    onCompiled?.(p);
  };

  // Keep advanced mode only for custom model
  useEffect(() => {
    if (!isCustomModel && mode === 'advanced') setMode('simple');
  }, [isCustomModel, mode]);

  // Emit dev state
  useEffect(() => {
    onStateChange?.({
      modelId: selectedModel?.id ?? null,
      claims,
      mode,
      blocks,
      code: advancedCode,
    });
  }, [selectedModel, claims, mode, blocks, advancedCode, onStateChange]);

  // Ensure required fields populate claims
  useEffect(() => {
    if (requiredKeys.size === 0) return;
    let changed = false;
    const next = [...claims];
    for (const k of requiredKeys) {
      if (!next.some(c => c.key === k)) {
        next.push({ key: k, value: '', type: 'string' });
        changed = true;
      }
    }
    if (changed) setClaims(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requiredKeys]);

  // Keep entryType aligned with mode
  useEffect(() => {
    if (mode === 'simple') {
      setEntryType(prev => (prev && prev.trim() ? prev : DEFAULT_ENTRY_TYPE));
    }
  }, [mode]);

  // Validation helpers
  const validateAdvancedClassName = (): string | null => {
    if (mode !== 'advanced') return null;
    if (!advancedCode.trim()) return 'No code to compile';
    const cls = extractClassName(advancedCode);
    if (!entryType.trim()) return 'Enter a class name (entryType)';
    if (!cls) return 'Could not find a public class in your code';
    if (cls !== entryType.trim()) {
      return `Class name mismatch. Code has "${cls}" but entryType is "${entryType.trim()}"`;
    }
    return null;
  };

  // HARD GUARD: reject updates that remove required claims
  const handleClaimsChange = (proposed: Claim[]) => {
    const missing = [...requiredKeys].filter(k => !proposed.some(c => c.key === k));
    if (missing.length > 0) {
      setClaimGuardMsg(`Required claim${missing.length > 1 ? 's' : ''} ${missing.join(', ')} cannot be removed.`);
      return;
    }
    const map = new Map<string, Claim>();
    for (const c of proposed) map.set(c.key, c);
    setClaims(Array.from(map.values()));
    if (claimGuardMsg) setClaimGuardMsg(null);
  };

  // compile enablement
  const canClickCompile =
    mode === 'advanced'
      ? !!advancedCode.trim() && !!entryType.trim() && !validateAdvancedClassName()
      : (!isCustomModel || (isCustomModel && blocks.length > 0));

  // compile action
  const doCompile = async (opts?: { contractId?: string; keyId?: string }): Promise<BaseTideRequest> => {
    // No strict validation: payload items accept "anything"
    setPayloadError(null);

    if (mode === 'advanced') {
      const err = validateAdvancedClassName();
      if (err) {
        const fail: CompileResult = { success: false, message: err, errors: [err] };
        setCompileResult(fail);
        setShowResult(true);
        const p = buildPolicy(fail, opts);
        publish(p);
        return p;
      }
    }

    const nothingToCompile =
      (mode === 'advanced' && advancedCode.trim().length === 0) ||
      (mode === 'simple' && !isCustomModel && blocks.length === 0);

    if (nothingToCompile) {
      const p = buildPolicy(null, opts);
      try { console.log(bytesToBase64(p.encode())); } catch {}
      setCompileResult(null);
      setShowResult(true);
      publish(p);
      return p;
    }

    setIsCompiling(true);
    try {
      const { compilePolicy } = await import('../../compilePolicy');
      const result: CompileResult = await compilePolicy(
        mode,
        mode === 'simple' ? blocks : undefined,
        mode === 'advanced' ? advancedCode : undefined,
        claims,
        'csharp'
      );

      if (result?.success && result.generatedCode && mode === 'simple') {
        result.generatedCode = ensureClassName(result.generatedCode, entryType || DEFAULT_ENTRY_TYPE);
      }

      setCompileResult(result);
      setShowResult(true);
      const p = buildPolicy(result, opts);
      publish(p);
      return p;
    } catch (error) {
      console.error('Compilation failed:', error);
      const fail: CompileResult = {
        success: false,
        message: 'Compilation failed',
        errors: [error instanceof Error ? error.message : 'Unknown error'],
      };
      setCompileResult(fail);
      setShowResult(true);
      const p = buildPolicy(fail, opts);
      publish(p);
      return p;
    } finally {
      setIsCompiling(false);
    }
  };

  // reset action
  const doReset = (): BaseTideRequest => {
    if (mode === 'simple') {
      setBlocks([]);
      setSelectedBlockId(null);
      setEntryType(DEFAULT_ENTRY_TYPE);
    } else {
      setAdvancedCode('');
    }
    setClaims([]);
    setCompileResult(null);
    setShowResult(false);
    setPayloadItems([]);
    setPayloadError(null);

    const p = buildPolicy(null);
    publish(p);
    return p;
  };

  useImperativeHandle(
    ref,
    (): PolicyBuilderHandle => ({
      getResult: () => buildPolicy(compileResult),
      compile: (opts) => doCompile(opts),
      reset: () => doReset(),
    }),
    [compileResult, contractId, keyId, selectedModel, claims, mode, blocks, advancedCode, entryType, codeType, payloadItems]
  );

  // Payload UI helpers
  const addPayloadItem = () => {
    setPayloadItems(prev => [
      ...prev,
      { id: Math.random().toString(36).slice(2), value: '', collapsed: false },
    ]);
  };
  const duplicatePayloadItem = (id: string) => {
    setPayloadItems(prev => {
      const idx = prev.findIndex(e => e.id === id);
      if (idx < 0) return prev;
      const dup = { ...prev[idx], id: Math.random().toString(36).slice(2) };
      const next = [...prev];
      next.splice(idx + 1, 0, dup);
      return next;
    });
  };
  const movePayloadItem = (id: string, dir: -1 | 1) => {
    setPayloadItems(prev => {
      const idx = prev.findIndex(e => e.id === id);
      if (idx < 0) return prev;
      const t = idx + dir;
      if (t < 0 || t >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(idx, 1);
      next.splice(t, 0, item);
      return next;
    });
  };
  const removePayloadItem = (id: string) => setPayloadItems(prev => prev.filter(e => e.id !== id));
  const updatePayloadItem = (id: string, value: string) =>
    setPayloadItems(prev => prev.map(e => (e.id === id ? { ...e, value } : e)));
  const toggleCollapsedItem = (id: string) =>
    setPayloadItems(prev => prev.map(e => (e.id === id ? { ...e, collapsed: !e.collapsed } : e)));
  const setAllCollapsed = (collapsed: boolean) =>
    setPayloadItems(prev => prev.map(e => ({ ...e, collapsed })));

  // UI handlers
  const handleCompileClick = async () => {
    await doCompile();
  };
  const handleResetClick = () => {
    const msg = mode === 'simple'
      ? 'Are you sure you want to reset the policy? This will remove all blocks.'
      : 'Are you sure you want to reset the policy? This will clear all code.';
    if (confirm(msg)) doReset();
  };
  const handleAddBlock = (block: PolicyBlock) => setBlocks(prev => [...prev, block]);
  const handleBlockUpdate = (updatedBlock: PolicyBlock) =>
    setBlocks(prev => prev.map(b => (b.id === updatedBlock.id ? updatedBlock : b)));
  const selectedBlock = blocks.find(b => b.id === selectedBlockId) || null;

  return (
    <div className="pb-policy-builder">
      {/* Guard messages */}
      {claimGuardMsg && (
        <div className="pb-alert pb-alert-warning" role="alert">
          {claimGuardMsg}
        </div>
      )}
      {payloadError && (
        <div className="pb-alert pb-alert-error" role="alert">
          {payloadError}
        </div>
      )}

      {/* HEADER */}
      <div className="pb-builder-header">
        <div className="pb-header-content">
          <h1>Policy Builder</h1>
          <p>Visual access control designer</p>
        </div>

        <div className="pb-header-actions">
          <div className="pb-mode-tabs">
            <button
              className={`pb-mode-tab ${mode === 'simple' ? 'active' : ''}`}
              onClick={() => setMode('simple')}
            >
              Visual Builder
            </button>
            <button
              className={`pb-mode-tab ${mode === 'advanced' ? 'active' : ''} ${!isCustomModel ? 'disabled' : ''}`}
              onClick={() => { if (isCustomModel) setMode('advanced'); }}
              disabled={!isCustomModel}
              title={!isCustomModel ? 'Advanced Code is only available for Custom Model' : ''}
            >
              Advanced Code
            </button>
          </div>

          <Select
            value={selectedModel}
            options={models}
            onChange={setSelectedModel}
            getLabel={(m) => m.name}
            getValue={(m) => m.id}
            placeholder="Select a model"
          />

          <div className="pb-inline-fields">
            <input
              className="pb-input"
              placeholder="Contract ID (optional)"
              value={contractId}
              onChange={(e) => setContractId(e.target.value)}
            />
            <input
              className="pb-input"
              placeholder="Key ID (required)"
              value={keyId}
              onChange={(e) => setKeyId(e.target.value)}
            />
            {/* EntryType removed from top bar; it's in the right panel */}
            <select
              className="pb-input"
              value={codeType}
              onChange={(e) => setCodeType(e.target.value as CompilableCodeType)}
              title="Compilable code type"
            >
              {SUPPORTED_CODE_TYPES.map(t => (
                <option value={t} key={t}>{t}</option>
              ))}
            </select>
          </div>

          <button
            className="pb-button"
            onClick={handleCompileClick}
            disabled={isCompiling || !canClickCompile || !keyId.trim()}
            title={
              !keyId.trim()
                ? 'Enter a Key ID'
                : mode === 'advanced' && !advancedCode.trim()
                  ? 'Nothing to compile. Add code first'
                  : mode === 'advanced' && validateAdvancedClassName() ? validateAdvancedClassName() || ''
                  : mode === 'simple' && isCustomModel && blocks.length === 0
                    ? 'Nothing to compile. Add blocks first'
                    : 'Compile'
            }
          >
            <Icons.Code />
            {isCompiling ? 'Compiling...' : 'Compile'}
          </button>

          <button
            className="pb-button pb-button-secondary"
            onClick={handleResetClick}
            disabled={(mode === 'simple' ? blocks.length === 0 : !advancedCode.trim()) && claims.length === 0 && payloadItems.length === 0}
          >
            <Icons.RotateCcw />
            Reset
          </button>
        </div>
      </div>

      {/* CONTENT GRID */}
      <div className={`pb-builder-content ${!isCustomModel && mode === 'simple' ? 'pb-two-column' : mode === 'advanced' ? 'pb-two-column' : ''}`}>
        {/* LEFT SIDEBAR */}
        {isCustomModel && mode === 'simple' && (
          <aside className="pb-builder-sidebar">
            <section className="pb-section">
              <header className="pb-section-header centered">
                <h3>Blocks</h3>
              </header>
              <div className="pb-section-body pb-scroll-area">
                <BlockPalette selectedModel={selectedModel} onAddBlock={handleAddBlock} />
              </div>
            </section>
          </aside>
        )}

        {/* MAIN */}
        <main className="pb-builder-main">
          <section className="pb-section">
            <header className="pb-section-header centered">
              <h3>{mode === 'simple' ? 'Canvas' : 'C# Policy Code'}</h3>
            </header>
            <div className="pb-section-body pb-scroll-area">
              {mode === 'simple' ? (
                <PolicyCanvas
                  blocks={blocks}
                  selectedBlockId={selectedBlockId}
                  onBlockSelect={setSelectedBlockId}
                  onBlocksChange={setBlocks}
                  isDefaultModel={!isCustomModel}
                  modelName={selectedModel?.name || ''}
                />
              ) : (
                <div className="pb-code-editor-container">
                  <div className="pb-code-editor-header centered">
                    <p>Write your custom C# policy implementation</p>
                  </div>
                  <textarea
                    className="pb-code-editor"
                    value={advancedCode}
                    onChange={(e) => setAdvancedCode(e.target.value)}
                    placeholder={`using Ork.Forseti.Sdk;
using Ork.Shared.Models.Contracts;

public sealed class ${DEFAULT_ENTRY_TYPE} : IAccessPolicy
{
    public PolicyDecision Authorize(AccessContext ctx)
    {
        // Write your policy logic here
        return PolicyDecision.Deny("Not implemented");
    }
}`}
                    spellCheck={false}
                  />
                </div>
              )}
            </div>
          </section>
        </main>

        {/* RIGHT SIDEBAR */}
        <aside className="pb-builder-sidebar">
          {/* Forseti Settings */}
          {codeType === 'Forseti' && (
            <section className="pb-section">
              <header className="pb-section-header centered">
                <h3>Compilation Settings (Forseti)</h3>
              </header>
              <div className="pb-section-body">
                <div className="pb-form-fields">
                  <div className="pb-form-field">
                    <label className="pb-label">Entry Type (required)</label>
                    <input
                      className="pb-input"
                      value={entryType}
                      onChange={(e) => setEntryType(e.target.value)}
                      placeholder="Public class name (e.g., GeneratedPolicy)"
                      required
                    />
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Payload (multiple values) */}
          <section className="pb-section">
            <header className="pb-section-header centered">
              <h3>Payload (values)</h3>
              <p className="pb-helper-text">
                Add as many values as you like — strings, numbers, booleans, objects, arrays. Objects/arrays are serialized as JSON. Order is preserved.
              </p>
            </header>

            <div className="pb-section-body">
              <div className="pb-properties-header-with-action" style={{ marginTop: 0 }}>
                <div />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="pb-button" onClick={addPayloadItem}>Add value</button>
                  <button className="pb-button pb-button-secondary" onClick={() => setAllCollapsed(true)} disabled={payloadItems.length === 0}>Collapse all</button>
                  <button className="pb-button pb-button-secondary" onClick={() => setAllCollapsed(false)} disabled={payloadItems.length === 0}>Expand all</button>
                </div>
              </div>

              {payloadItems.length === 0 ? (
                <div className="pb-claims-empty">
                  <p>No payload values. Click “Add value”.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 360, overflow: 'auto', paddingRight: 4 }}>
                  {payloadItems.map((it, idx) => {
                    const isCollapsed = !!it.collapsed;
                    return (
                      <div key={it.id} className="pb-claim-card">
                        {/* header */}
                        <div
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', gap: 8 }}
                          onClick={() => toggleCollapsedItem(it.id)}
                          title={isCollapsed ? 'Expand' : 'Collapse'}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                            {isCollapsed ? <Icons.ChevronDown /> : <Icons.ChevronUp />}
                            <div style={{ fontWeight: 600, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              Value {idx + 1}
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                            <button className="pb-button-icon-small" title="Duplicate" onClick={(e) => { e.stopPropagation(); duplicatePayloadItem(it.id); }}>
                              <Icons.Copy />
                            </button>
                            <button className="pb-button-icon-small" title="Move up" onClick={(e) => { e.stopPropagation(); movePayloadItem(it.id, -1 as -1); }} disabled={idx === 0}>
                              <Icons.ArrowUp />
                            </button>
                            <button className="pb-button-icon-small" title="Move down" onClick={(e) => { e.stopPropagation(); movePayloadItem(it.id, 1 as 1); }} disabled={idx === payloadItems.length - 1}>
                              <Icons.ArrowDown />
                            </button>
                            <button className="pb-button-icon-small" title="Remove" onClick={(e) => { e.stopPropagation(); removePayloadItem(it.id); }}>
                              <Icons.X />
                            </button>
                          </div>
                        </div>

                        {/* body */}
                        {!isCollapsed && (
                          <div style={{ marginTop: 8 }}>
                            <textarea
                              className="pb-code-editor"
                              style={{ minHeight: 90 }}
                              value={it.value}
                              onChange={(e) => updatePayloadItem(it.id, e.target.value)}
                              placeholder={`Examples:
"hello"
42
true
{"region":"eu-west-1","features":["a","b"]}
[1,2,3]`}
                              spellCheck={false}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          {/* Model / Claims / Live preview handled inside PropertiesPanel */}
          <section className="pb-section">
            <header className="pb-section-header centered">
              <h3>Properties</h3>
            </header>
            <div className="pb-section-body pb-scroll-area">
              <PropertiesPanel
                selectedBlock={blocks.find(b => b.id === selectedBlockId) || null}
                selectedModel={effectiveModel}
                claims={claims}
                onClaimsChange={handleClaimsChange}
                onBlockUpdate={(b) => {
                  setBlocks(prev => prev.map(x => x.id === b.id ? b : x));
                }}
                allBlocks={blocks}
                customFields={customFields}
                onCustomFieldsChange={setCustomFields}
                isCustomModel={isCustomModel}
                mode={mode}
                advancedCode={advancedCode}
              />
            </div>
          </section>
        </aside>
      </div>

      {/* RESULTS */}
      {showResult && (
        <div className="pb-builder-results">
          <div className="pb-results-header">
            <h3>Final Code</h3>
            <button className="pb-button pb-button-small pb-button-secondary" onClick={() => setShowResult(false)}>
              Hide
            </button>
          </div>

          {compileResult?.success ? (
            <div className="pb-results-success">
              <p>Compilation successful.</p>
              <div className="pb-result-section">
                <h4>Final C#</h4>
                <pre data-testid="pb-generated-code">
                  <code>{selectFinalCode(compileResult) ?? ''}</code>
                </pre>
              </div>
            </div>
          ) : (
            <div className="pb-results-error">
              <p>{compileResult ? compileResult.message : 'Nothing to compile'}</p>
              {compileResult?.errors && compileResult.errors.length > 0 && (
                <ul>{compileResult.errors.map((e, i) => (<li key={i}>{e}</li>))}</ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const PolicyBuilder = forwardRef(PolicyBuilderImpl);
export { BaseTideRequest };
