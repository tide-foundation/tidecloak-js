# API Reference

Complete reference for all components, hooks, types, and utilities in the Policy Builder library.

## Table of Contents

- [Components](#components)
- [Types](#types)
- [Utilities](#utilities)
- [Constants](#constants)
- [Generator System](#generator-system)

## Components

### PolicyBuilder

The main policy builder page component with full functionality.

```typescript
function PolicyBuilder(): JSX.Element
```

**Features:**
- Model selection
- Simple/Advanced mode toggle
- Block palette
- Policy canvas
- Properties panel
- Action bar with compilation

**Usage:**
```tsx
import { PolicyBuilder } from '@/components/policy-builder';

export default function App() {
  return <PolicyBuilder />;
}
```

---

### BlockPalette

Displays available block types organized by category.

```typescript
interface BlockPaletteProps {
  selectedModel: Model | null;
  onAddBlock: (block: PolicyBlock) => void;
}

function BlockPalette(props: BlockPaletteProps): JSX.Element
```

**Props:**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `selectedModel` | `Model \| null` | Yes | Currently selected access control model |
| `onAddBlock` | `(block: PolicyBlock) => void` | Yes | Callback when user clicks/drags a block |

**Usage:**
```tsx
<BlockPalette
  selectedModel={selectedModel}
  onAddBlock={(block) => setBlocks([...blocks, block])}
/>
```

**Block Categories:**
- **Conditions** - Compare claim values
- **Decisions** - If/Else branching
- **Logic Operators** - AND, OR, NOT
- **Actions** - Allow, Deny

---

### PolicyCanvas

Main drag-and-drop canvas for arranging policy blocks.

```typescript
interface PolicyCanvasProps {
  blocks: PolicyBlock[];
  selectedBlockId: string | null;
  onBlocksChange: (blocks: PolicyBlock[]) => void;
  onBlockSelect: (blockId: string | null) => void;
  onBlockDelete?: (blockId: string) => void;
}

function PolicyCanvas(props: PolicyCanvasProps): JSX.Element
```

**Props:**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `blocks` | `PolicyBlock[]` | Yes | Array of all policy blocks |
| `selectedBlockId` | `string \| null` | Yes | ID of currently selected block |
| `onBlocksChange` | `(blocks: PolicyBlock[]) => void` | Yes | Callback when blocks are modified |
| `onBlockSelect` | `(blockId: string \| null) => void` | Yes | Callback when block selection changes |
| `onBlockDelete` | `(blockId: string) => void` | No | Optional custom delete handler |

**Features:**
- Drag and drop blocks
- Drop zones for branches (If/Else/Children)
- Right-click context menu
- Visual feedback during drag
- Block selection

**Context Menu Actions:**
- Duplicate - Clone block with new ID
- Move to - Move block to different branch
- Copy to - Copy block to different branch
- Delete - Remove block and descendants

**Usage:**
```tsx
<PolicyCanvas
  blocks={blocks}
  selectedBlockId={selectedBlockId}
  onBlocksChange={setBlocks}
  onBlockSelect={setSelectedBlockId}
/>
```

---

### PropertiesPanel

Dynamic properties editor for selected blocks with live preview.

```typescript
interface PropertiesPanelProps {
  selectedBlock: PolicyBlock | null;
  selectedModel: Model | null;
  claims: Claim[];
  onClaimsChange: (claims: Claim[]) => void;
  onBlockUpdate: (block: PolicyBlock) => void;
  allBlocks: PolicyBlock[];
}

function PropertiesPanel(props: PropertiesPanelProps): JSX.Element
```

**Props:**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `selectedBlock` | `PolicyBlock \| null` | Yes | Currently selected block to edit |
| `selectedModel` | `Model \| null` | Yes | Selected model (provides field options) |
| `claims` | `Claim[]` | Yes | Test claims for validation |
| `onClaimsChange` | `(claims: Claim[]) => void` | Yes | Callback when claims change |
| `onBlockUpdate` | `(block: PolicyBlock) => void` | Yes | Callback when block is updated |
| `allBlocks` | `PolicyBlock[]` | Yes | All blocks (for live preview) |

**Features:**
- Dynamic form fields per block type
- Model-aware field selection
- Live C# code preview (debounced 300ms)
- Plain English policy summary
- Test claims builder

**Block-Specific Fields:**

**Condition Block:**
- Field (dropdown from model or custom text)
- Operator (equals, not equals, contains, etc.)
- Value (text input)

**Decision Block:**
- Description (text label)

**Action Blocks (Allow/Deny):**
- Message (optional custom message)

**Usage:**
```tsx
<PropertiesPanel
  selectedBlock={blocks.find(b => b.id === selectedBlockId) || null}
  selectedModel={selectedModel}
  claims={claims}
  onClaimsChange={setClaims}
  onBlockUpdate={(updated) => {
    setBlocks(blocks.map(b => b.id === updated.id ? updated : b));
  }}
  allBlocks={blocks}
/>
```

---

### ActionBar

Bottom toolbar with compilation and reset controls.

```typescript
interface ActionBarProps {
  isCompiling: boolean;
  compileResult: {
    success: boolean;
    message: string;
    plainEnglish?: string;
    generatedCode?: string;
    errors?: string[];
  } | null;
  onCompile: () => void;
  onReset: () => void;
  mode: 'simple' | 'advanced';
  hasContent: boolean;
  hasModel: boolean;
}

function ActionBar(props: ActionBarProps): JSX.Element
```

**Props:**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `isCompiling` | `boolean` | Yes | Whether compilation is in progress |
| `compileResult` | `CompileResult \| null` | Yes | Compilation result |
| `onCompile` | `() => void` | Yes | Callback to trigger compilation |
| `onReset` | `() => void` | Yes | Callback to reset/clear policy |
| `mode` | `'simple' \| 'advanced'` | Yes | Current editor mode |
| `hasContent` | `boolean` | Yes | Whether policy has content |
| `hasModel` | `boolean` | Yes | Whether a model is selected |

**Usage:**
```tsx
<ActionBar
  isCompiling={isCompiling}
  compileResult={compileResult}
  onCompile={handleCompile}
  onReset={() => setBlocks([])}
  mode="simple"
  hasContent={blocks.length > 0}
  hasModel={selectedModel !== null}
/>
```

---

### AdvancedEditor

Code editor for advanced mode with syntax highlighting.

```typescript
interface AdvancedEditorProps {
  code: string;
  onCodeChange: (code: string) => void;
  claims: Claim[];
  onClaimsChange: (claims: Claim[]) => void;
}

function AdvancedEditor(props: AdvancedEditorProps): JSX.Element
```

**Props:**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `code` | `string` | Yes | Current code content |
| `onCodeChange` | `(code: string) => void` | Yes | Callback when code changes |
| `claims` | `Claim[]` | Yes | Test claims |
| `onClaimsChange` | `(claims: Claim[]) => void` | Yes | Callback when claims change |

**Features:**
- Syntax highlighting (C# by default)
- Sample code insertion
- Copy to clipboard
- Test claims builder

---

### ModelSelector

Dropdown for selecting access control models.

```typescript
interface ModelSelectorProps {
  models: Model[];
  selectedModel: Model | null;
  onModelChange: (model: Model | null) => void;
}

function ModelSelector(props: ModelSelectorProps): JSX.Element
```

**Props:**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `models` | `Model[]` | Yes | Available models to choose from |
| `selectedModel` | `Model \| null` | Yes | Currently selected model |
| `onModelChange` | `(model: Model \| null) => void` | Yes | Callback when selection changes |

---

### CodePreview

Live code preview component with syntax highlighting.

```typescript
interface CodePreviewProps {
  generatedCode: string | undefined;
  isLoading: boolean;
}

function CodePreview(props: CodePreviewProps): JSX.Element
```

## Types

### PolicyBlock

Individual logic block in the policy.

```typescript
interface PolicyBlock {
  id: string;                  // Unique identifier (nanoid)
  type: BlockType;             // Block type enum
  config: Record<string, any>; // Dynamic configuration
  order: number;               // Position in flow
  thenBlocks?: string[];       // If-branch children (Decision blocks)
  elseBlocks?: string[];       // Else-branch children (Decision blocks)
  children?: string[];         // Nested children (Logic operators)
}
```

### BlockType

```typescript
type BlockType =
  | "condition"      // Compare claim field
  | "if_else"        // Decision with If/Else branches
  | "logic_and"      // All conditions must be true
  | "logic_or"       // At least one condition must be true
  | "logic_not"      // Invert condition
  | "action_allow"   // Grant access
  | "action_deny";   // Deny access
```

### Model

Access control model defining available fields.

```typescript
interface Model {
  id: string;
  name: string;
  description?: string;
  fields: ModelField[];
  category?: "common" | "custom";
}
```

### ModelField

Field definition in a model.

```typescript
interface ModelField {
  key: string;                           // Field identifier
  type: "string" | "number" | "boolean" | "array" | "object";
  label: string;                         // Display name
  options?: string[];                    // Dropdown options
  required?: boolean;                    // Whether field is required
}
```

### Claim

Test claim (key-value pair) for validation.

```typescript
interface Claim {
  key: string;
  value: any;
  type?: "string" | "number" | "boolean";
}
```

### CompileResult

Result from policy compilation.

```typescript
interface CompileResult {
  success: boolean;
  message?: string;
  errors?: string[];
  generatedCode?: string;
  plainEnglish?: string;
}
```

### CompileRequest

Request to compile a policy.

```typescript
interface CompileRequest {
  modelId: string;
  mode: "simple" | "advanced";
  blocks?: PolicyBlock[];
  code?: string;
  claims?: Claim[];
  language?: string;  // Target language (default: "csharp")
}
```

## Utilities

### buildBlockMap

Create ID-based lookup map for O(1) access.

```typescript
function buildBlockMap(blocks: PolicyBlock[]): BlockMap

interface BlockMap {
  [id: string]: PolicyBlock;
}
```

**Usage:**
```typescript
const blockMap = buildBlockMap(blocks);
const block = blockMap[blockId]; // O(1) lookup
```

---

### getAllBlocks

Get all blocks as flat array (including nested).

```typescript
function getAllBlocks(
  rootBlocks: PolicyBlock[],
  blockMap: BlockMap
): PolicyBlock[]
```

---

### getRootBlocks

Get top-level blocks (blocks with no parent).

```typescript
function getRootBlocks(blocks: PolicyBlock[]): PolicyBlock[]
```

---

### getBlockChildren

Get direct children of a block.

```typescript
function getBlockChildren(
  block: PolicyBlock,
  blockMap: BlockMap
): PolicyBlock[]
```

**Returns children from:**
- `thenBlocks` (Decision blocks - If branch)
- `elseBlocks` (Decision blocks - Else branch)
- `children` (Logic operators)

---

### removeBlockFromTree

Remove a block and all its descendants from the tree.

```typescript
function removeBlockFromTree(
  blocks: PolicyBlock[],
  blockIdToRemove: string
): PolicyBlock[]
```

**Warning:** This removes the block and ALL nested blocks recursively.

---

### addBlockToBranch

Add a block to a specific branch of a parent block.

```typescript
function addBlockToBranch(
  blocks: PolicyBlock[],
  parentId: string,
  branchType: "then" | "else" | "children",
  blockToAdd: PolicyBlock
): PolicyBlock[]
```

## Constants

### PREDEFINED_MODELS

Built-in access control models.

```typescript
const PREDEFINED_MODELS: Model[] = [
  {
    id: "ForsetiModel:1",
    name: "Forseti Access Model",
    fields: [
      { key: "realm_resource", type: "array", label: "Realm Resource Roles" },
      { key: "resource_access", type: "object", label: "Resource Access" },
      { key: "stage", type: "string", label: "Stage", options: ["validate", "test", "production"] },
      { key: "sub", type: "string", label: "Subject (User ID)" },
    ],
  },
  // ... more models
];
```

### BLOCK_TEMPLATES

Default configurations for block types.

```typescript
const BLOCK_TEMPLATES = {
  condition: {
    name: "Check Condition",
    icon: "CheckCircle2",
    description: "Check if a claim field matches a value",
    defaultConfig: {
      field: "",
      operator: "equals",
      value: "",
    },
  },
  // ... more templates
};
```

## Generator System

### CodeGenerator Interface

Interface for implementing custom code generators.

```typescript
interface CodeGenerator {
  getLanguageInfo(): LanguageInfo;
  translateBlocks(blocks: PolicyBlock[]): string;
  generateDescription(blocks: PolicyBlock[]): string;
  validateCode(code: string): ValidationResult;
  compile(
    mode: "simple" | "advanced",
    blocks?: PolicyBlock[],
    code?: string,
    claims?: Claim[]
  ): Promise<CompileResult>;
}
```

See [EXTENDING_LANGUAGES.md](./EXTENDING_LANGUAGES.md) for implementation guide.

### LanguageInfo

Language metadata.

```typescript
interface LanguageInfo {
  id: string;              // Language ID (e.g., "python")
  name: string;            // Display name (e.g., "Python")
  version?: string;        // Language version
  fileExtension: string;   // File extension (e.g., ".py")
  supportsValidation: boolean;
}
```

### ValidationResult

Code validation result.

```typescript
interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}
```

## API Endpoints

### POST /api/policy/compile

Compile policy blocks to code.

**Request:**
```typescript
{
  modelId: string;
  mode: "simple" | "advanced";
  blocks?: PolicyBlock[];
  code?: string;
  claims?: Claim[];
  language?: string;  // Default: "csharp"
}
```

**Response:**
```typescript
{
  success: boolean;
  message?: string;
  errors?: string[];
  generatedCode?: string;
  plainEnglish?: string;
}
```

### GET /api/generators

Get available code generators.

**Response:**
```typescript
{
  generators: LanguageInfo[];
}
```

## Examples

See [LIBRARY_README.md](./LIBRARY_README.md) for usage examples.
