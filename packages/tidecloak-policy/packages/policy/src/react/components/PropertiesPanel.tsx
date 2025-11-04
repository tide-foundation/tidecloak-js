import { useState, useEffect } from 'react';
import { Select } from './Select';
import type { PolicyBlock, Claim, Model, CompileResult, ModelField } from '../../types';
import '../../style.css';

// Inline SVG Icons
const Icons = {
  Settings: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3"></circle>
      <path d="M12 1v6m0 6v6m5.66-13.66l-4.24 4.24m0 6.36l4.24 4.24m5.66-9.9h-6m-6 0H1m13.66 5.66l-4.24-4.24m0-6.36l4.24-4.24"></path>
    </svg>
  ),
  FileText: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
      <polyline points="14 2 14 8 20 8"></polyline>
      <line x1="16" y1="13" x2="8" y2="13"></line>
      <line x1="16" y1="17" x2="8" y2="17"></line>
      <polyline points="10 9 9 9 8 9"></polyline>
    </svg>
  ),
  Plus: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="5" x2="12" y2="19"></line>
      <line x1="5" y1="12" x2="19" y2="12"></line>
    </svg>
  ),
  X: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
  ),
  Code: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="16 18 22 12 16 6"></polyline>
      <polyline points="8 6 2 12 8 18"></polyline>
    </svg>
  ),
  Database: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path>
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>
    </svg>
  ),
};

interface PropertiesPanelProps {
  selectedBlock: PolicyBlock | null;
  selectedModel: Model | null;
  claims: Claim[];
  onClaimsChange: (claims: Claim[]) => void;
  onBlockUpdate: (block: PolicyBlock) => void;
  allBlocks: PolicyBlock[];
  customFields?: ModelField[];
  onCustomFieldsChange?: (fields: ModelField[]) => void;
  isCustomModel?: boolean;
  mode?: 'simple' | 'advanced';
  advancedCode?: string;
}

