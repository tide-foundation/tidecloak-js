import React, { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { PolicyCanvas } from './PolicyCanvas';
import { BlockPalette } from './BlockPalette';
import { PropertiesPanel } from './PropertiesPanel';
import { Select } from './Select';
import type { PolicyBlock, Model, CompileResult, Claim, ModelField } from '../../types';
import { PREDEFINED_MODELS } from '../../types';
import '../../style.css';
import { BigIntFromByteArray, CreateTideMemory, StringFromUint8Array, StringToUint8Array, WriteValue } from "../../modules/tide-js/Cryptide/Serialization";


import Policy from '../../modules/tide-js/Models/Policy';

export type PolicyBuilderHandle = {
  /** Latest Policy snapshot (rebuilt from current UI state) */
  getResult: () => Policy;
  /**
   * Compile and return a fresh Policy.
   * You can override IDs just for this call.
   */
  compile: (opts?: { contractId?: string; keyId?: string }) => Promise<Policy>;
  /** Reset UI and return a cleared Policy */
  reset: () => Policy;
};

interface PolicyBuilderProps {
  /** Optional prefill values for convenience; user can change them per-policy */
  initialContractId?: string;
  initialKeyId?: string;

  initialBlocks?: PolicyBlock[];
  models?: Model[];

  /** Receive a ready-to-sign Policy instance each time we (attempt to) compile or reset */
  onFinalResult?: (p: Policy) => void;
  /** Back-compat alias */
  onCompiled?: (p: Policy) => void;

  /** Dev/state panel passthrough (unchanged) */
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
};

export const PolicyBuilder = forwardRef<PolicyBuilderHandle, PolicyBuilderProps>(function PolicyBuilder(
  {
    initialContractId = '',
    initialKeyId = '',
    initialBlocks = [],
    models = PREDEFINED_MODELS,
    onFinalResult,
    onCompiled, // back-compat
    onStateChange,
  },
  ref
) {
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

  // IDs are now per-policy, editable in the UI
  const [contractId, setContractId] = useState<string>(initialContractId);
  const [keyId, setKeyId] = useState<string>(initialKeyId);

  const isCustomModel = selectedModel?.id === 'CustomModel:1';
  const effectiveModel =
    selectedModel?.id === 'CustomModel:1' && selectedModel
      ? { ...selectedModel, fields: customFields }
      : selectedModel;

  /** Pick the final source string: Advanced code > Compiled code > null */
  const getFinalSource = (result: CompileResult | null): string | null => {
    if (mode === 'advanced' && advancedCode.trim()) {
      return advancedCode.trim();
    }
    if (result?.success && result.generatedCode?.trim()) {
      return result.generatedCode.trim();
    }
    return null;
  };

  // For UI only: decide what code to show as the "final C#"
  const selectFinalCode = (result: CompileResult | null): string | null => getFinalSource(result);

  // Build a Policy via static helper using the CURRENT ids (or overrides)
  const buildPolicy = (result: CompileResult | null, overrides?: { contractId?: string; keyId?: string }): Policy => {
    const version = '1';
    const modelId = selectedModel?.id;
    if (!modelId) throw new Error("PolicyBuilder: 'modelId' is required to build Policy");

    const cid = overrides?.contractId ?? contractId; // contractId optional: Policy encodes empty bytes if ''
    const kid = overrides?.keyId ?? keyId;           // keyId required by Policy static builder

    if (!kid || kid.trim().length === 0) {
      throw new Error("PolicyBuilder: 'keyId' is required to build Policy");
    }

    // Construct the Policy (params from claims)
    const p = Policy.createPolicy(
      version,
      cid || undefined, // pass undefined to get empty byte array when omitted
      modelId,
      kid,
      claims
    );

    // Attach the final source (advanced>compiled) if we have one
    const src = getFinalSource(result);
    
    // create compilable code
    const compilable = new CreateTideMemory()
    WriteValue(compilable, 0, StringToUint8Array(src))
    WriteValue(compilable, 1, StringToUint8Array(entryType))
  };

  const publish = (p: Policy) => {
    onFinalResult?.(p);
    onCompiled?.(p);
  };

  // keep advanced mode only for custom model
  useEffect(() => {
    if (!isCustomModel && mode === 'advanced') setMode('simple');
  }, [isCustomModel, mode]);

  // emit dev state
  useEffect(() => {
    onStateChange?.({
      modelId: selectedModel?.id ?? null,
      claims,
      mode,
      blocks,
      code: advancedCode,
    });
  }, [selectedModel, claims, mode, blocks, advancedCode, onStateChange]);

  // ensure required fields populate claims
  useEffect(() => {
    if (!selectedModel) return;
    const needed = new Set((selectedModel.fields || []).filter(f => f.required).map(f => f.key));
    if (needed.size === 0) return;

    let changed = false;
    const next = [...claims];
    for (const k of needed) {
      if (!next.some(c => c.key === k)) {
        next.push({ key: k, value: '', type: 'string' });
        changed = true;
      }
    }
    if (changed) setClaims(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedModel]);

  // ✅ Enable compile for non-custom simple mode with zero blocks
  const canClickCompile =
    mode === 'advanced'
      ? !!advancedCode.trim()
      : (
          !isCustomModel /* default model: params-only allowed */ ||
          (isCustomModel && blocks.length > 0)
        );

  // compile action
  const doCompile = async (opts?: { contractId?: string; keyId?: string }): Promise<Policy> => {
    // ✅ Treat "nothing to compile" ONLY when:
    // - advanced with no code, or
    // - simple + custom model with zero blocks
    const nothingToCompile =
      (mode === 'advanced' && advancedCode.trim().length === 0) ||
      (mode === 'simple' && isCustomModel && blocks.length === 0);

    if (nothingToCompile) {
      const p = buildPolicy(null, opts);
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
  const doReset = (): Policy => {
    if (mode === 'simple') {
      setBlocks([]);
      setSelectedBlockId(null);
    } else {
      setAdvancedCode('');
    }
    setClaims([]);
    setCompileResult(null);
    setShowResult(false);

    const p = buildPolicy(null);
    publish(p);
    return p;
  };

  // imperative API
  useImperativeHandle(
    ref,
    (): PolicyBuilderHandle => ({
      getResult: () => buildPolicy(compileResult),
      compile: (opts) => doCompile(opts),
      reset: () => doReset(),
    }),
    [compileResult, contractId, keyId, selectedModel, claims, mode, blocks, advancedCode]
  );

  // UI handlers
  const handleCompileClick = async () => {
    await doCompile(); // uses current UI values for contractId/keyId
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
          </div>

          <button
            className="pb-button"
            onClick={handleCompileClick}
            disabled={isCompiling || !canClickCompile || !keyId.trim()}
            title={
              !keyId.trim()
                ? 'Enter a Key ID'
                : mode === 'advanced' && !advancedCode.trim()
                  ? 'Nothing to compile — add code first'
                  : mode === 'simple' && isCustomModel && blocks.length === 0
                    ? 'Nothing to compile — add blocks first'
                    : 'Compile'
            }
          >
            <Icons.Code />
            {isCompiling ? 'Compiling...' : 'Compile'}
          </button>

          <button
            className="pb-button pb-button-secondary"
            onClick={handleResetClick}
            disabled={(mode === 'simple' ? blocks.length === 0 : !advancedCode.trim()) && claims.length === 0}
          >
            <Icons.RotateCcw />
            Reset
          </button>
        </div>
      </div>

      <div className={`pb-builder-content ${!isCustomModel && mode === 'simple' ? 'pb-two-column' : mode === 'advanced' ? 'pb-two-column' : ''}`}>
        {isCustomModel && mode === 'simple' && (
          <div className="pb-builder-sidebar">
            <BlockPalette selectedModel={selectedModel} onAddBlock={handleAddBlock} />
          </div>
        )}

        <div className="pb-builder-main">
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
              <div className="pb-code-editor-header">
                <h3>C# Policy Code</h3>
                <p>Write your custom C# policy implementation</p>
              </div>
              <textarea
                className="pb-code-editor"
                value={advancedCode}
                onChange={(e) => setAdvancedCode(e.target.value)}
                placeholder={`using Ork.Forseti.Sdk;
using Ork.Shared.Models.Contracts;

public sealed class GeneratedPolicy : IAccessPolicy
{
    public PolicyDecision Authorize(AccessContext ctx)
    {
        // Write your policy logic here
        return PolicyDecision.Deny(&quot;Not implemented&quot;);
    }
}`}
                spellCheck={false}
              />
            </div>
          )}
        </div>

        <div className="pb-builder-sidebar">
          <PropertiesPanel
            selectedBlock={selectedBlock}
            selectedModel={effectiveModel}
            claims={claims}
            onClaimsChange={setClaims}
            onBlockUpdate={handleBlockUpdate}
            allBlocks={blocks}
            customFields={customFields}
            onCustomFieldsChange={setCustomFields}
            isCustomModel={isCustomModel}
            mode={mode}
            advancedCode={advancedCode}
          />
        </div>
      </div>

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
});
