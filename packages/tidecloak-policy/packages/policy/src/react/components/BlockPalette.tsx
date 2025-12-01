import type { PolicyBlock, Model } from '../../types';
import '../../style.css';

interface BlockPaletteProps {
  selectedModel: Model | null;
  onAddBlock: (block: PolicyBlock) => void;
}

const BLOCK_CATEGORIES = {
  conditions: {
    label: 'Conditions',
    blocks: [
      {
        type: 'condition' as const,
        label: 'Check Field',
        description: 'Compare a field value',
      },
    ],
  },
  decisions: {
    label: 'Decisions',
    blocks: [
      {
        type: 'if_else' as const,
        label: 'If/Else',
        description: 'Branch based on conditions',
      },
    ],
  },
  logic: {
    label: 'Logic Operators',
    blocks: [
      {
        type: 'logic_and' as const,
        label: 'AND',
        description: 'All conditions must be true',
      },
      {
        type: 'logic_or' as const,
        label: 'OR',
        description: 'At least one condition must be true',
      },
      {
        type: 'logic_not' as const,
        label: 'NOT',
        description: 'Invert the condition',
      },
    ],
  },
  actions: {
    label: 'Actions',
    blocks: [
      {
        type: 'action_allow' as const,
        label: 'Allow',
        description: 'Grant access',
      },
      {
        type: 'action_deny' as const,
        label: 'Deny',
        description: 'Deny access',
      },
    ],
  },
};

export function BlockPalette({ selectedModel, onAddBlock }: BlockPaletteProps) {
  const createBlock = (type: PolicyBlock['type']): PolicyBlock => {
    const baseBlock = {
      id: crypto.randomUUID(),
      type,
      config: {},
      order: Date.now(),
    };

    switch (type) {
      case 'condition':
        return { ...baseBlock, config: { field: '', operator: 'equals', value: '' } };
      case 'if_else':
        return { ...baseBlock, config: { description: 'Decision point' }, thenBlocks: [], elseBlocks: [] };
      case 'logic_and':
      case 'logic_or':
      case 'logic_not':
        return { ...baseBlock, config: {}, children: [] };
      case 'action_allow':
        return { ...baseBlock, config: { message: 'Access granted' } };
      case 'action_deny':
        return { ...baseBlock, config: { message: 'Access denied' } };
      default:
        return baseBlock;
    }
  };

  const handleDragStart = (e: React.DragEvent, type: PolicyBlock['type']) => {
    const block = createBlock(type);
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('application/json', JSON.stringify({
      blockType: type,
      newBlock: block,
    }));
  };

  const handleClick = (type: PolicyBlock['type']) => {
    const block = createBlock(type);
    onAddBlock(block);
  };

  return (
    <div className="pb-palette">
      <div className="pb-palette-header">
        <h3>Block Palette</h3>
        <p>Drag blocks to the canvas or click to add</p>
      </div>

      {!selectedModel && (
        <div className="pb-palette-warning">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
          <span>Select a model first</span>
        </div>
      )}

      <div className="pb-palette-categories">
        {Object.entries(BLOCK_CATEGORIES).map(([key, category]) => (
          <div key={key} className="pb-palette-category">
            <h4 className="pb-category-title">{category.label}</h4>
            <div className="pb-category-blocks">
              {category.blocks.map((blockTemplate) => (
                <button
                  key={blockTemplate.type}
                  className={`minimal-palette-block minimal-block-${blockTemplate.type}`}
                  draggable={!!selectedModel}
                  onDragStart={(e) => handleDragStart(e, blockTemplate.type)}
                  onClick={() => selectedModel && handleClick(blockTemplate.type)}
                  disabled={!selectedModel}
                  title={blockTemplate.description}
                >
                  <div className="pb-palette-block-label">{blockTemplate.label}</div>
                  <div className="pb-palette-block-desc">{blockTemplate.description}</div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
