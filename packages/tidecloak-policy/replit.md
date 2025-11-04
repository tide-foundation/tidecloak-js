# Policy Builder - Visual Access Control Designer

## Overview
The Policy Builder is a React component library offering a visual, drag-and-drop interface for non-developers to create complex access control policies. It enables zero-code policy building with real-time validation and a model-based configuration system. For advanced users, it provides direct C# code editing. The project aims to provide a user-friendly, robust tool for designing and managing authorization rules.

## Recent Changes

### November 3, 2025 - Model Restrictions, Field Dropdowns & Advanced Code Mode ✅
**Major UX Improvements:**
- **Informative Messaging for Default Models** - Clear guidance prevents user confusion
  - Canvas empty state explains parameters-only mode for default models
  - Directs users to Test Claims section with helpful examples
  - Suggests switching to Custom Model for block-based logic
  - Test Claims section has context-aware helper text (different for default vs custom models)
  - Empty claims state includes call-to-action with usage guidance
- **Default Models (Parameters Only)** - Predefined models (Forseti, User Access, Document) now only accept parameters, not logic blocks
  - Block palette hidden for default models
  - Only Custom Model shows full block palette for policy logic
  - Enforces cleaner separation between parameter-based and logic-based policies
- **Test Claims with Field Dropdowns** - Claims now use dropdown selectors populated with model fields
  - Automatically shows available fields from selected model
  - Falls back to text input for Custom Model with no fields defined
  - Improves UX by guiding users to valid field names
- **Advanced Code Mode** - Added tab-based mode switcher for visual vs code editing
  - "Visual Builder" tab - Drag-and-drop block interface (simple mode)
  - "Advanced Code" tab - Direct C# code editor (advanced mode, Custom Model only)
  - Mode tabs in header with clear disabled state for default models
  - Advanced Code tab shows tooltip: "Advanced Code is only available for Custom Model"
  - Auto-reverts to Visual Builder when switching from Custom Model to default models
  - Code editor with monospace font and syntax-appropriate styling
  - 2-column layout in advanced mode (code editor + properties panel)
- **Live Code Preview** - Real-time C# code generation in properties panel
  - Shows generated code for both Visual Builder (blocks) and Advanced Code modes
  - Debounced generation with 300ms delay for performance
  - Shows loading state during generation
  - Appears in properties panel for both modes
- **Plain English Summary** - "What You Created" section in properties panel
  - Natural language description of the policy
  - Works in both Visual Builder and Advanced Code modes
  - Automatically generated alongside code preview
- **State Preservation** - Blocks and advanced code persist when switching modes
  - Visual Builder blocks remain when viewing Advanced Code tab
  - Advanced code remains when viewing Visual Builder tab
  - No accidental data loss when exploring different modes

### November 3, 2025 - Custom Fields & Custom Model Support ✅
**Added Flexible Field Configuration:**
- **Custom Model** - New predefined model option allowing users to define their own fields
  - Appears in model selector dropdown alongside predefined models (Forseti, User Access, Document)
  - Custom Fields Manager in properties panel for defining field structure
  - Each field has: name, type (string/array/object), and label
  - Add/remove custom fields dynamically via UI
- **Custom Field Input** - Enhanced field selection in Condition blocks
  - "Custom field..." option in field dropdown
  - Shows text input when selected, allowing arbitrary field names
  - Works with both predefined and custom models
- **UI Improvements**
  - Fixed dropdown width (220px min-width) to prevent layout shifts
  - Improved "Select a block" empty state with dashed border and larger icon
  - Added pointer cursors to all interactive elements (blocks, dropdowns, options)
  - Added `user-select: none` to dropdown options for better UX
- **Fixed Scrolling Issues**
  - Added proper padding to sidebars (left and right) to prevent content cutoff
  - Added extra padding-bottom to canvas area to ensure last block is fully visible
  - Content now scrolls smoothly with proper spacing at bottom
- **Package Documentation**
  - Created comprehensive README.md for npm distribution
  - Includes installation, quick start, API reference, examples
  - Documents all features: custom models, dark mode, styling
  - Provides TypeScript type documentation

