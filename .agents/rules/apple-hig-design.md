# Subnet — Apple HIG Design Reference & Guidelines

This reference defines the desktop design language, interface patterns, visual tokens, and control behaviors for Subnet, aligned with Apple Human Interface Guidelines (HIG) and tailored to Subnet's minimal pastel desktop aesthetic.

All UI components, views, dialogs, and controls in Subnet must adhere to these standards.

---

## 1. Core Design Principles

1. **Clarity & Native Feel**: The interface should feel like an integrated macOS desktop application, not an embedded web browser or mobile wrapper. Typography, controls, layout density, and window behavior respect macOS conventions.
2. **Deference**: Content and conversations remain the hero. Interface chrome (sidebars, toolbars, dividers, buttons) recedes gracefully, supporting user interaction without unnecessary decoration.
3. **Calm Warmth**: Soft cream, warm off-white, and muted lavender surfaces replace harsh stark white, cold grays, or developer-tool terminal aesthetics.
4. **Tactile Restraint**: Borders are delicate (1px), corner radii are controlled (6px–16px), and shadows are soft, diffuse, and low-contrast. Never use heavy black drop shadows.
5. **Predictable Interaction**: Desktop click targets, hover states, keyboard shortcuts, focus rings, and modal flows behave predictably and consistently across all views.

---

## 2. Window Structure & Desktop Layout

### 2.1 Title Bar & Window Chrome
- **Window Style**: macOS unified title bar (`titleBarStyle: 'hiddenInset'`).
- **Traffic Lights**: Left-aligned window controls (Close, Minimize, Zoom) with standard macOS inset.
- **Draggable Region**: Window header regions use `-webkit-app-region: drag`.
- **Interactive Elements**: All interactive controls within header areas (buttons, search inputs, tabs, avatars) MUST specify `-webkit-app-region: no-drag` and `cursor: pointer` / `cursor: default`.
- **Header Density**: Compact 50px–54px header height with unobtrusive title and live connectivity indicator (`LAN Active` with 7px green presence dot).

### 2.2 Navigation & Sidebar
- **Layout**: Standard macOS source list sidebar (240px–270px width) on the leading side, collapsible via toolbar toggle.
- **Action Navigation**: Primary navigation buttons (`New Chat`, `Create Room`, `Find Room`, `Requests`) use rounded pill or soft rectangle styling (34px height) with 8px horizontal padding.
- **Section Headers**: Category overlines (`ROOMS`, `CHATS`) use 11px uppercase semibold typography with `letter-spacing: 0.05em`, muted text color, and collapsible chevron disclosure indicators.
- **Selected Row**: Subtle rounded-rectangle selection (`background: #FFFFFF` with delicate border and soft shadow, or soft lavender tint), never saturated or high-contrast.
- **Bottom Identity Area**: Pinned profile row at the bottom of the sidebar with user avatar, name, and subtle profile navigation button.

### 2.3 Canvas & Detail Pane
- **Content Area**: Expansive, breathable surface occupying the remaining viewport.
- **Dividers**: 1px vertical divider (`#E9E3EB`) separating sidebar from main content. Never use heavy border lines.
- **Empty States**: Centered, restrained cards with subtle icon badge, concise heading, descriptive body text, and a single prominent primary action button.

---

## 3. Approved Pastel Color System

Subnet uses a curated minimal pastel palette built on warm cream, lavender/mauve, soft mint, and soft peach.

### 3.1 Surface Tokens
| Token | Hex Value | Semantic Usage |
| :--- | :--- | :--- |
| `--bg-canvas` | `#F8F6F2` | Main viewport canvas, Radar background, view backdrops |
| `--bg-sidebar` | `#F4F0EB` | Source list sidebar background |
| `--bg-surface` | `#FFFFFF` | Cards, message bubbles (incoming), popovers, modals |
| `--bg-surface-hover` | `#F5F2EC` | Hover state for lists, buttons, and rows |
| `--bg-lavender` | `#F0E6FA` | Outgoing chat bubbles, active item highlights, selected badges |
| `--bg-mint` | `#DDF3EA` | Live discovery indicators, "Open" room tags, verified badges |
| `--bg-peach` | `#F8E3D8` | Warm tags, secondary character badge backgrounds |

### 3.2 Typography & Ink Tokens
| Token | Hex Value | Semantic Usage |
| :--- | :--- | :--- |
| `--ink-primary` | `#24212A` | Primary headings, message text, user names, input text |
| `--ink-secondary` | `#77717F` | Subtitles, timestamps, secondary labels, placeholders |
| `--ink-muted` | `#A29CA8` | Overlines, hints, disabled labels, empty state captions |

