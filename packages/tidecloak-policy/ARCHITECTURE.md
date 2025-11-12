# Policy Builder Architecture

This document provides a comprehensive overview of the Policy Builder's architecture, component relationships, data flow, and extension points.

## System Overview

The Policy Builder is a React-based component library for creating authorization policies through a visual drag-and-drop interface. It translates visual blocks into executable code in multiple programming languages.

```
┌─────────────────────────────────────────────────────────────────┐
│                        User Interface Layer                      │
│  ┌──────────────┐  ┌─────────────────┐  ┌───────────────────┐ │
│  │ BlockPalette │  │  PolicyCanvas   │  │ PropertiesPanel   │ │
│  │              │  │   (DnD Editor)  │  │                   │ │
│  └──────────────┘  └─────────────────┘  └───────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ├─────► PolicyBlock[] (State)
                              │
┌─────────────────────────────────────────────────────────────────┐
│                     Code Generation Layer                        │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │           Generator Registry (Plugin System)              │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │  CSharpGenerator  │  PythonGenerator  │  JavaGenerator   │  │
│  │  (Built-in)       │   (Custom)        │   (Custom)       │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    Generated Code + Description
```

## Core Concepts

### 1. Policy Blocks

The fundamental unit of policy construction. Each block represents a single logical operation:

- **Condition Blocks** - Compare claim values (e.g., `role equals "admin"`)
- **Decision Blocks** - Create If/Else branching logic
- **Logic Operators** - Combine conditions (AND, OR, NOT)
- **Action Blocks** - Terminal actions (Allow, Deny)

**Data Structure:**

```typescript
interface PolicyBlock {
  id: string;                    // Unique identifier
  type: BlockType;               // Block type enum
  config: Record<string, any>;   // Dynamic configuration
  order: number;                 // Position in flow
  thenBlocks?: string[];         // If-branch children (Decision blocks)
  elseBlocks?: string[];         // Else-branch children (Decision blocks)
  children?: string[];           // Nested children (Logic operators)
}
```

### 2. Block Hierarchy

Blocks form a tree structure:

```
Decision (If/Else)
├── thenBlocks
│   ├── Condition ("stage equals production")
│   └── Allow
└── elseBlocks
    └── Deny
```

**Key Properties:**
- Root blocks have no parent
- Child IDs are stored in parent blocks (`thenBlocks`, `elseBlocks`, `children`)
- Each block appears only once in the tree (no duplicates by reference)

### 3. Code Generators

Generators transform blocks into target language code:

```typescript
interface CodeGenerator {
  getLanguageInfo(): LanguageInfo;
  translateBlocks(blocks: PolicyBlock[]): string;
  generateDescription(blocks: PolicyBlock[]): string;
  validateCode(code: string): ValidationResult;
  compile(mode, blocks, code, claims): Promise<CompileResult>;
}
```

## Component Architecture

### 1. PolicyBuilder (Orchestrator)

The main page component that coordinates all sub-components.

**Responsibilities:**
- Manage global state (mode, model, blocks, claims)
- Handle compilation requests
- Coordinate communication between components

**State Management:**
```typescript
const [mode, setMode] = useState<'simple' | 'advanced'>('simple');
const [selectedModel, setSelectedModel] = useState<Model | null>(null);
const [blocks, setBlocks] = useState<PolicyBlock[]>([]);
const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
const [claims, setClaims] = useState<Claim[]>([]);
```

### 2. BlockPalette (Block Library)

Displays available block types organized by category.

**Data Flow:**
```
User clicks block → onAddBlock(newBlock) → Parent adds to blocks array
```

**Categories:**
- Conditions - Field comparison blocks
- Decisions - If/Else containers
- Logic - AND/OR/NOT operators
- Actions - Allow/Deny terminals

### 3. PolicyCanvas (Visual Editor)

Main drag-and-drop interface for arranging blocks.

**Key Features:**
- Drag and drop using `@dnd-kit`
- Visual drop zones for branches (If/Else/Children)
- Right-click context menu (Duplicate, Move, Copy, Delete)
- Visual feedback during drag operations