### November 3, 2025 - Monorepo Structure for npm Distribution ✅
**Separated Library from Demo App:**
- **Created monorepo structure** with `packages/policy` (library) and `packages/demo` (demo app)
  - Library at `packages/policy/` - clean, publishable npm package
  - Demo app at `packages/demo/` - local-only development environment
- **Configured library package** with proper exports for npm
  - Main export: `@tidecloak/policy` (core logic + types)
  - React export: `@tidecloak/policy/react` (components)
  - CSS export: `@tidecloak/policy/style.css`
  - Vite library build configured for ESM + TypeScript declarations
- **Set up demo app** with hot module reload from library source
  - Path aliases resolve to library source files (not built files)
  - Changes to library code hot-reload instantly in demo app
  - Minimal demo styling showcases library components
- **Updated documentation** with usage examples and development workflow
- **Tested and verified**: Demo app works correctly, imports resolve, HMR functional

### November 2, 2025 - Pure Frontend Component Library ✅
**Removed All Server Dependencies:**
- **Eliminated Express.js backend** - all code generation now runs client-side in the browser
  - Moved `CSharpGenerator` from server to `client/src/lib/generators/`
  - Moved generator registry to client-side
  - Created `client/src/lib/compilePolicy.ts` for client-side compilation
  - Removed all API endpoints (`/api/policy/compile`, `/api/models`, etc.)
- **Updated components** to use client-side compiler instead of API calls
  - `PolicyBuilder.tsx`: Now uses direct `compilePolicy()` function calls
  - `PropertiesPanel.tsx`: Live code preview runs entirely in browser
- **Minimal dev server** - `server/index.ts` now only starts Vite (no Express, no routes)
- **Removed dependencies**: express, @types/express, ws, bufferutil
- **Tested and verified**: All functionality works client-side with zero API calls
- **This is now a pure frontend React component library** ready for npm distribution

### November 2, 2025 - Dependency Elimination & Styling Improvements
**Major Security & UX Overhaul:**
- **Removed major third-party dependencies** to reduce supply chain attack risks
  - Removed Drizzle ORM, drizzle-zod, drizzle-kit, @neondatabase/serverless
  - Removed Zod runtime validation library
  - Removed express-session, memorystore
- **Converted to Pure TypeScript types** - replaced Zod schemas with plain TypeScript interfaces
- **Complete CSS redesign** with professional VS Code-inspired aesthetic
  - Fixed dark mode support
  - Implemented dual dark mode support: `.dark` class + `prefers-color-scheme` media query
  - Improved color contrast and readability
  - Better visual hierarchy with modern color palette

## User Preferences
- **Design Philosophy**: Clean, professional developer-tool aesthetic (VS Code inspired)
- **Information Density**: Comfortable spacing in simple mode, compact in advanced mode
- **Interaction Style**: Smooth transitions, subtle hover effects, immediate feedback
- **Accessibility**: Full keyboard navigation, proper ARIA labels, WCAG AA compliance

## System Architecture

### Monorepo Structure
The project uses a monorepo structure optimized for npm package distribution:

**`packages/policy/`** - The reusable component library (published to npm as `@tidecloak/policy`)
- Zero runtime dependencies (only React as peer dependency)
- Exports: core logic, React components, and CSS
- Built with Vite in library mode (ESM + TypeScript declarations)
- Designed for consumption in any React application

**`packages/demo/`** - Demo application (local only, never published)
- Showcases library components in action
- Imports from library source files for hot reload during development
- Minimal styling to highlight library functionality
- Runs on Vite dev server (port 5000)

### Package Exports
The library provides clean, documented exports:
- `@tidecloak/policy` - Core compilation logic and types
- `@tidecloak/policy/react` - React components (PolicyBuilder, etc.)
- `@tidecloak/policy/style.css` - Component styles

