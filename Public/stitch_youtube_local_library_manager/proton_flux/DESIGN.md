---
name: Proton Flux
colors:
  surface: '#10131a'
  surface-dim: '#10131a'
  surface-bright: '#363941'
  surface-container-lowest: '#0b0e15'
  surface-container-low: '#191b23'
  surface-container: '#1d2027'
  surface-container-high: '#272a31'
  surface-container-highest: '#32353c'
  on-surface: '#e1e2ec'
  on-surface-variant: '#c2c6d6'
  inverse-surface: '#e1e2ec'
  inverse-on-surface: '#2e3038'
  outline: '#8c909f'
  outline-variant: '#424754'
  surface-tint: '#adc6ff'
  primary: '#adc6ff'
  on-primary: '#002e6a'
  primary-container: '#4d8eff'
  on-primary-container: '#00285d'
  inverse-primary: '#005ac2'
  secondary: '#ffb4a8'
  on-secondary: '#690100'
  secondary-container: '#ff5540'
  on-secondary-container: '#5c0000'
  tertiary: '#ffb786'
  on-tertiary: '#502400'
  tertiary-container: '#df7412'
  on-tertiary-container: '#461f00'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#d8e2ff'
  primary-fixed-dim: '#adc6ff'
  on-primary-fixed: '#001a42'
  on-primary-fixed-variant: '#004395'
  secondary-fixed: '#ffdad4'
  secondary-fixed-dim: '#ffb4a8'
  on-secondary-fixed: '#410000'
  on-secondary-fixed-variant: '#930100'
  tertiary-fixed: '#ffdcc6'
  tertiary-fixed-dim: '#ffb786'
  on-tertiary-fixed: '#311400'
  on-tertiary-fixed-variant: '#723600'
  background: '#10131a'
  on-background: '#e1e2ec'
  surface-variant: '#32353c'
typography:
  display-lg:
    fontFamily: Geist
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  display-md:
    fontFamily: Geist
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.3'
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Geist
    fontSize: 18px
    fontWeight: '600'
    lineHeight: '1.4'
  body-md:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
  body-sm:
    fontFamily: Geist
    fontSize: 13px
    fontWeight: '400'
    lineHeight: '1.5'
  label-caps:
    fontFamily: Geist
    fontSize: 11px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: 0.05em
  mono-data:
    fontFamily: Geist
    fontSize: 13px
    fontWeight: '500'
    lineHeight: '1'
    letterSpacing: -0.01em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  container-margin: 24px
  gutter: 16px
  sidebar-width: 260px
  stack-xs: 4px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 24px
---

## Brand & Style

The design system is engineered for **YT Library Local**, a high-performance utility for managing vast video archives. The personality is **Technical, Precise, and High-Utility**, prioritizing information density without sacrificing clarity. 

The aesthetic is a hybrid of **Minimalism** and **Modern Corporate**, utilizing a dark-mode-first approach to reduce eye strain during long management sessions. It evokes a "Pro-Tools" or "IDE" emotional response—reliable, fast, and powerful. Visual noise is eliminated to ensure that video thumbnails and data metrics remain the primary focus. High-contrast accents are reserved strictly for interactive states and status indicators.

## Colors

The color palette is built on a "Deep Space" foundation to provide maximum contrast for video content.

- **Primary Utility**: A vibrant Tech Blue (#3b82f6) handles all primary actions, selections, and focus states.
- **Brand Accent**: YouTube Red (#ff0000) is used sparingly for brand recognition and destructive live-video indicators.
- **Surface Strategy**: The background uses a near-black (#020617), while UI surfaces use Slate Grey (#1e293b) to create depth without relying on heavy shadows.
- **Semantic Feedback**: Success, Warning, and Danger colors follow standard utility conventions but are desaturated slightly to prevent "vibrating" against the dark background.

## Typography

This design system utilizes **Geist** for its technical precision and exceptional legibility in data-heavy environments. 

- **Hierarchy**: Headlines are kept compact to save vertical space. 
- **Data Display**: Use `mono-data` for file sizes, timestamps, and view counts to ensure vertical alignment in tables. 
- **Labels**: Small, uppercase labels are used for metadata categories (e.g., "RESOLUTION", "CODEC").
- **Mobile Scale**: On mobile devices, `display-lg` should scale down to `display-md` (24px) to prevent text wrapping on video titles.

## Layout & Spacing

The layout follows a **Fixed Sidebar / Fluid Content** model. 

- **Desktop**: A persistent 260px left sidebar contains global navigation. The main content area uses a fluid 12-column grid with 16px gutters.
- **Mobile**: The sidebar collapses into a bottom navigation bar for primary destinations (Library, Queue, Settings) and a top-right "More" drawer for secondary actions.
- **Rhythm**: All spacing is derived from a 4px base unit. Component internal padding should default to 12px (stack-sm + 4px) for a compact but breathable feel.
- **Data Tables**: Use "Comfortable" density for general browsing and "Compact" (8px cell padding) for massive queue management.

## Elevation & Depth

This design system uses **Tonal Layering** and **Low-Contrast Outlines** rather than traditional shadows to maintain a clean, flat utility look.

- **Level 0 (Background)**: #020617 - The base canvas.
- **Level 1 (Surface)**: #0f172a - Used for large cards and sidebar.
- **Level 2 (Elevated)**: #1e293b - Used for modals, dropdowns, and active button states.
- **Outlines**: All interactive elements (inputs, cards) feature a 1px solid border using `#334155` (Slate 700). 
- **Focus State**: When an element is focused, the border transitions to the Primary Blue with a 2px outer glow (0 0 0 2px #3b82f633).

## Shapes

The shape language is **Soft**, utilizing small border radii to maintain a professional, organized appearance while avoiding the "toy-like" feel of fully rounded corners.

- **Standard Components**: 0.25rem (4px) for buttons, inputs, and small badges.
- **Large Containers**: 0.5rem (8px) for video thumbnails, cards, and modals.
- **Selection Indicators**: 2px vertical bars on the left side of active sidebar items or table rows.

## Components

### Buttons
- **Primary**: Solid Blue (#3b82f6) with White text. High-gloss hover effect (slight lightening).
- **Secondary**: Ghost style with #334155 border.
- **Icon Buttons**: No border, Slate 400 icon color, circular hover background.

### Video Cards
- Aspect ratio fixed at 16:9 for thumbnails.
- Bottom-right overlay for video duration using semi-transparent black (80% opacity) and 4px rounded corners.
- Progress bar for "Watch Progress" or "Download Progress" placed at the very bottom edge of the thumbnail.

### Data Tables
- Header: Sticky position, `label-caps` typography, subtle bottom border.
- Rows: Subtle highlight on hover (`#1e293b`).
- Status Badges: Use the "Pill" shape (rounded-xl) with a low-opacity background and a solid high-contrast dot (e.g., Active = Green dot + Green 10% opacity background).

### Input Fields
- Dark background (#020617) with a 1px Slate 700 border.
- Height: 36px for standard utility feel.
- Icon integration: Phosphor Icons (Regular weight) positioned 12px from the left edge.

### Icons
- Use **Phosphor Icons** in "Regular" weight for navigation and "Bold" for critical status indicators.
- Default icon color: #94a3b8 (Slate 400).
- Interactive icon color: #f8fafc (White).