export function PropertiesPanel({
  selectedBlock,
  selectedModel,
  claims,
  onClaimsChange,
  onBlockUpdate,
  allBlocks,
  customFields = [],
  onCustomFieldsChange,
  isCustomModel = false,
  mode = 'simple',
  advancedCode = '',
}: PropertiesPanelProps) {
  const [liveCode, setLiveCode] = useState<string | undefined>(undefined);
  const [plainEnglish, setPlainEnglish] = useState<string | undefined>(undefined);
  const [isGenerating, setIsGenerating] = useState(false);
  const [customFieldInput, setCustomFieldInput] = useState('');
  const [newCustomFieldName, setNewCustomFieldName] = useState('');
  const [newCustomFieldType, setNewCustomFieldType] = useState<'string' | 'array' | 'object'>('string');

  // Generate live code preview
  useEffect(() => {
    const generateLiveCode = async () => {
      // Skip if no model selected
      if (!selectedModel) {
        setLiveCode(undefined);
        setPlainEnglish(undefined);
        return;
      }

      // Skip if in simple mode with no blocks
      if (mode === 'simple' && (!allBlocks || allBlocks.length === 0)) {
        setLiveCode(undefined);
        setPlainEnglish(undefined);
        return;
      }

      // Skip if in advanced mode with no code
      if (mode === 'advanced' && !advancedCode.trim()) {
        setLiveCode(undefined);
        setPlainEnglish(undefined);
        return;
      }

      setIsGenerating(true);
      try {
        // Import the client-side compiler
        const { compilePolicy } = await import('../../compilePolicy');
        
        const result: CompileResult = await compilePolicy(
          mode,
          allBlocks,
          advancedCode,
          claims,
          'csharp'
        );

        if (result.success) {
          setLiveCode(result.generatedCode);
          setPlainEnglish(result.plainEnglish);
        } else {
          setLiveCode(undefined);
          setPlainEnglish(undefined);
        }
      } catch (error) {
        setLiveCode(undefined);
        setPlainEnglish(undefined);
      } finally {
        setIsGenerating(false);
      }
    };

    const debounce = setTimeout(generateLiveCode, 300);
    return () => clearTimeout(debounce);
  }, [allBlocks, selectedModel, claims, mode, advancedCode]);

  const handleAddClaim = () => {
    onClaimsChange([
      ...claims,
      { key: '', value: '', type: 'string' },
    ]);
  };

  const handleUpdateClaim = (index: number, field: keyof Claim, value: any) => {
    const updated = [...claims];
    updated[index] = { ...updated[index], [field]: value };
    onClaimsChange(updated);
  };

  const handleRemoveClaim = (index: number) => {
    onClaimsChange(claims.filter((_, i) => i !== index));
  };

  const handleBlockConfigUpdate = (field: string, value: any) => {
    if (!selectedBlock) return;

    const updatedBlock = {
      ...selectedBlock,
      config: {
        ...selectedBlock.config,
        [field]: value,
      },
    };

    onBlockUpdate(updatedBlock);
  };

  const getFieldOptions = () => {
    if (!selectedModel) return [];
    return selectedModel.fields.map((f) => ({
      value: f.key,
      label: f.label,
      type: f.type,
      options: f.options,
    }));
  };

  const operatorOptions = [
    { value: 'equals', label: 'Equals' },
    { value: 'not_equals', label: 'Not Equals' },
    { value: 'contains', label: 'Contains' },
    { value: 'not_contains', label: 'Not Contains' },
    { value: 'greater_than', label: 'Greater Than' },
    { value: 'less_than', label: 'Less Than' },
  ];

  return (
    <div className="pb-properties-panel-container">
      {/* Plain English Summary - "What You Created" */}
      {plainEnglish && (
        <div className="pb-properties-section">
          <div className="pb-properties-header">
            <Icons.FileText />
            <h3>What You Created</h3>
          </div>
          <div className="pb-summary-card">
            <p>{plainEnglish}</p>
          </div>
          <p className="pb-helper-text">
            This is a plain English description of your policy
          </p>
        </div>
      )}

      {/* Block Properties */}
      {selectedBlock ? (
        <div className="pb-properties-section">
          <div className="pb-properties-header">
            <Icons.Settings />
            <h3>Block Properties</h3>
          </div>

          {/* Condition Block */}
          {selectedBlock.type === 'condition' && (
            <div className="pb-form-fields">
              <div className="pb-form-field">
                <label htmlFor="field">Field</label>
                {selectedModel ? (
                  <>
                    <Select
                      value={getFieldOptions().find((f) => f.value === selectedBlock.config.field) || null}
                      options={[...getFieldOptions(), { value: 'custom', label: 'Custom field...', type: 'string', options: undefined }]}
                      onChange={(option) => {
                        if (option.value === 'custom') {
                          setCustomFieldInput('');
                          handleBlockConfigUpdate('field', '');
                        } else {
                          handleBlockConfigUpdate('field', option.value);
                        }
                      }}
                      getLabel={(option) => option.label}
                      getValue={(option) => option.value}
                      placeholder="Select field..."
                    />
                    {selectedBlock.config.field === '' && (
                      <div style={{ marginTop: '8px' }}>
                        <input
                          type="text"
                          className="pb-input"
                          placeholder="Enter custom field name..."
                          value={customFieldInput}
                          onChange={(e) => {
                            setCustomFieldInput(e.target.value);
                            handleBlockConfigUpdate('field', e.target.value);
                          }}
                        />
                      </div>
                    )}
                  </>
                ) : (
                  <input
                    id="field"
                    type="text"
                    className="pb-input"
                    placeholder="e.g., stage, sub, roles"
                    value={selectedBlock.config.field || ''}
                    onChange={(e) => handleBlockConfigUpdate('field', e.target.value)}
                  />
                )}
              </div>

              <div className="pb-form-field">
                <label htmlFor="operator">Operator</label>
                <Select
                  value={operatorOptions.find((o) => o.value === (selectedBlock.config.operator || 'equals')) || operatorOptions[0]}
                  options={operatorOptions}
                  onChange={(option) => handleBlockConfigUpdate('operator', option.value)}
                  getLabel={(option) => option.label}
                  getValue={(option) => option.value}
                  placeholder="Select operator..."
                />
              </div>

              <div className="pb-form-field">
                <label htmlFor="value">Value</label>
                <input
                  id="value"
                  type="text"
                  className="pb-input"
                  placeholder="Enter value..."
                  value={selectedBlock.config.value || ''}
                  onChange={(e) => handleBlockConfigUpdate('value', e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Decision Block (if_else) */}
          {selectedBlock.type === 'if_else' && (
            <div className="pb-form-fields">
              <div className="pb-form-field">
                <label htmlFor="description">Decision Description</label>
                <input
                  id="description"
                  type="text"
                  className="pb-input"
                  placeholder="Describe this decision..."
                  value={selectedBlock.config.description || ''}
                  onChange={(e) => handleBlockConfigUpdate('description', e.target.value)}
                />
              </div>

              <div className="pb-help-card">
                <p className="pb-help-title">How to use:</p>
                <p>1. Drag <strong>Condition</strong> blocks into the <strong className="pb-text-success">If</strong> branch</p>
                <p>2. Drag <strong>Action</strong> blocks (Allow/Deny) into each branch</p>
                <p>3. Use <strong>AND/OR</strong> to combine multiple conditions</p>
              </div>

              <div className="pb-help-divider">
                <p>
                  When conditions are true → <strong className="pb-text-success">If</strong> path.
                  When false → <strong className="pb-text-warning">Else</strong> path.
                </p>
              </div>
            </div>
          )}

          {/* Action Blocks (Allow/Deny) */}
          {(selectedBlock.type === 'action_allow' || selectedBlock.type === 'action_deny') && (
            <div className="pb-form-fields">
              <div className="pb-form-field">
                <label htmlFor="message">Message</label>
                <input
                  id="message"
                  type="text"
                  className="pb-input"
                  placeholder="Enter message..."
                  value={selectedBlock.config.message || ''}
                  onChange={(e) => handleBlockConfigUpdate('message', e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Logic Blocks (AND/OR/NOT) */}
          {selectedBlock.type.startsWith('logic_') && (
            <div className="pb-help-card">
              <p>
                This logic operator will apply to blocks positioned before and after it in the flow.
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="pb-properties-empty-state">
          <Icons.Settings />
          <p>Select a block to edit its properties</p>
        </div>
      )}

      {/* Custom Model Fields Manager */}
      {isCustomModel && onCustomFieldsChange && (
        <div className="pb-properties-section">
          <div className="pb-properties-header-with-action">
            <div>
              <Icons.Database />
              <h3>Custom Fields</h3>
              <p className="pb-helper-text">Define fields for your custom model</p>
            </div>
          </div>

          <div className="pb-form-fields">
            <div className="pb-form-field">
              <label>Field Name</label>
              <input
                type="text"
                className="pb-input"
                placeholder="e.g., userId, role, department"
                value={newCustomFieldName}
                onChange={(e) => setNewCustomFieldName(e.target.value)}
              />
            </div>

            <div className="pb-form-field">
              <label>Field Type</label>
              <Select
                value={{ value: newCustomFieldType, label: newCustomFieldType.charAt(0).toUpperCase() + newCustomFieldType.slice(1) }}
                options={[
                  { value: 'string', label: 'String' },
                  { value: 'array', label: 'Array' },
                  { value: 'object', label: 'Object' },
                ]}
                onChange={(option) => setNewCustomFieldType(option.value as 'string' | 'array' | 'object')}
                getLabel={(option) => option.label}
                getValue={(option) => option.value}
                placeholder="Select type..."
              />
            </div>

            <button
              className="pb-button"
              onClick={() => {
                if (newCustomFieldName.trim()) {
                  const newField: ModelField = {
                    key: newCustomFieldName.trim(),
                    type: newCustomFieldType,
                    label: newCustomFieldName.trim(),
                  };
                  onCustomFieldsChange([...customFields, newField]);
                  setNewCustomFieldName('');
                }
              }}
              disabled={!newCustomFieldName.trim()}
            >
              <Icons.Plus />
              Add Field
            </button>
          </div>

          {customFields.length > 0 && (
            <div className="pb-claims-list" style={{ marginTop: '16px' }}>
              {customFields.map((field, index) => (
                <div key={index} className="pb-claim-card">
                  <div className="pb-claim-header">
                    <label>{field.label} ({field.type})</label>
                    <button
                      className="pb-button-icon-small"
                      onClick={() => {
                        onCustomFieldsChange(customFields.filter((_, i) => i !== index));
                      }}
                      title="Remove field"
                    >
                      <Icons.X />
                    </button>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--pb-text-tertiary)' }}>
                    Key: {field.key}
                  </div>
                </div>
              ))}
            </div>
          )}

          {customFields.length === 0 && (
            <div className="pb-claims-empty">
              <p>No custom fields defined. Add fields to use in your policies.</p>
            </div>
          )}
        </div>
      )}

      {/* Claims Configuration */}
      <div className="pb-properties-section minimal-claims-section">
        <div className="pb-properties-header-with-action">
          <div>
            <h3>Test Claims</h3>
            <p className="pb-helper-text">
              {!isCustomModel 
                ? 'Configure access rules by setting field values (e.g., stage=validate, role=admin)'
                : 'Define claims for testing your policy logic'}
            </p>
          </div>
          <button
            className="pb-button-icon"
            onClick={handleAddClaim}
            title="Add claim"
          >
            <Icons.Plus />
            Add
          </button>
        </div>

        <div className="pb-claims-list">
          {claims.length === 0 ? (
            <div className="pb-claims-empty">
              <p>
                {!isCustomModel 
                  ? '👆 Click "Add" to define your first access rule. Each claim represents a field-value pair that controls access.'
                  : 'No claims defined. Add claims to test your policy.'}
              </p>
            </div>
          ) : (
            claims.map((claim, index) => (
              <div key={index} className="pb-claim-card">
                <div className="pb-claim-header">
                  <label>Claim {index + 1}</label>
                  <button
                    className="pb-button-icon-small"
                    onClick={() => handleRemoveClaim(index)}
                    title="Remove claim"
                  >
                    <Icons.X />
                  </button>
                </div>
                {selectedModel && selectedModel.fields.length > 0 ? (
                  <Select
                    value={getFieldOptions().find(f => f.value === claim.key) || null}
                    options={getFieldOptions()}
                    onChange={(option) => handleUpdateClaim(index, 'key', option?.value || '')}
                    getLabel={(option) => option.label}
                    getValue={(option) => option.value}
                    placeholder="Select field..."
                  />
                ) : (
                  <input
                    type="text"
                    className="pb-input minimal-input-small"
                    placeholder="Key (e.g., stage)"
                    value={claim.key}
                    onChange={(e) => handleUpdateClaim(index, 'key', e.target.value)}
                  />
                )}
                <input
                  type="text"
                  className="pb-input minimal-input-small"
                  placeholder="Value (e.g., validate)"
                  value={claim.value}
                  onChange={(e) => handleUpdateClaim(index, 'value', e.target.value)}
                />
              </div>
            ))
          )}
        </div>
      </div>

      {/* Live Code Preview */}
      {((mode === 'simple' && allBlocks && allBlocks.length > 0) || (mode === 'advanced' && advancedCode.trim())) && (
        <div className="pb-properties-section minimal-code-preview-section">
          <div className="pb-properties-header">
            <Icons.Code />
            <h3>Live Code Preview</h3>
          </div>
          {isGenerating ? (
            <div className="pb-code-loading">
              <p>Generating code...</p>
            </div>
          ) : liveCode ? (
            <pre className="pb-code-preview">
              <code>{liveCode}</code>
            </pre>
          ) : (
            <div className="pb-code-empty">
              <p>{mode === 'simple' ? 'Configure blocks to see generated code' : 'Enter code to see preview'}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