**Data Flow:**
```
User drags block → DnD event → Calculate new position → onBlocksChange(updatedBlocks)
```

**Important Implementation Details:**
- Uses `activeBlockId` state to track dragging (stable, doesn't flicker)
- Validates drop targets (can't drop Decision inside Condition, etc.)
- Maintains block tree integrity during moves

### 4. PropertiesPanel (Dynamic Editor)

Context-sensitive properties editor for selected blocks.

**Features:**
- Dynamic form fields based on block type
- Model-aware field selection (shows available fields from selected model)
- Live code preview (debounced, 300ms)
- Plain English policy summary
- Test claims builder

**Data Flow:**
```
User selects block → Display block properties → User edits → onBlockUpdate(updatedBlock) → Re-render canvas
```

### 5. ActionBar (Controls)

Bottom toolbar with compilation and reset controls.

**Features:**
- Compile button with loading state
- Reset button to clear all blocks
- Expandable results panel (shows code, description, errors)

## Data Flow

### Complete User Flow

```
1. User selects model
   └─► Enables block creation
   
2. User clicks/drags block from palette
   └─► Block added to canvas (root level)
   
3. User drags block into Decision's "If" branch
   └─► Block becomes child of Decision
   └─► Parent's thenBlocks updated
   
4. User selects block
   └─► PropertiesPanel shows block config
   └─► User edits field/operator/value
   └─► Block config updated
   └─► Canvas re-renders
   
5. User clicks "Compile"
   └─► API call to /api/policy/compile
   └─► Generator translates blocks → code
   └─► Results displayed in ActionBar
```

### State Updates

All block updates follow this pattern:

```typescript
// Immutable update pattern
const updateBlock = (blockId: string, changes: Partial<PolicyBlock>) => {
  setBlocks(blocks => 
    blocks.map(block => 
      block.id === blockId 
        ? { ...block, ...changes }
        : block
    )
  );
};
```

## Code Generation Pipeline

### 1. Block to Code Translation

```
PolicyBlock[] → Generator.translateBlocks() → Language-Specific Code
```

**Steps:**

1. **Build Block Map**: Create ID → Block lookup for O(1) access
   ```typescript
   const blockMap = buildBlockMap(blocks);
   ```

2. **Identify Root Blocks**: Find blocks with no parent
   ```typescript
   const rootBlocks = getRootBlocks(blocks);
   ```

3. **Recursive Code Generation**: Traverse tree depth-first
   ```typescript
   rootBlocks.forEach(block => {
     generateBlockCode(block, blockMap, indentLevel);
   });
   ```

4. **Add Boilerplate**: Wrap in language-specific structure
   ```csharp
   public sealed class GeneratedPolicy : IAccessPolicy {
     public PolicyDecision Authorize(AccessContext ctx) {
       // Generated code here
     }
   }
   ```

### 2. Plain English Generation

Similar to code generation but produces human-readable descriptions:

```
PolicyBlock[] → Generator.generateDescription() → Plain English
```

**Example Output:**
```
If stage equals "production":
  ✓ Allow access
Otherwise:
  ✗ Deny access: Development environment
```

## Extension Points

### 1. Adding New Block Types

**Step 1:** Add to schema
```typescript
// shared/schema.ts
export const blockTypeSchema = z.enum([
  "condition",
  "if_else",
  "logic_and",
  "logic_or",
  "logic_not",
  "action_allow",
  "action_deny",
  "custom_log", // New type
]);
```

**Step 2:** Add to BlockPalette
```typescript
// client/src/components/policy/BlockPalette.tsx
const BLOCK_CATEGORIES = {
  // ... existing categories
  custom: {
    label: "Custom Blocks",
    blocks: [{
      type: "custom_log",
      label: "Log Event",
      icon: FileText,
      description: "Log an event for debugging",
    }],
  },
};
```

**Step 3:** Handle in generator
```typescript
// server/lib/generators/CSharpGenerator.ts
case "custom_log": {
  const message = block.config.message || "";
  lines.push(`${indentStr}Logger.Log("${message}");`);
  break;
}
```

### 2. Adding New Language Generators

See [EXTENDING_LANGUAGES.md](./EXTENDING_LANGUAGES.md) for detailed guide.

**Quick Overview:**
1. Implement `CodeGenerator` interface
2. Register in `generatorRegistry`
3. Handle block types specific to your language

### 3. Custom Models

Models define available fields for conditions:

```typescript
const customModel: Model = {
  id: "MyModel:1",
  name: "My Custom Model",
  category: "custom",
  fields: [
    {
      key: "custom_field",
      type: "string",
      label: "My Custom Field",
      options: ["option1", "option2"],
      required: false,
    },
  ],
};
```

## Performance Considerations

### 1. Block Tree Operations

- **O(n) operations**: Adding, removing, updating blocks
- **O(1) lookups**: Using `blockMap` for ID-based access
- **Avoid**: Nested loops over blocks array

### 2. Re-Renders

- Use React.memo() for expensive components
- Debounce live code preview (300ms default)
- Only pass required props to child components

### 3. Large Policies

For policies with 100+ blocks:
- Consider virtualization for canvas
- Paginate block palette
- Lazy-load code preview

## Security Considerations

### 1. Code Injection

Generated code is **not executed** in the browser. Always:
- Validate on server before execution
- Sanitize user inputs in block configs
- Escape special characters in generated code

### 2. API Security

The `/api/policy/compile` endpoint should:
- Validate request schema
- Rate limit compilation requests
- Sanitize generated code before returning

## Testing Strategy

### 1. Unit Tests

- Test individual block type generators
- Test block tree utilities
- Test validation logic

### 2. Integration Tests

- Test complete code generation pipeline
- Test drag-and-drop interactions
- Test state updates

### 3. E2E Tests

- Test full user workflows
- Test cross-browser compatibility
- Test real code compilation

## File Structure

```
client/src/
├── components/
│   ├── policy-builder/
│   │   └── index.ts              # Main library export
│   └── policy/
│       ├── PolicyCanvas.tsx      # Visual editor
│       ├── BlockPalette.tsx      # Block library
│       ├── PropertiesPanel.tsx   # Properties editor
│       ├── ActionBar.tsx         # Controls
│       ├── AdvancedEditor.tsx    # Code editor
│       ├── ModelSelector.tsx     # Model picker
│       └── CodePreview.tsx       # Code preview
├── lib/
│   ├── blockTree.ts              # Block manipulation utilities
│   └── mockData.ts               # Predefined models
└── pages/
    └── PolicyBuilder.tsx         # Main orchestrator page

server/lib/
├── generators/
│   ├── CSharpGenerator.ts        # C# implementation
│   ├── registry.ts               # Generator registry
│   └── [Add more generators]
└── policyCompiler.ts             # Legacy (backward compat)

shared/
├── schema.ts                     # Data types
└── generators.ts                 # Generator interfaces
```

## Best Practices

### 1. Component Design

- Keep components focused on single responsibility
- Use TypeScript for type safety
- Export types alongside components
- Document complex prop interfaces

### 2. State Management

- Lift state only when necessary
- Use controlled components
- Provide both controlled and uncontrolled variants

### 3. Code Generation

- Keep generator logic pure (no side effects)
- Test with various block combinations
- Handle edge cases (empty policies, incomplete blocks)
- Provide meaningful error messages

### 4. Extension Development

- Follow existing patterns for consistency
- Document new block types and generators
- Provide examples in comments
- Test with real-world scenarios

## Future Enhancements

Potential areas for expansion:

1. **Visual Improvements**
   - Minimap for large policies
   - Zoom controls
   - Block search/filter

2. **Advanced Features**
   - Policy templates
   - Version control
   - Collaborative editing
   - Policy testing/simulation

3. **Language Support**
   - Python generator
   - Java generator
   - Go generator
   - JavaScript generator

4. **Performance**
   - Virtual scrolling for large policies
   - Web Workers for code generation
   - Lazy loading for block palette

5. **Developer Tools**
   - CLI for code generation
   - VS Code extension
   - Policy linter
   - Policy formatter