### Frontend Components
The frontend provides an intuitive UI/UX with visual block building, drag-and-drop functionality using the native HTML5 Drag & Drop API, and dynamic property editors.
Key features include:
- **Visual Block Building**: Support for Decision, Condition, and Logic Operator blocks.
- **Dynamic Editors**: Block-type-specific property configuration.
- **Custom Model Support**: Users can define their own data models with custom fields
  - Custom Fields Manager for adding/removing fields
  - Field types: string, array, object
  - Custom fields appear in field dropdowns for condition blocks
- **Custom Field Input**: "Custom field..." option allows entering arbitrary field names
  - Shows text input when selected
  - Useful for one-off fields or testing
- **Test Claims Builder**: For validating policies with custom claims.
- **Live Code Preview**: Real-time C# code generation with debouncing.
- **Plain English Summary**: A "What You Created" section provides a natural language description of the policy.
- **Model-Aware Fields**: Smart dropdowns based on the selected data model.
- **Design System**: Utilizes plain CSS with CSS variables for a clean aesthetic.
- **Workflow**: Employs a model-first approach, guiding users to select a model before policy creation.

### Code Generation (Client-Side)
The code generation runs entirely in the browser using a pluggable generator system (via `CodeGenerator` interface), with a built-in C# generator. It handles:
- Translation of visual blocks into target language code
- Validation for both simple and advanced modes
- Generation of plain English policy descriptions
- No backend required - all compilation happens client-side

### Data Models
Core data models include:
- **Policy**: Stores overall policy configurations.
- **PolicyBlock**: Represents individual logic blocks.
- **Model**: Defines access control model structures.
  - Predefined models: Forseti Access Model, User Access Model, Document Access Model
  - Custom Model: User-defined fields with flexible structure
- **ModelField**: Defines individual fields within a model (key, type, label, optional values)
- **Claim**: Key-value pairs for policy testing.

### Simplified Configuration
The system hardcodes values for "Mode," "Resource," "Action," and "Base URL" in simple mode to streamline the user experience.

## External Dependencies

### Current Version (Zero Runtime Dependencies)
The Policy Builder is a pure frontend component library with ZERO third-party runtime dependencies:

- **Frontend Framework**: React + React DOM (peer dependencies only)
- **Native Browser APIs**: HTML5 Drag & Drop, `crypto.randomUUID()`
- **Language**: Pure TypeScript with compile-time types (no runtime validation libraries)
- **Styling**: Plain CSS with CSS variables (no CSS frameworks)
- **Icons**: Inline SVG (no icon libraries)
- **Code Generation**: Client-side TypeScript (runs in browser, no server needed)
- **Storage**: In-memory TypeScript types (no database, no ORM, no persistence)
- **Build Tools**: Vite, TypeScript (dev dependencies only)

**All Dependencies Removed:**
- ❌ `express`, `@types/express` (no backend server)
- ❌ `drizzle-orm`, `drizzle-zod`, `drizzle-kit` (no database)
- ❌ `@neondatabase/serverless` (no database driver)
- ❌ `zod` (no runtime validation - pure TypeScript types)
- ❌ `express-session`, `memorystore` (no session management)
- ❌ `ws`, `bufferutil` (no WebSocket)
- ❌ `esbuild` (no server bundling needed)

**Current Dependencies:**
- **Runtime**: ZERO third-party dependencies
- **Peer Dependencies**: `react`, `react-dom` (expected to be provided by consuming application)
- **Dev Dependencies**: `@replit/vite-plugin-*` (local development only), `vite`, `typescript`, `@vitejs/plugin-react`, `@types/*`

**For npm distribution:**
1. The component library has ZERO runtime dependencies (100% reduction!)
2. Only requires `react` and `react-dom` as peer dependencies
3. Include only the compiled component files from `dist/`
4. Consumers can use it in any React application without any additional dependencies

This is a **100% dependency-free** React component library, making it:
- ✅ Extremely secure (zero supply chain attack surface)
- ✅ Lightweight (tiny bundle size)
- ✅ Framework-agnostic (works with Next.js, Vite, CRA, etc.)
- ✅ Production-ready for npm distribution