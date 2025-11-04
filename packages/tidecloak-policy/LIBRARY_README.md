# Policy Builder Component Library

A visual, drag-and-drop policy builder for creating authorization rules in multiple programming languages. Built for React and Next.js applications.

## Features

- 🎨 **Visual Block-Based Editor** - Build complex authorization policies without writing code
- 🔄 **Multi-Language Support** - Generate code in C#, Python, Java, or add your own language
- 🧩 **Pluggable Architecture** - Extend with custom blocks and generators
- 📝 **Plain English Summaries** - Understand what your policy does in everyday language
- 🔍 **Real-Time Validation** - See code generation and validation as you build
- 🎯 **Type-Safe** - Full TypeScript support with exported types
- ⚡ **Framework Agnostic** - Works with React, Next.js, or any React-based framework

## Installation

### Option 1: NPM Package (Recommended)

Install via npm for easy updates and dependency management:

```bash
npm install @yourorg/policy-builder
```

Or install via your SDK:

```bash
# JavaScript SDK
npm install @yourorg/sdk

# React SDK
npm install @yourorg/react-sdk

# Next.js SDK
npm install @yourorg/nextjs-sdk
```

**📦 See [NPM_PACKAGE_GUIDE.md](./NPM_PACKAGE_GUIDE.md) for complete packaging and publishing instructions.**

### Option 2: Copy Files (Development)

For development or customization:

```bash
# Copy the minimal policy-builder components to your project
cp -r client/src/components/policy-builder your-project/src/components/
cp -r shared your-project/src/
```

## Quick Start

### Basic Usage

```tsx
import { useState } from 'react';
import { 
  PolicyBuilder,
  type PolicyBlock,
  type Model,
  type Claim,
  PREDEFINED_MODELS 
} from '@/components/policy-builder';

function MyApp() {
  return <PolicyBuilder />;
}
```

### Custom Integration

If you want more control, use the individual components:

```tsx
import { useState } from 'react';
import {
  BlockPalette,
  PolicyCanvas,
  PropertiesPanel,
  ActionBar,
  type PolicyBlock,
  type Model,
  PREDEFINED_MODELS,
} from '@/components/policy-builder';

function CustomPolicyBuilder() {
  const [mode, setMode] = useState<'simple' | 'advanced'>('simple');
  const [selectedModel, setSelectedModel] = useState<Model | null>(PREDEFINED_MODELS[0]);
  const [blocks, setBlocks] = useState<PolicyBlock[]>([]);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);

  const handleCompile = async () => {
    const response = await fetch('/api/policy/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        modelId: selectedModel?.id,
        mode,
        blocks,
        language: 'csharp', // or 'python', 'java', etc.
      }),
    });
    const result = await response.json();
    console.log('Generated code:', result.generatedCode);
  };

  return (
    <div className="flex h-screen">
      {/* Block Palette - Left Sidebar */}
      <div className="w-80 border-r">
        <BlockPalette
          selectedModel={selectedModel}
          onAddBlock={(block) => setBlocks([...blocks, block])}
        />
      </div>

      {/* Policy Canvas - Main Area */}
      <div className="flex-1">
        <PolicyCanvas
          blocks={blocks}
          selectedBlockId={selectedBlockId}
          onBlocksChange={setBlocks}
          onBlockSelect={setSelectedBlockId}
        />
      </div>

      {/* Properties Panel - Right Sidebar */}
      <div className="w-96 border-l">
        <PropertiesPanel
          selectedBlock={blocks.find(b => b.id === selectedBlockId) || null}
          selectedModel={selectedModel}
          claims={[]}
          onClaimsChange={() => {}}
          onBlockUpdate={(updated) => {
            setBlocks(blocks.map(b => b.id === updated.id ? updated : b));
          }}
          allBlocks={blocks}
        />
      </div>

      {/* Action Bar - Bottom */}
      <ActionBar
        isCompiling={false}
        compileResult={null}
        onCompile={handleCompile}
        onReset={() => setBlocks([])}
        mode={mode}
        hasContent={blocks.length > 0}
        hasModel={selectedModel !== null}
      />
    </div>
  );
}
```

## API Overview

### Components

- **PolicyBuilder** - Complete policy builder page with all features
- **BlockPalette** - Draggable block library (Conditions, Decisions, Logic Operators, Actions)
- **PolicyCanvas** - Main canvas for arranging blocks with drag-and-drop
- **PropertiesPanel** - Dynamic properties editor for selected blocks
- **ActionBar** - Compilation and reset controls
- **AdvancedEditor** - Code editor for advanced mode
- **ModelSelector** - Model selection dropdown

### Types