### 3.3 Accent & Feedback Tokens
| Token | Hex Value | Semantic Usage |
| :--- | :--- | :--- |
| `--accent-primary` | `#B58AE8` | Primary buttons, active icons, focus highlights, badges |
| `--accent-hover` | `#A474DE` | Hover state for primary buttons and interactive accents |
| `--accent-active` | `#935ECF` | Active/pressed state for primary controls |
| `--presence-online` | `#36B987` | Active LAN presence dot, connected network state |
| `--status-warning` | `#F5A623` | Host badges, cautionary alerts, pending states |
| `--status-error` | `#EF4444` | Decline buttons, error tags, disconnected state |

### 3.4 Borders & Elevation Tokens
| Token | Hex / Value | Semantic Usage |
| :--- | :--- | :--- |
| `--border-light` | `#E9E3EB` | Standard 1px card, list, and divider borders |
| `--border-strong` | `#DCD4E0` | Input focus, active tab outlines, hovered borders |
| `--shadow-xs` | `0 1px 2px rgba(36, 33, 42, 0.04)` | Subtle lift for message bubbles and row items |
| `--shadow-sm` | `0 2px 8px rgba(36, 33, 42, 0.05)` | Cards, input fields, control pills |
| `--shadow-md` | `0 6px 20px rgba(36, 33, 42, 0.08)` | Popovers, floating toolbars, dropdowns |
| `--shadow-lg` | `0 12px 36px rgba(36, 33, 42, 0.12)` | Centered dialogs, modal backdrops |

> [!IMPORTANT]
> **Palette Boundaries**: Do not reintroduce dominant orange (`#E05320`), cold cyan (`#38bdf8`), or dark terminal backgrounds (`#0f172a`, `#1e293b`).

---

## 4. Typography Scale & Native macOS Font Stack

Use the Apple native system font hierarchy with proportional line heights and weights:

```css
font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", sans-serif;
```

### 4.1 Type Scale
| Role | Size | Weight | Line Height | Letter Spacing | Usage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Large Title** | 22px | 600 (Semibold) | 28px | -0.015em | Prominent view headings (Profile, Radar hero) |
| **Title / H1** | 18px | 600 (Semibold) | 24px | -0.01em | Modal headers, conversation peer name |
| **Headline / H2** | 15px | 600 (Semibold) | 20px | -0.005em | Card titles, group section headings |
| **Desktop Body** | 13.5px | 400 (Regular) | 19px | 0 | Standard messages, inputs, descriptions |
| **Callout / Meta** | 12px | 500 (Medium) | 16px | 0 | Timestamp labels, secondary metadata, chips |
| **Caption / Footnote** | 11px | 400 (Regular) | 15px | 0 | Status subtitles, hint text, device IDs |
| **Category Overline** | 11px | 600 (Semibold) | 14px | +0.05em | Uppercase list headers (`ROOMS`, `CHATS`) |

---

## 5. Controls, Materials & Visual Recipes

### 5.1 Corner Radii Scale
- **Small (`6px`)**: Status tags, host badges, compact pills, unread count chips.
- **Medium (`8px`)**: Action buttons, input fields, toolbar buttons, chat row items.
- **Large (`12px`)**: Message bubbles, cards, search bars, member drawer.
- **X-Large (`16px`)**: Modal cards, popover containers.
- **Pill (`999px`)**: Primary navigation buttons, online presence chips, search bar.

### 5.2 Buttons
- **Primary Action**: Solid filled with `--accent-primary` (`#B58AE8`), white text, 8px radius, height 32px–34px, font-size 13px, weight 600.
- **Secondary / Standard**: Surface background (`#FFFFFF`), 1px border (`#E9E3EB`), text `--ink-primary`, subtle hover (`#F4F0EB`).
- **Ghost / Icon Button**: Transparent background, 28px–32px square or circular hit target, subtle hover background (`rgba(36, 33, 42, 0.05)`).
- **Destructive**: Soft light red background (`rgba(239, 68, 68, 0.08)`), border `rgba(239, 68, 68, 0.2)`, text `#EF4444`.

### 5.3 Search Fields
- macOS Spotlight/Toolbar style:
  - Height: 32px–34px.
  - Shape: Rounded pill (`border-radius: 999px`) or `8px` rounded rect.
  - Background: `#FFFFFF` or `--bg-surface`.
  - Leading icon: Search glyph (14px–15px) in `--ink-secondary`.
  - Clear button: Inline `✕` icon when input is non-empty.
  - Focus: Smooth outline in `--accent-primary` (`box-shadow: 0 0 0 2px rgba(181, 138, 232, 0.35)`).

