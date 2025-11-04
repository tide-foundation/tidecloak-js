# Policy Builder Design Guidelines

## Design System Foundation

**Approach**: Fluent Design + Developer Tool Aesthetics  
**Principles**: Visual hierarchy over decoration, type-based visual coding, glass morphism layering, smooth micro-interactions, progressive disclosure

**Typography**:
- Interface: Inter (400/500/600) via Google Fonts
- Code: JetBrains Mono (400/500)
- Hierarchy: App title `text-xl font-semibold tracking-tight` → Panel headers `text-sm font-semibold uppercase tracking-wide` → Block titles `text-sm font-medium` → Labels `text-xs font-medium uppercase tracking-wider` → Body `text-sm` → Code `text-xs font-mono` → Meta `text-xs opacity-70`

**Spacing**: Tailwind units—2, 3, 4, 6, 8, 12, 16, 20

**Layout**: 
- 3-panel: Left sidebar `w-80`, Center canvas `flex-1`, Right panel `w-96`
- Mobile: Vertical stack with slide-out drawers
- Viewport: `h-screen flex flex-col`, toolbar `h-14`, workspace `flex-1 flex overflow-hidden`

---

## Component Specifications

### Top Toolbar
`px-6 py-3 flex justify-between items-center`
- Left: Branding + breadcrumb
- Center: Editable policy name `text-base font-medium`
- Right: Save/Publish/Share + avatar
- Mode switcher: `px-5 py-2 text-sm font-medium`, 200ms transition

### Left Sidebar - Block Palette
**Header**: `p-6 pb-4`
- Title + search input `h-9 rounded-lg`

**Categories**: Collapsible groups, `py-3 text-xs uppercase tracking-wider`, `mb-6` spacing

**Block Cards**: `p-4 rounded-xl border-2 cursor-grab`
- Icon: `w-10 h-10 rounded-lg` (20px Heroicons)
- Text: Title + description `text-xs opacity-70 mt-1`
- Hover: `shadow-md` elevation, border emphasis
- Drag: `opacity-60 scale-95`

**Type Differentiation**:
- Conditions: Rounded, diamond icon, `border-l-4`
- Decisions: Sharp corners, shield icon, `border-t-4`
- Logic: Hexagonal, circuit icon, `border-r-4`
- Actions: Pill-shaped, lightning icon, `border-b-4`

### Center Canvas
**Container**: `p-12`, 8px grid background, min-height viewport minus toolbar

**Drop Zones**:
- Valid: Dashed `border-2 rounded-lg` pulse
- Active: Solid border with glow
- Invalid: Red flash (200ms)
- Between blocks: Horizontal insertion line

**Block Rendering**: `rounded-2xl shadow-lg border-2 backdrop-blur p-5`
- Header: Icon `w-8 h-8` + title `text-base font-medium` + menu (flex gap-3)
- Content: `mt-4 space-y-3`, nested blocks `ml-12 mt-4` with connecting line
- Footer: `text-xs opacity-70`
- Drag handle: 4px left edge, visible on hover

**Connections**: 2px vertical lines, curved branches, labeled paths (True/False), 24px spacing

**Canvas Toolbar** (floating): Zoom ±, fit, minimap, grid—all `h-8 w-8 rounded-lg`

### Right Panel - Properties/Testing/Validation
**Tabs**: `px-6 py-3 text-sm font-medium`, sliding indicator

**Properties**:
- Sections: `text-xs font-semibold uppercase tracking-wider mb-3`
- Fields: `space-y-6 p-6`
- Inputs: `h-10 px-3 rounded-lg border-2`, focus `border-emphasis`
- Toggles: `w-11 h-6 rounded-full`
- Claims builder: Grid `grid-cols-2 gap-3`, drag handles, hover remove

**Testing**:
- Scenario dropdown + JSON editor (syntax highlighting)
- Run: `w-full h-12 rounded-xl font-medium`
- Results: Success/failure `p-4 rounded-lg` with icons, decision tree visualization

**Validation**:
- Issues: `space-y-2`, each `p-3 rounded-lg border-l-4` by severity (Error/Warning/Info)
- Inline quick fixes

### Action Bar (Bottom)
`h-16 px-8 flex items-center justify-between border-t`
- Left: Status (saved state, compile time)
- Center: Stats (block count, complexity)
- Right: Check/Compile `px-8 py-3 rounded-xl shadow-lg`, Export dropdown, Reset ghost
- Toasts: Top-right slide-in, success auto-dismiss 3s, errors persistent

---

## Advanced Features

### Code Editor
Monaco Editor integration:
- C# syntax with DSL extensions
- Line numbers `w-12`, minimap `w-24`
- `text-sm font-mono` (14px) with ligatures
- Toolbar `h-12 px-4`: Breadcrumb, Format, Insert snippet, Split view

### Minimap
240×160px bottom-right floating, draggable viewport outline, collapsible to icon

### Context Menus
**Block** (right-click): Edit, Duplicate, Delete, Convert, Annotate—`py-1.5 px-3 text-sm` (16px icons)  
**Canvas**: Paste, Select all, Clear, Import

---

## Interactions

**Drag & Drop**:
- States: `cursor-grab` → `cursor-grabbing opacity-70 scale-105 rotate-2`
- Ghost preview follows cursor
- Drop: Spring animation to position
- Invalid: Shake (3 frames, 300ms)

**Hover**: `shadow-md` elevation, border emphasis, `scale-105` buttons (150ms ease-in-out)

**Selection**: 
- Single: `border-2` emphasis with glow
- Multi: Checkboxes in corners, floating toolbar above

**Panel Resize**: 
- 8px handles `cursor-col-resize`
- Min: Sidebar 240px, properties 320px
- Snap: 25%, 33%, 50%

---

## Responsive

**Desktop (lg+)**: Full 3-panel  
**Tablet (md)**: 2-panel + drawer overlay  
**Mobile (sm)**: Single panel, bottom tab bar

**Mobile Adaptations**:
- Palette: Full-screen modal
- Canvas: Full width, zoom-to-fit
- Properties: Bottom sheet
- Touch targets: Min 44px

---

## Accessibility

- **Keyboard**: Tab, Arrows, Enter/Space, Escape
- **Drag alternative**: Select + Arrows + Enter
- **ARIA**: Live regions for compilation status
- **Focus**: 2px ring, 2px offset, 4.5:1 contrast minimum
- **Motion**: Respect `prefers-reduced-motion`

---

## Visual Polish

**Elevation**: 
- L0 (canvas): Base
- L1 (cards): `shadow-sm`
- L2 (panels): `shadow-md`
- L3 (modals): `shadow-xl`
- L4 (tooltips): `shadow-2xl`

**Glassmorphism**:
- Toolbars: `backdrop-blur-lg` + transparency
- Overlays: `backdrop-blur-md`
- Drop zones: `backdrop-blur-sm`

**Borders**:
- Default: 1px separation
- Interactive: 2px emphasis
- Type indicators: 4px accent
- Focus: 2px offset ring

**Loading**:
- Skeleton screens with shimmer
- Spinners: 20px inline, 32px full-page
- Progress bars: 4px height `rounded-full`