```typescript
import type {
  PolicyBlock,      // Individual logic block
  BlockType,        // Block type enum
  Model,            // Access control model
  ModelField,       // Model field definition
  Claim,            // Test claim (key-value pair)
  Policy,           // Complete policy configuration
  CompileResult,    // Compilation result
  CompileRequest,   // Compilation request
  CodeGenerator,    // Generator interface
  LanguageInfo,     // Language metadata
} from '@/components/policy-builder';
```

### Utilities

```typescript
import {
  buildBlockMap,      // Create a block ID lookup map
  getAllBlocks,       // Get all blocks (flattened)
  getRootBlocks,      // Get top-level blocks
  getBlockChildren,   // Get children of a block
  removeBlockFromTree,// Remove a block and its descendants
  addBlockToBranch,   // Add block to If/Else branch
} from '@/components/policy-builder';
```

## Server-Side Setup

### Setting Up the API

The library requires server-side endpoints for code generation:

```typescript
// server/index.ts
import { generatorRegistry } from './lib/generators/registry';
import { CSharpGenerator } from './lib/generators/CSharpGenerator';

// Register generators on startup
generatorRegistry.register('csharp', new CSharpGenerator());
```

### API Endpoints

The library expects these endpoints to be available:

- `POST /api/policy/compile` - Compile policy blocks to code
- `GET /api/generators` - List available code generators
- `GET /api/models` - Get available models (optional)

## Multi-Language Support

### Using Different Languages

```typescript
// Generate Python code
const result = await fetch('/api/policy/compile', {
  method: 'POST',
  body: JSON.stringify({
    modelId: 'ForsetiModel:1',
    mode: 'simple',
    blocks: myBlocks,
    language: 'python', // Specify target language
  }),
});
```

### Available Languages

Check available languages at runtime:

```typescript
const response = await fetch('/api/generators');
const { generators } = await response.json();
console.log('Available languages:', generators);
```

## Next.js Integration

### App Router (Next.js 13+)

```tsx
// app/policy-builder/page.tsx
'use client';

import { PolicyBuilder } from '@/components/policy-builder';

export default function PolicyBuilderPage() {
  return <PolicyBuilder />;
}
```

### Pages Router (Next.js 12 and below)

```tsx
// pages/policy-builder.tsx
import { PolicyBuilder } from '@/components/policy-builder';

export default function PolicyBuilderPage() {
  return <PolicyBuilder />;
}
```

## Styling

The library uses Tailwind CSS and Shadcn UI components. Ensure your project has:

```bash
# Install dependencies
npm install tailwindcss @tailwindcss/typography
npm install @radix-ui/react-dialog @radix-ui/react-dropdown-menu
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
npm install lucide-react class-variance-authority clsx
```

Configure Tailwind to include the policy-builder components:

```js
// tailwind.config.js
module.exports = {
  content: [
    './src/components/policy-builder/**/*.{js,ts,jsx,tsx}',
    // ... your other paths
  ],
  // ... rest of config
};
```

## Examples

### Example 1: Read-Only Policy Viewer

```tsx
import { PolicyCanvas } from '@/components/policy-builder';

function PolicyViewer({ blocks }: { blocks: PolicyBlock[] }) {
  return (
    <PolicyCanvas
      blocks={blocks}
      onBlocksChange={() => {}} // No-op for read-only
      onBlockSelect={() => {}}
      selectedBlockId={null}
    />
  );
}
```

### Example 2: Custom Block Types

```tsx
// Extend the block types for your use case
const CUSTOM_BLOCK_CATEGORIES = {
  ...BLOCK_CATEGORIES,
  custom: {
    label: 'Custom Blocks',
    description: 'Your custom block types',
    blocks: [
      {
        type: 'custom_action' as BlockType,
        label: 'Custom Action',
        icon: Star,
        description: 'Your custom action block',
      },
    ],
  },
};
```

### Example 3: Save/Load Policies

```tsx
async function savePolicy(blocks: PolicyBlock[]) {
  await fetch('/api/policies', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'My Policy',
      modelId: 'ForsetiModel:1',
      mode: 'simple',
      blocks,
    }),
  });
}

async function loadPolicy(policyId: string) {
  const response = await fetch(`/api/policies/${policyId}`);
  const policy = await response.json();
  setBlocks(policy.blocks);
}
```

## Documentation

- **[Implementation Guide](./IMPLEMENTATION_GUIDE.md)** - Step-by-step setup for React, Next.js, and JavaScript projects
- [Architecture Guide](./ARCHITECTURE.md) - System design and data flow
- [API Reference](./API_REFERENCE.md) - Complete component and prop documentation
- [Extending Languages](./EXTENDING_LANGUAGES.md) - Add support for new programming languages

## Requirements

- React 18+
- TypeScript 4.5+
- Tailwind CSS 3+
- Node.js 18+ (for server-side code generation)

## License

ISC

## Support

For issues and questions, please refer to the documentation or create an issue in the repository.
