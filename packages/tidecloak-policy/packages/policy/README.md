# @tidecloak/policy

A zero-dependency React component library for building visual access control policies with drag-and-drop interface and real-time code generation.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-100%25-blue.svg)](https://www.typescriptlang.org/)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](package.json)

## 🎯 Features

- **Zero Runtime Dependencies** - Only requires React as a peer dependency
- **Visual Policy Builder** - Drag-and-drop interface for creating complex access control policies
- **Real-time Code Generation** - Instant C# code generation as you build
- **Plain English Summaries** - Automatically generates human-readable policy descriptions
- **Custom Models** - Define your own data models with flexible field types
- **Dark Mode Support** - Built-in dark mode with system preference detection
- **Type Safe** - Full TypeScript support with comprehensive type definitions
- **Client-side Only** - All compilation and validation happens in the browser

## 📦 Installation

```bash
npm install @tidecloak/policy
```

Or with yarn:

```bash
yarn add @tidecloak/policy
```

Or with pnpm:

```bash
pnpm add @tidecloak/policy
```

**Peer Dependencies:**
- `react` >= 18.0.0
- `react-dom` >= 18.0.0

## 🚀 Quick Start

### Basic Usage

```tsx
import { PolicyBuilder } from '@tidecloak/policy/react';
import '@tidecloak/policy/style.css';

function App() {
  return (
    <div className="app">
      <PolicyBuilder />
    </div>
  );
}
```

### With Custom Initial Blocks

```tsx
import { PolicyBuilder } from '@tidecloak/policy/react';
import type { PolicyBlock } from '@tidecloak/policy';
import '@tidecloak/policy/style.css';

const initialBlocks: PolicyBlock[] = [
  {
    id: 'block-1',
    type: 'condition',
    config: {
      field: 'role',
      operator: 'equals',
      value: 'admin'
    }
  }
];

function App() {
  return <PolicyBuilder initialBlocks={initialBlocks} />;
}
```

### With Custom Models

```tsx
import { PolicyBuilder } from '@tidecloak/policy/react';
import type { Model } from '@tidecloak/policy';
import '@tidecloak/policy/style.css';

const customModels: Model[] = [
  {
    id: 'MyModel:1',
    name: 'My Custom Model',
    description: 'Custom access control model',
    fields: [
      { key: 'userId', type: 'string', label: 'User ID' },
      { key: 'permissions', type: 'array', label: 'Permissions' },
      { key: 'metadata', type: 'object', label: 'Metadata' }
    ]
  }
];

function App() {
  return <PolicyBuilder models={customModels} />;
}
```

## 📚 API Reference

### Components

#### `PolicyBuilder`

The main component that renders the complete policy builder interface.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `initialBlocks` | `PolicyBlock[]` | `[]` | Initial policy blocks to display |
| `models` | `Model[]` | `PREDEFINED_MODELS` | Available data models for policy building |

**Example:**

```tsx
<PolicyBuilder
  initialBlocks={[]}
  models={PREDEFINED_MODELS}
/>
```

### Types

#### `PolicyBlock`

Represents a single block in the policy builder.

```typescript
interface PolicyBlock {
  id: string;
  type: 'condition' | 'if_else' | 'logic_and' | 'logic_or' | 'logic_not' | 'allow' | 'deny';
  config: {
    field?: string;
    operator?: 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'greater_than' | 'less_than';
    value?: string;
    description?: string;
  };
  children?: PolicyBlock[];
}
```

#### `Model`

Defines an access control data model.

```typescript
interface Model {
  id: string;
  name: string;
  description: string;
  fields: ModelField[];
  category?: 'custom';
}
```

#### `ModelField`

Defines a field within a model.

```typescript
interface ModelField {
  key: string;
  type: 'string' | 'array' | 'object';
  label: string;
  options?: string[];
}
```

#### `Claim`

Key-value pairs for testing policies.

```typescript
interface Claim {
  key: string;
  value: string;
}
```

### Predefined Models

The library includes four predefined models:

1. **Forseti Access Model** - For Forseti authorization system
2. **User Access Model** - Simple role-based access control
3. **Document Access Model** - Document-based access control
4. **Custom Model** - Define your own fields dynamically

```typescript
import { PREDEFINED_MODELS } from '@tidecloak/policy';
```

## 🎨 Styling

### Default Styles

Import the default stylesheet in your application:

```tsx
import '@tidecloak/policy/style.css';
```

### Dark Mode

The component automatically supports dark mode through the `.dark` class on a parent element or the `prefers-color-scheme` media query.

**Manual Dark Mode Toggle:**

```tsx
// Add/remove 'dark' class on document root
document.documentElement.classList.add('dark');
document.documentElement.classList.remove('dark');
```

**Using a Theme Provider:**

```tsx
import { useEffect, useState } from 'react';

function ThemeProvider({ children }) {
  const [theme, setTheme] = useState('light');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  return (
    <div>
      <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
        Toggle Theme
      </button>
      {children}
    </div>
  );
}
```

### Custom CSS Variables

You can customize the appearance by overriding CSS variables:

```css
:root {
  --pb-accent-primary: #0969da;
  --pb-accent-primary-hover: #0550ae;
  --pb-bg-primary: #ffffff;
  --pb-text-primary: #0d1117;
  /* ... and many more */
}
```

## 🔧 Advanced Usage

### Custom Field Input

For ad-hoc field names, use the "Custom field..." option in the field dropdown:

1. Select a Condition block
2. In the Field dropdown, choose "Custom field..."
3. Enter any field name directly in the input that appears

### Custom Model Workflow

1. Select "Custom Model" from the model dropdown
2. In the Custom Fields section of the properties panel:
   - Enter a field name (e.g., "userId", "role")
   - Select a field type (String, Array, Object)
   - Click "Add Field"
3. Your custom fields will now appear in Field dropdowns for Condition blocks

### Compiling Policies Programmatically

```typescript
import { compilePolicy } from '@tidecloak/policy';

const result = await compilePolicy(
  'simple',           // mode: 'simple' | 'advanced'
  blocks,             // PolicyBlock[]
  undefined,          // code?: string (for advanced mode)
  claims,             // Claim[]
  'csharp'           // language: 'csharp'
);

if (result.success) {
  console.log('Generated Code:', result.generatedCode);
  console.log('Plain English:', result.plainEnglish);
} else {
  console.error('Errors:', result.errors);
}
```

## 🧪 Block Types

### Condition Block
Tests a specific field against a value using an operator.

**Config:**
- `field`: Field name to test
- `operator`: Comparison operator (equals, not_equals, contains, etc.)
- `value`: Value to compare against

### Decision Block (If/Else)
Creates a branching decision with If/Else paths.

**Config:**
- `description`: Optional description of the decision

### Logic Blocks
- **AND**: Both conditions must be true
- **OR**: Either condition must be true
- **NOT**: Negates the following condition

### Action Blocks
- **Allow**: Grant access
- **Deny**: Deny access

## 🌐 Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)

The library uses native browser APIs:
- HTML5 Drag & Drop API
- `crypto.randomUUID()`
- CSS Variables
- ES Modules

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details

## 🤝 Contributing

Contributions are welcome! This is a zero-dependency library, so please avoid adding runtime dependencies.

### Development Setup

```bash
# Clone the repository
git clone <repository-url>

# Install dependencies
npm install

# Start the demo app
npm run dev

# Build the library
npm run build
```

### Project Structure

```
packages/
├── policy/          # The library (published to npm)
│   ├── src/
│   │   ├── react/   # React components
│   │   ├── generators/ # Code generators
│   │   ├── types.ts # Type definitions
│   │   └── style.css # Styles
│   └── package.json
└── demo/           # Demo app (local only)
    └── src/
```

## 🐛 Known Issues

None at this time. Please report issues on the GitHub repository.

## 📮 Support

For questions, issues, or feature requests, please open an issue on GitHub.

---

**Built with ❤️ using zero dependencies and pure TypeScript**