### 5.4 Message Bubbles
- **Outgoing (Self)**:
  - Background: Soft lavender `--bg-lavender` (`#F0E6FA`).
  - Text: Dark charcoal `--ink-primary` (`#24212A`) for high legibility.
  - Border: 1px solid `rgba(181, 138, 232, 0.3)`.
  - Radius: `12px` (trailing corner slightly tighter on consecutive messages).
- **Incoming (Peer / Room)**:
  - Background: Clean white `--bg-surface` (`#FFFFFF`).
  - Text: Dark charcoal `--ink-primary` (`#24212A`).
  - Border: 1px solid `--border-light` (`#E9E3EB`).
  - Radius: `12px`.
- **Timestamps & Delivery**:
  - 11px font size, `--ink-secondary` color, positioned inside the bottom-right corner with 8px margin.

### 5.5 Chat Composer
- Comfortable bottom dock:
  - Horizontal action row: Circular Attachment button (`+`), Quick Camera button, Emoji selector button.
  - Text Input: Spacious pill or 10px rounded input field with placeholder: `Type a message... (Enter to send, Shift+Enter for newline)`.
  - Send button: Circular or rounded pill icon button, active state highlighted in `--accent-primary`.
  - Emoji Popover: Clean elevated card appearing directly above the emoji button with smooth fade/scale transition and rounded emoji cells.

---

## 6. Character Avatars & Mascots

To give group rooms and anonymous participants distinct character without childish clutter:

1. **Lightweight Inline Vector**: Mascot avatars are generated via clean, lightweight inline SVGs with soft pastel backdrops (`#F0E6FA`, `#F8E3D8`, `#DDF3EA`, etc.).
2. **Restrained Proportions**:
   - Inline message avatars: `22px–24px`.
   - Sidebar list and drawer items: `26px–28px`.
   - Headers and room cards: `32px–36px`.
   - Identity / Profile hero: `52px–64px`.
3. **Deterministic Mapping**:
   - Room IDs and anonymous member identifiers hash deterministically to the 8 standard mascots (`bunny`, `bear`, `cat`, `fox`, `owl`, `panda`, `koala`, `chick`).
   - The same room or member always retains the identical mascot avatar across sidebar, header, card, and message streams.
4. **Visual Hierarchy**: Names and message text remain primary; avatars provide effortless visual landmarks rather than focal distractions.

---

## 7. Keyboard Navigation & Accessibility

1. **Focus States**:
   - All interactive controls (`button`, `input`, `a`, `[tabindex="0"]`) MUST display a prominent focus indicator on `:focus-visible`:
     ```css
     outline: none;
     box-shadow: 0 0 0 2px rgba(181, 138, 232, 0.45);
     ```
   - Never show focus outlines on mouse click (`:focus:not(:focus-visible)`).
2. **Keyboard Shortcuts**:
   - `Enter`: Submit / Send message.
   - `Shift + Enter`: Multi-line text entry in composers.
   - `Escape`: Close modals, popovers, emoji pickers, or return from active sub-view to Radar.
   - `Tab` / `Shift + Tab`: Predictable focus traversal across interactive controls.
3. **Hit Targets**:
   - Desktop minimum interactive hit target: `28px × 28px` (standard desktop) to `32px × 32px` (comfortable touch/mouse).
4. **ARIA & Semantics**:
   - Correct roles: `role="dialog"`, `aria-modal="true"`, `role="menu"`, `role="menuitem"`.
   - Descriptive `aria-label` or `title` on all icon-only buttons.
5. **Reduced Motion**:
   - Honor user accessibility preferences:
     ```css
     @media (prefers-reduced-motion: reduce) {
       *, *::before, *::after {
         animation-duration: 0.01ms !important;
         transition-duration: 0.01ms !important;
       }
     }
     ```

---

## 8. Dark & Light Appearance Architecture

Subnet uses semantic CSS variables at `:root` to ensure clean contrast and adaptability:

- All colors in components reference CSS custom properties (`var(--bg-canvas)`, `var(--bg-surface)`, `var(--ink-primary)`, etc.).
- Never hardcode raw hex values in JSX inline styles for surfaces, borders, or typography.
- For dark appearance adaptation:
  - Canvas: deep warm charcoal (`#1C1A22`).
  - Surface/Cards: muted charcoal (`#25232E`).
  - Sidebar: soft slate-charcoal (`#211F28`).
  - Ink: clean off-white (`#F5F2F8`) and muted silver (`#9E97A6`).
  - Lavender accents: calibrated for dark contrast (`#C7A1F5`).
