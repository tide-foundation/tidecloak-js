# @tidecloak/policy

Visual policy builder component library for access control and authorization rules.

## 🎯 What is this?

A reusable React component library that provides a visual, drag-and-drop interface for building access control policies. It runs entirely client-side with zero backend dependencies.

## 📦 Package Structure

This is a monorepo containing:

- **`packages/policy`** - The reusable component library (published to npm)
- **`packages/demo`** - Demo app for local development and testing (not published)

## 🚀 Quick Start

### Using the Library

```bash
npm install @tidecloak/policy
```

```tsx
import { PolicyBuilder } from '@tidecloak/policy/react';
import '@tidecloak/policy/style.css';

function App() {
  return <PolicyBuilder />;
}
```

### Development

```bash
# Start the demo app (with hot reload from library source)
npm run dev

# Build the library for distribution
cd packages/policy
npm run build
```

## 📖 Documentation

### Core Imports

```ts
// Core logic and types
import { compilePolicy, CSharpGenerator } from '@tidecloak/policy';

// React components
import { PolicyBuilder } from '@tidecloak/policy/react';

// Styles
import '@tidecloak/policy/style.css';
```

### Features

- ✅ **Zero Dependencies** - Pure React component library, no third-party runtime dependencies
- ✅ **Client-Side Code Generation** - Compiles policies to C# code entirely in browser
- ✅ **Visual Builder** - Drag-and-drop interface for creating policies
- ✅ **Type-Safe** - Full TypeScript support with exported types
- ✅ **Framework Agnostic** - Works with Next.js, Vite, CRA, or any React setup

## 🛠️ Technology

- **React 18** (peer dependency)
- **TypeScript**
- **Vite** (for building)
- **Zero runtime dependencies**

## 📝 License

MIT
