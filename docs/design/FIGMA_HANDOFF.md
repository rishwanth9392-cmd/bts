# Figma Handoff Document

This document outlines the design system implemented in code to ensure perfect synchronization with the Figma design files.

## 1. Design Tokens

### Core Colors
- **Primary Yellow**: `#FFC107` (Used for primary actions, map styling, and UI accents)

### Role-Specific Palettes
**Student Portal**
- Light (Backgrounds): `#F3E8FF`
- Dark (Text/Icons): `#6B21A8`

**Driver Portal**
- Light (Backgrounds): `#FFEDD5`
- Dark (Text/Icons): `#C2410C`

**Admin Portal**
- Light (Backgrounds): `#DBEAFE`
- Dark (Text/Icons): `#1D4ED8`

### Status Semantic Colors
- **Success**: `#10B981` (Background: `#D1FAE5`)
- **Warning**: `#F59E0B` (Background: `#FEF3C7`)
- **Danger**: `#EF4444` (Background: `#FEE2E2`)
- **Info**: `#3B82F6` (Background: `#DBEAFE`)
- **Neutral**: `#6B7280` (Background: `#F3F4F6`)

## 2. Typography
- **Primary Font Family**: `Inter` (Sans-serif stack)
- **Base scale**: standard Tailwind text sizes (`text-xs`, `text-sm`, `text-base`, `text-lg`, etc.)

## 3. Core UI Components
Our `@bts/ui` package contains the following coded components. Please match Figma components 1:1 with these naming conventions:

- `Button`: Features `primary` (yellow, fully rounded pill), `secondary`, and `danger` variants. Sizes: `sm`, `md`, `lg`.
- `IconButton`: Circular button enforcing ARIA labels.
- `Card`: Generic content container with soft shadows and borders.
- `StatusBadge`: Pill-shaped badge mapped directly to the Semantic Status colors.
- `FeatureTag`: Small badge featuring `white/60` background with background-blur (`backdrop-blur-sm`).
- `DataTable`: Responsive desktop-first list view with custom cell renderers.
- `Skeleton`: Animated pulse component for asynchronous loading states.

## 4. Motion System
- `slide-up`: A standard entrance animation applied to primary dashboard containers (`0.5s ease-out` sliding from `translateY(1rem)` to `0`).
