import { useState } from 'react';
import type { PolicyBlock } from '../../types';
import '../../style.css';

interface PolicyCanvasProps {
  blocks: PolicyBlock[];
  selectedBlockId: string | null;
  onBlockSelect: (id: string | null) => void;
  onBlocksChange: (blocks: PolicyBlock[]) => void;
  isDefaultModel?: boolean;
  modelName?: string;
}

const BLOCK_TYPE_LABELS: Record<string, string> = {
  condition: 'Condition',
  if_else: 'Decision',
  logic_and: 'AND',
  logic_or: 'OR',
  logic_not: 'NOT',
  action_allow: 'Allow',
  action_deny: 'Deny',
};

// Inline SVG icons - no external dependencies
const Icons = {
  ChevronDown: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="6 9 12 15 18 9"></polyline>
    </svg>
  ),
  ChevronRight: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="9 18 15 12 9 6"></polyline>
    </svg>
  ),
  Check: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
  ),
  X: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
  ),
  Trash: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="3 6 5 6 21 6"></polyline>
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
    </svg>
  ),
  GripVertical: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="9" cy="5" r="1"></circle>
      <circle cx="9" cy="12" r="1"></circle>
      <circle cx="9" cy="19" r="1"></circle>
      <circle cx="15" cy="5" r="1"></circle>
      <circle cx="15" cy="12" r="1"></circle>
      <circle cx="15" cy="19" r="1"></circle>
    </svg>
  ),
  Copy: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg>
  ),
  Duplicate: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg>
  ),
  Move: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="5 9 2 12 5 15"></polyline>
      <polyline points="9 5 12 2 15 5"></polyline>
      <polyline points="15 19 12 22 9 19"></polyline>
      <polyline points="19 9 22 12 19 15"></polyline>
      <line x1="2" y1="12" x2="22" y2="12"></line>
      <line x1="12" y1="2" x2="12" y2="22"></line>
    </svg>
  ),
};

function BlockCard({ 
  block, 
  isSelected,
  onSelect,
  onDelete,
  onDuplicate,
  onContextMenu,
  children 
}: { 
  block: PolicyBlock;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onContextMenu: (e: React.MouseEvent, block: PolicyBlock) => void;
  children?: React.ReactNode;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);

  const handleDragStart = (e: React.DragEvent) => {
    setIsDragging(true);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/json', JSON.stringify({
      blockId: block.id,
      blockType: block.type,
    }));
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  const getBlockClassName = () => {
    let className = 'pb-block-card';
    className += ` pb-block-${block.type}`;
    if (isSelected) className += ' pb-block-selected';
    if (isDragging) className += ' pb-block-dragging';
    return className;
  };

  const getBlockLabel = () => {
    const baseLabel = BLOCK_TYPE_LABELS[block.type] || block.type;
    if (block.type === 'condition' && block.config.field) {
      return `${baseLabel}: ${block.config.field}`;
    }
    if (block.type === 'if_else' && block.config.description) {
      return `${baseLabel}: ${block.config.description}`;
    }
    return baseLabel;
  };

  const hasChildren = block.type === 'if_else' || 
                      block.type === 'logic_and' || 
                      block.type === 'logic_or' || 
                      block.type === 'logic_not';

  return (
    <div 
      className={getBlockClassName()}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(e, block);
      }}
    >
      <div 
        className="pb-block-header"
        onClick={onSelect}
        draggable
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="pb-block-drag-handle">
          <Icons.GripVertical />
        </div>
        
        {hasChildren && (
          <button 
            className="pb-block-expand"
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
          >
            {isExpanded ? <Icons.ChevronDown /> : <Icons.ChevronRight />}
          </button>
        )}
        
        <div className="pb-block-label">
          {getBlockLabel()}
        </div>

        <div className="pb-block-actions">
          <button 
            className="pb-block-delete"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            title="Delete block"
          >
            <Icons.Trash />
          </button>
        </div>
      </div>

      {hasChildren && isExpanded && children && (
        <div className="pb-block-children">
          {children}
        </div>
      )}
    </div>
  );
}

