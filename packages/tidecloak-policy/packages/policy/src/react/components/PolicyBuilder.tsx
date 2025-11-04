import { useState, useEffect } from 'react';
import { PolicyCanvas } from './PolicyCanvas';
import { BlockPalette } from './BlockPalette';
import { PropertiesPanel } from './PropertiesPanel';
import { Select } from './Select';
import type { PolicyBlock, Model, CompileResult, Claim, ModelField } from '../../types';
import { PREDEFINED_MODELS } from '../../types';
import '../../style.css';

interface PolicyBuilderProps {
  initialBlocks?: PolicyBlock[];
  models?: Model[];
}

// Inline SVG Icons
const Icons = {
  ChevronDown: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="6 9 12 15 18 9"></polyline>
    </svg>
  ),
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

export function PolicyBuilder({ 
  initialBlocks = [], 
  models = PREDEFINED_MODELS 
}: PolicyBuilderProps) {
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

  // Check if current model is Custom Model
  const isCustomModel = selectedModel?.id === 'CustomModel:1';

  // Update model with custom fields when custom model is selected
  const effectiveModel = selectedModel?.id === 'CustomModel:1' && selectedModel
    ? { ...selectedModel, fields: customFields }
    : selectedModel;

  // Effect: Revert to simple mode when switching away from Custom Model
  useEffect(() => {
    if (!isCustomModel && mode === 'advanced') {
      setMode('simple');
    }
  }, [isCustomModel, mode]);

  const handleCompile = async () => {
    setIsCompiling(true);
    try {
      // Import the client-side compiler
      const { compilePolicy } = await import('../../compilePolicy');
      
      const result = await compilePolicy(
        mode,
        mode === 'simple' ? blocks : undefined,
        mode === 'advanced' ? advancedCode : undefined,
        claims,
        'csharp'
      );
      
      setCompileResult(result);
      setShowResult(true);
    } catch (error) {
      console.error('Compilation failed:', error);
      setCompileResult({
        success: false,
        message: 'Compilation failed',
        errors: [error instanceof Error ? error.message : 'Unknown error'],
      });
      setShowResult(true);
    } finally {
      setIsCompiling(false);
    }
  };

  const handleReset = () => {
    const message = mode === 'simple' 
      ? 'Are you sure you want to reset the policy? This will remove all blocks.'
      : 'Are you sure you want to reset the policy? This will clear all code.';
    
    if (confirm(message)) {
      if (mode === 'simple') {
        setBlocks([]);
        setSelectedBlockId(null);
      } else {
        setAdvancedCode('');
      }
      setClaims([]);
      setCompileResult(null);
      setShowResult(false);
    }
  };

  const handleAddBlock = (block: PolicyBlock) => {
    setBlocks([...blocks, block]);
  };

  const handleBlockUpdate = (updatedBlock: PolicyBlock) => {
    setBlocks(blocks.map(block => 
      block.id === updatedBlock.id ? updatedBlock : block
    ));
  };

  const selectedBlock = blocks.find(b => b.id === selectedBlockId) || null;

  return (
    <div className="pb-policy-builder">
      {/* Header */}
      <div className="pb-builder-header">
        <div className="pb-header-content">
          <h1>Policy Builder</h1>
          <p>Visual access control designer</p>
        </div>
        
        <div className="pb-header-actions">
          {/* Mode Tabs */}
          <div className="pb-mode-tabs">
            <button
              className={`pb-mode-tab ${mode === 'simple' ? 'active' : ''}`}
              onClick={() => setMode('simple')}
            >
              Visual Builder
            </button>
            <button
              className={`pb-mode-tab ${mode === 'advanced' ? 'active' : ''} ${!isCustomModel ? 'disabled' : ''}`}
              onClick={() => {
                if (isCustomModel) {
                  setMode('advanced');
                }
              }}
              disabled={!isCustomModel}
              title={!isCustomModel ? 'Advanced Code is only available for Custom Model' : ''}
            >
              Advanced Code
            </button>
          </div>

          {/* Model Selector */}
          <Select
            value={selectedModel}
            options={models}
            onChange={setSelectedModel}
            getLabel={(model) => model.name}
            getValue={(model) => model.id}
            placeholder="Select a model"
          />
          
          <button 
            className="pb-button" 
            onClick={handleCompile}
            disabled={isCompiling || (mode === 'simple' ? blocks.length === 0 : !advancedCode.trim())}
          >
            <Icons.Code />
            {isCompiling ? 'Compiling...' : 'Compile'}
          </button>
          
          <button 
            className="pb-button pb-button-secondary"
            onClick={handleReset}
            disabled={mode === 'simple' ? blocks.length === 0 : !advancedCode.trim()}
          >
            <Icons.RotateCcw />
            Reset
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className={`pb-builder-content ${!isCustomModel && mode === 'simple' ? 'pb-two-column' : mode === 'advanced' ? 'pb-two-column' : ''}`}>
        {/* Left: Block Palette (only for Custom Model in simple mode) */}
        {isCustomModel && mode === 'simple' && (
          <div className="pb-builder-sidebar">
            <BlockPalette 
              selectedModel={selectedModel}
              onAddBlock={handleAddBlock}
            />
          </div>
        )}

        {/* Center: Canvas or Code Editor */}
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
                placeholder="using Ork.Forseti.Sdk;&#10;using Ork.Shared.Models.Contracts;&#10;&#10;public sealed class GeneratedPolicy : IAccessPolicy&#10;{&#10;    public PolicyDecision Authorize(AccessContext ctx)&#10;    {&#10;        // Write your policy logic here&#10;        return PolicyDecision.Deny(&quot;Not implemented&quot;);&#10;    }&#10;}"
                spellCheck={false}
              />
            </div>
          )}
        </div>

        {/* Right: Properties Panel */}
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

      {/* Compile Results */}
      {showResult && compileResult && (
        <div className="pb-builder-results">
          <div className="pb-results-header">
            <h3>Compilation Results</h3>
            <button
              className="pb-button pb-button-small pb-button-secondary"
              onClick={() => setShowResult(false)}
            >
              Hide
            </button>
          </div>
          
          {compileResult.success ? (
            <div className="pb-results-success">
              <p>{compileResult.message}</p>
              
              {compileResult.plainEnglish && (
                <div className="pb-result-section">
                  <h4>Plain English</h4>
                  <pre>{compileResult.plainEnglish}</pre>
                </div>
              )}
              
              {compileResult.generatedCode && (
                <div className="pb-result-section">
                  <h4>Generated Code</h4>
                  <pre><code>{compileResult.generatedCode}</code></pre>
                </div>
              )}
            </div>
          ) : (
            <div className="pb-results-error">
              <p>{compileResult.message}</p>
              {compileResult.errors && compileResult.errors.length > 0 && (
                <ul>
                  {compileResult.errors.map((error, i) => (
                    <li key={i}>{error}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