function DropZone({ 
  id, 
  label, 
  onDrop 
}: { 
  id: string; 
  label: string; 
  onDrop: (blockIdOrBlock: string | PolicyBlock) => void;
}) {
  const [isOver, setIsOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsOver(true);
  };

  const handleDragLeave = () => {
    setIsOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsOver(false);
    
    const data = JSON.parse(e.dataTransfer.getData('application/json'));
    
    if (data.newBlock) {
      onDrop(data.newBlock);
    } else if (data.blockId) {
      onDrop(data.blockId);
    }
  };

  return (
    <div
      className={`pb-dropzone ${isOver ? 'pb-dropzone-over' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      data-testid={`dropzone-${id}`}
    >
      <div className="pb-dropzone-icon">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19 14l-7 7m0 0l-7-7m7 7V3" />
        </svg>
      </div>
      <p className="pb-dropzone-text">{label}</p>
    </div>
  );
}

// Context Menu Component
function ContextMenu({
  x,
  y,
  block,
  blocks,
  onDuplicate,
  onCopyTo,
  onMoveTo,
  onDelete,
  onClose,
}: {
  x: number;
  y: number;
  block: PolicyBlock;
  blocks: PolicyBlock[];
  onDuplicate: () => void;
  onCopyTo: (targetId: string | 'root', branch?: 'then' | 'else' | 'children') => void;
  onMoveTo: (targetId: string | 'root', branch?: 'then' | 'else' | 'children') => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [showCopyMenu, setShowCopyMenu] = useState(false);
  const [showMoveMenu, setShowMoveMenu] = useState(false);

  // Build block map for descendant checking
  const blockMap: Record<string, PolicyBlock> = {};
  blocks.forEach(b => {
    blockMap[b.id] = b;
  });

  // Collect all descendants of a block (to prevent cycles)
  const getDescendants = (blockId: string): Set<string> => {
    const descendants = new Set<string>();
    const collectDescendants = (id: string) => {
      const b = blockMap[id];
      if (b) {
        b.thenBlocks?.forEach(childId => {
          descendants.add(childId);
          collectDescendants(childId);
        });
        b.elseBlocks?.forEach(childId => {
          descendants.add(childId);
          collectDescendants(childId);
        });
        b.children?.forEach(childId => {
          descendants.add(childId);
          collectDescendants(childId);
        });
      }
    };
    collectDescendants(blockId);
    return descendants;
  };

  const descendants = getDescendants(block.id);

  // Get potential parent blocks (if_else and logic operators)
  // Exclude the block itself and all its descendants to prevent cycles
  const potentialParents = blocks.filter(b => 
    b.id !== block.id && 
    !descendants.has(b.id) &&
    (b.type === 'if_else' || b.type === 'logic_and' || b.type === 'logic_or' || b.type === 'logic_not')
  );

  return (
    <>
      <div
        className="pb-context-menu-overlay"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 999,
        }}
        onClick={onClose}
      />
      <div
        className="pb-context-menu"
        style={{ top: `${y}px`, left: `${x}px` }}
      >
        <button
          className="pb-context-menu-item"
          onClick={() => {
            onDuplicate();
            onClose();
          }}
          data-testid="context-menu-duplicate"
        >
          <Icons.Duplicate />
          <span>Duplicate</span>
        </button>
        
        <div 
          className="pb-context-menu-item-with-submenu"
          onMouseEnter={() => setShowCopyMenu(true)}
          onMouseLeave={() => setShowCopyMenu(false)}
        >
          <button
            className="pb-context-menu-item"
            data-testid="context-menu-copy"
          >
            <Icons.Copy />
            <span>Copy to</span>
            <span style={{ marginLeft: 'auto' }}>
              <Icons.ChevronRight />
            </span>
          </button>
          {showCopyMenu && (
            <div className="pb-context-menu-submenu">
              <button
                className="pb-context-menu-item"
                onClick={() => {
                  onCopyTo('root');
                  onClose();
                }}
                data-testid="context-menu-copy-root"
              >
                <span>Root level</span>
              </button>
              {potentialParents.length > 0 && (
                <>
                  <div className="pb-context-menu-divider" />
                  {potentialParents.map(parent => {
                    if (parent.type === 'if_else') {
                      return (
                        <div key={parent.id} style={{ display: 'contents' }}>
                          <button
                            className="pb-context-menu-item"
                            onClick={() => {
                              onCopyTo(parent.id, 'then');
                              onClose();
                            }}
                            data-testid={`context-menu-copy-${parent.id}-then`}
                          >
                            <span>{BLOCK_TYPE_LABELS[parent.type]} → If</span>
                          </button>
                          <button
                            className="pb-context-menu-item"
                            onClick={() => {
                              onCopyTo(parent.id, 'else');
                              onClose();
                            }}
                            data-testid={`context-menu-copy-${parent.id}-else`}
                          >
                            <span>{BLOCK_TYPE_LABELS[parent.type]} → Else</span>
                          </button>
                        </div>
                      );
                    } else {
                      const isNotBlock = parent.type === 'logic_not';
                      const hasChildren = (parent.children?.length || 0) > 0;
                      const disabled = isNotBlock && hasChildren;
                      
                      return (
                        <button
                          key={parent.id}
                          className="pb-context-menu-item"
                          onClick={() => {
                            if (!disabled) {
                              onCopyTo(parent.id, 'children');
                              onClose();
                            }
                          }}
                          disabled={disabled}
                          title={disabled ? 'NOT blocks can only have one child' : undefined}
                          data-testid={`context-menu-copy-${parent.id}`}
                          style={disabled ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                        >
                          <span>{BLOCK_TYPE_LABELS[parent.type]}</span>
                        </button>
                      );
                    }
                  })}
                </>
              )}
            </div>
          )}
        </div>

        <div 
          className="pb-context-menu-item-with-submenu"
          onMouseEnter={() => setShowMoveMenu(true)}
          onMouseLeave={() => setShowMoveMenu(false)}
        >
          <button
            className="pb-context-menu-item"
            data-testid="context-menu-move"
          >
            <Icons.Move />
            <span>Move to</span>
            <span style={{ marginLeft: 'auto' }}>
              <Icons.ChevronRight />
            </span>
          </button>
          {showMoveMenu && (
            <div className="pb-context-menu-submenu">
              <button
                className="pb-context-menu-item"
                onClick={() => {
                  onMoveTo('root');
                  onClose();
                }}
                data-testid="context-menu-move-root"
              >
                <span>Root level</span>
              </button>
              {potentialParents.length > 0 && (
                <>
                  <div className="pb-context-menu-divider" />
                  {potentialParents.map(parent => {
                    if (parent.type === 'if_else') {
                      return (
                        <div key={parent.id} style={{ display: 'contents' }}>
                          <button
                            className="pb-context-menu-item"
                            onClick={() => {
                              onMoveTo(parent.id, 'then');
                              onClose();
                            }}
                            data-testid={`context-menu-move-${parent.id}-then`}
                          >
                            <span>{BLOCK_TYPE_LABELS[parent.type]} → If</span>
                          </button>
                          <button
                            className="pb-context-menu-item"
                            onClick={() => {
                              onMoveTo(parent.id, 'else');
                              onClose();
                            }}
                            data-testid={`context-menu-move-${parent.id}-else`}
                          >
                            <span>{BLOCK_TYPE_LABELS[parent.type]} → Else</span>
                          </button>
                        </div>
                      );
                    } else {
                      const isNotBlock = parent.type === 'logic_not';
                      const hasChildren = (parent.children?.length || 0) > 0;
                      const disabled = isNotBlock && hasChildren;
                      
                      return (
                        <button
                          key={parent.id}
                          className="pb-context-menu-item"
                          onClick={() => {
                            if (!disabled) {
                              onMoveTo(parent.id, 'children');
                              onClose();
                            }
                          }}
                          disabled={disabled}
                          title={disabled ? 'NOT blocks can only have one child' : undefined}
                          data-testid={`context-menu-move-${parent.id}`}
                          style={disabled ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                        >
                          <span>{BLOCK_TYPE_LABELS[parent.type]}</span>
                        </button>
                      );
                    }
                  })}
                </>
              )}
            </div>
          )}
        </div>

        <div className="pb-context-menu-divider" />
        <button
          className="pb-context-menu-item pb-context-menu-item-danger"
          onClick={() => {
            onDelete();
            onClose();
          }}
          data-testid="context-menu-delete"
        >
          <Icons.Trash />
          <span>Delete</span>
        </button>
      </div>
    </>
  );
}

export function PolicyCanvas({
  blocks,
  selectedBlockId,
  onBlockSelect,
  onBlocksChange,
  isDefaultModel = false,
  modelName = '',
}: PolicyCanvasProps) {
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    block: PolicyBlock;
  } | null>(null);

  // Build block map for O(1) lookups
  const blockMap: Record<string, PolicyBlock> = {};
  blocks.forEach(block => {
    blockMap[block.id] = block;
  });

  // Get root blocks (no parent)
  const childIds = new Set<string>();
  blocks.forEach(block => {
    block.thenBlocks?.forEach(id => childIds.add(id));
    block.elseBlocks?.forEach(id => childIds.add(id));
    block.children?.forEach(id => childIds.add(id));
  });
  const rootBlocks = blocks.filter(block => !childIds.has(block.id));

  const handleDelete = (blockId: string) => {
    // Remove block and all descendants
    const idsToRemove = new Set<string>();
    
    const collectDescendants = (id: string) => {
      idsToRemove.add(id);
      const block = blockMap[id];
      if (block) {
        block.thenBlocks?.forEach(collectDescendants);
        block.elseBlocks?.forEach(collectDescendants);
        block.children?.forEach(collectDescendants);
      }
    };
    
    collectDescendants(blockId);
    
    // Remove from parent's child arrays
    const newBlocks = blocks
      .filter(block => !idsToRemove.has(block.id))
      .map(block => ({
        ...block,
        thenBlocks: block.thenBlocks?.filter(id => !idsToRemove.has(id)),
        elseBlocks: block.elseBlocks?.filter(id => !idsToRemove.has(id)),
        children: block.children?.filter(id => !idsToRemove.has(id)),
      }));
    
    onBlocksChange(newBlocks);
    if (selectedBlockId && idsToRemove.has(selectedBlockId)) {
      onBlockSelect(null);
    }
  };

  const handleDropToRoot = (blockIdOrBlock: string | PolicyBlock) => {
    let blockId: string;
    let newBlocks = [...blocks];

    if (typeof blockIdOrBlock === 'object') {
      blockId = blockIdOrBlock.id;
      newBlocks.push(blockIdOrBlock);
    } else {
      blockId = blockIdOrBlock;
    }

    newBlocks = newBlocks.map(block => ({
      ...block,
      thenBlocks: block.thenBlocks?.filter(id => id !== blockId),
      elseBlocks: block.elseBlocks?.filter(id => id !== blockId),
      children: block.children?.filter(id => id !== blockId),
    }));
    
    onBlocksChange(newBlocks);
  };

  const handleDropToBranch = (parentId: string, branch: 'then' | 'else' | 'children', blockIdOrBlock: string | PolicyBlock) => {
    let blockId: string;
    let allBlocks = [...blocks];

    if (typeof blockIdOrBlock === 'object') {
      blockId = blockIdOrBlock.id;
      allBlocks.push(blockIdOrBlock);
    } else {
      blockId = blockIdOrBlock;
    }

    // Build temporary block map to check constraints
    const tempBlockMap: Record<string, PolicyBlock> = {};
    allBlocks.forEach(b => {
      tempBlockMap[b.id] = b;
    });

    // Validate NOT block constraint BEFORE making changes
    const parentBlock = tempBlockMap[parentId];
    if (parentBlock && parentBlock.type === 'logic_not' && branch === 'children') {
      // Check if NOT block already has a child (and it's not the block being moved)
      const currentChildren = parentBlock.children?.filter(id => id !== blockId) || [];
      if (currentChildren.length >= 1) {
        return; // Cannot add to full NOT block
      }
    }

    const newBlocks = allBlocks.map(block => {
      // Remove from old parent
      const cleanedBlock = {
        ...block,
        thenBlocks: block.thenBlocks?.filter(id => id !== blockId),
        elseBlocks: block.elseBlocks?.filter(id => id !== blockId),
        children: block.children?.filter(id => id !== blockId),
      };

      // Add to new parent
      if (block.id === parentId) {
        if (branch === 'then') {
          return {
            ...cleanedBlock,
            thenBlocks: [...(cleanedBlock.thenBlocks || []), blockId],
          };
        } else if (branch === 'else') {
          return {
            ...cleanedBlock,
            elseBlocks: [...(cleanedBlock.elseBlocks || []), blockId],
          };
        } else if (branch === 'children') {
          return {
            ...cleanedBlock,
            children: [...(cleanedBlock.children || []), blockId],
          };
        }
      }

      return cleanedBlock;
    });

    onBlocksChange(newBlocks);
  };

  const handleDuplicate = (blockId: string) => {
    const originalBlock = blockMap[blockId];
    if (!originalBlock) return;

    // Create a duplicate with a new ID
    const newId = crypto.randomUUID();
    const duplicatedBlock: PolicyBlock = {
      ...originalBlock,
      id: newId,
      // Don't copy children - just create an empty duplicate
      thenBlocks: [],
      elseBlocks: [],
      children: [],
    };

    onBlocksChange([...blocks, duplicatedBlock]);
  };

  const handleContextMenu = (e: React.MouseEvent, block: PolicyBlock) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      block,
    });
  };

  const handleCopyTo = (sourceId: string, targetId: string | 'root', branch?: 'then' | 'else' | 'children') => {
    const sourceBlock = blockMap[sourceId];
    if (!sourceBlock) return;

    // Create a copy with a new ID
    const newId = crypto.randomUUID();
    const copiedBlock: PolicyBlock = {
      ...sourceBlock,
      id: newId,
      thenBlocks: [],
      elseBlocks: [],
      children: [],
    };

    let newBlocks = [...blocks, copiedBlock];

    // If target is not root, add to parent
    if (targetId !== 'root') {
      newBlocks = newBlocks.map(block => {
        if (block.id === targetId) {
          if (block.type === 'if_else') {
            if (branch === 'then') {
              return {
                ...block,
                thenBlocks: [...(block.thenBlocks || []), newId],
              };
            } else if (branch === 'else') {
              return {
                ...block,
                elseBlocks: [...(block.elseBlocks || []), newId],
              };
            }
          } else if (block.type === 'logic_and' || block.type === 'logic_or' || block.type === 'logic_not') {
            // Enforce NOT block constraint
            if (block.type === 'logic_not' && (block.children?.length || 0) >= 1) {
              return block;
            }
            return {
              ...block,
              children: [...(block.children || []), newId],
            };
          }
        }
        return block;
      });
    }

    onBlocksChange(newBlocks);
  };

  const handleMoveTo = (sourceId: string, targetId: string | 'root', branch?: 'then' | 'else' | 'children') => {
    // Validate target can accept the block BEFORE removing from parent
    if (targetId !== 'root') {
      const targetBlock = blockMap[targetId];
      if (!targetBlock) return; // Target doesn't exist
      
      // Check NOT block constraint
      if (targetBlock.type === 'logic_not' && (targetBlock.children?.length || 0) >= 1) {
        return; // Cannot add to full NOT block
      }
    }

    // Now safe to remove from original parent
    let newBlocks = blocks.map(block => ({
      ...block,
      thenBlocks: block.thenBlocks?.filter(id => id !== sourceId),
      elseBlocks: block.elseBlocks?.filter(id => id !== sourceId),
      children: block.children?.filter(id => id !== sourceId),
    }));

    // Add to new parent
    if (targetId !== 'root') {
      newBlocks = newBlocks.map(block => {
        if (block.id === targetId) {
          if (block.type === 'if_else') {
            if (branch === 'then') {
              return {
                ...block,
                thenBlocks: [...(block.thenBlocks || []), sourceId],
              };
            } else if (branch === 'else') {
              return {
                ...block,
                elseBlocks: [...(block.elseBlocks || []), sourceId],
              };
            }
          } else if (block.type === 'logic_and' || block.type === 'logic_or' || block.type === 'logic_not') {
            return {
              ...block,
              children: [...(block.children || []), sourceId],
            };
          }
        }
        return block;
      });
    }

    onBlocksChange(newBlocks);
  };

  const renderBlock = (block: PolicyBlock): React.ReactNode => {
    const isSelected = selectedBlockId === block.id;

    if (block.type === 'if_else') {
      const thenChildren = block.thenBlocks?.map(id => blockMap[id]).filter(Boolean) || [];
      const elseChildren = block.elseBlocks?.map(id => blockMap[id]).filter(Boolean) || [];

      return (
        <BlockCard
          key={block.id}
          block={block}
          isSelected={isSelected}
          onSelect={() => onBlockSelect(block.id)}
          onDelete={() => handleDelete(block.id)}
          onDuplicate={() => handleDuplicate(block.id)}
          onContextMenu={handleContextMenu}
        >
          <div className="pb-branch">
            <div className="pb-branch-label">If:</div>
            {thenChildren.map(renderBlock)}
            <DropZone
              id={`${block.id}-then`}
              label={thenChildren.length > 0 ? "Drop another block here" : "Drop condition or action here"}
              onDrop={(blockId) => handleDropToBranch(block.id, 'then', blockId)}
            />
          </div>

          <div className="pb-branch">
            <div className="pb-branch-label">Else:</div>
            {elseChildren.map(renderBlock)}
            <DropZone
              id={`${block.id}-else`}
              label={elseChildren.length > 0 ? "Drop another block here" : "Drop action here"}
              onDrop={(blockId) => handleDropToBranch(block.id, 'else', blockId)}
            />
          </div>
        </BlockCard>
      );
    }

    if (block.type === 'logic_and' || block.type === 'logic_or' || block.type === 'logic_not') {
      const children = block.children?.map(id => blockMap[id]).filter(Boolean) || [];
      const isNotBlock = block.type === 'logic_not';
      const hasMaxChildren = isNotBlock && children.length >= 1;

      return (
        <BlockCard
          key={block.id}
          block={block}
          isSelected={isSelected}
          onSelect={() => onBlockSelect(block.id)}
          onDelete={() => handleDelete(block.id)}
          onDuplicate={() => handleDuplicate(block.id)}
          onContextMenu={handleContextMenu}
        >
          {children.map(renderBlock)}
          {!hasMaxChildren && (
            <DropZone
              id={`${block.id}-children`}
              label={children.length > 0 ? "Drop another condition here" : "Drop conditions here"}
              onDrop={(blockId) => handleDropToBranch(block.id, 'children', blockId)}
            />
          )}
        </BlockCard>
      );
    }

    return (
      <BlockCard
        key={block.id}
        block={block}
        isSelected={isSelected}
        onSelect={() => onBlockSelect(block.id)}
        onDelete={() => handleDelete(block.id)}
        onDuplicate={() => handleDuplicate(block.id)}
        onContextMenu={handleContextMenu}
      />
    );
  };

  if (blocks.length === 0) {
    return (
      <div className="pb-canvas-empty">
        <div className="pb-empty-state">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="9" y1="9" x2="15" y2="9"></line>
            <line x1="9" y1="15" x2="15" y2="15"></line>
          </svg>
          {isDefaultModel ? (
            <>
              <h3>{modelName} - Parameters Only</h3>
              <p>This is a parameter-based model. Configure your policy using the <strong>Test Claims</strong> section on the right.</p>
              <p className="pb-helper-text">
                💡 Test Claims let you define access rules by setting field values (e.g., stage=validate, environment=production)
              </p>
              <p className="pb-helper-text">
                To build custom logic with blocks, switch to <strong>Custom Model</strong> in the model selector above.
              </p>
            </>
          ) : (
            <>
              <h3>No policy blocks yet</h3>
              <p>Drag blocks from the palette on the left to build your policy logic</p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="pb-policy-canvas">
        <div className="pb-blocks-container">
          {rootBlocks.map(renderBlock)}
          <DropZone
            id="root"
            label="Drop blocks at root level"
            onDrop={handleDropToRoot}
          />
        </div>
      </div>
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          block={contextMenu.block}
          blocks={blocks}
          onDuplicate={() => handleDuplicate(contextMenu.block.id)}
          onCopyTo={(targetId) => handleCopyTo(contextMenu.block.id, targetId)}
          onMoveTo={(targetId) => handleMoveTo(contextMenu.block.id, targetId)}
          onDelete={() => handleDelete(contextMenu.block.id)}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
}
