# DESIGN.md — Routely Admin Portal

## Product

**Routely Admin** is a logistics operations dashboard for pharmacy delivery management. Operators monitor real-time scan logs, manage stops, track drivers, and resolve delivery exceptions. Density and clarity over decoration.

**Register: product.** Design serves the task. The tool should disappear into the work. Familiarity is a feature; surprise is a cost. The bar is earned trust, the feel of a premium operations tool, not a starter template.

## Brand

Primary brand color: **#0167FF** = `oklch(0.565 0.24 260.7)`.

Hue **260.7** drives the entire system. Every neutral is tinted toward it; there is no pure white and no pure black anywhere. The blue is the action color: primary buttons, links, focus rings, current selection, in-flight state. It is not used decoratively.

## Color system (OKLCH, light mode `:root`)

| Token | Value | Role |
|---|---|---|
| `--primary` | `oklch(0.565 0.24 260.7)` | #0167FF, actions, links, selection, focus |
| `--primary-foreground` | `oklch(0.985 0.01 260.7)` | text on primary |
| `--background` | `oklch(0.995 0.003 260.7)` | content surface, barely-tinted off-white |
| `--card` | `oklch(0.992 0.004 260.7)` | elevated surface, panel (one step deeper than bg) |
| `--foreground` | `oklch(0.12 0.01 260.7)` | deep blue-tinted near-black text |
| `--muted` | `oklch(0.96 0.008 260.7)` | secondary backgrounds, neutral chips |
| `--muted-foreground` | `oklch(0.52 0.02 260.7)` | secondary text |
| `--border` | `oklch(0.91 0.012 260.7)` | dividers |
| `--ring` | `oklch(0.565 0.24 260.7)` | focus ring, identical to primary |
| `--destructive` | `oklch(0.577 0.245 27.325)` | hard-delete / failure red |

### Sidebar (deep navy, never black)

The sidebar is a deliberately different surface from the content area. Dark navy against a light content plane: the two-tone split is structural identity, not decoration.

| Token | Value |
|---|---|
| `--sidebar` | `oklch(0.17 0.03 260.7)` |
| `--sidebar-foreground` | `oklch(0.92 0.008 260.7)` |
| `--sidebar-primary` | `oklch(0.565 0.24 260.7)` |
| `--sidebar-accent` | `oklch(0.24 0.04 260.7)` |
| `--sidebar-border` | `oklch(0.22 0.025 260.7)` |

### Dark mode (`.dark`)

Same hue 260.7 throughout. Content `oklch(0.15 0.012 260.7)`, card one step lighter, sidebar one step *darker* than content (`oklch(0.14 0.025 260.7)`) so the navy split survives in dark mode. Primary brightens to `oklch(0.62 0.22 260.7)` for contrast on dark surfaces.

### Semantic status colors

Status is communicated with **contained** color, not saturated fills. Soft tinted background, readable mid-tone text, hairline border.

- **Success**: `bg-emerald-50 text-emerald-700 border-emerald-200/80` (+ dark variants)
- **Error**: `bg-red-50 text-red-700 border-red-200/80`, plus a single slow ping ring (`bg-red-400/40`, 1.5s), the only ambient animation on the surface
- **Processing**: `bg-primary/8 text-primary border-primary/25`, in-flight is a brand-action state
- **Reposted**: amber pinging dot on the badge corner
- **Stat dots**: total `muted-foreground/40`, success `emerald-500`, error `red-500`, processing `primary`
- **Route**: metadata, not status. Neutral `bg-muted text-muted-foreground/80 font-mono`. Never colored.

## Typography

- One family: Inter (`--font-sans`), system-ui fallback. No display/body pairing.
- **Body base 13px**, dashboard density, tighter than the 16px web default.
- Page title: `font-semibold text-base text-foreground` (the anchor).
- Subtitle / secondary: `text-[11px] text-muted-foreground`.
- Table body: `text-xs`. Mono IDs/codes: `font-mono text-[10px]`.
- Column headers: `font-medium text-[10px] text-muted-foreground/60 tracking-wide`. Not uppercase. Sentence case throughout; uppercase reads as template chrome.
- Casing: sentence case for body, Title case for badges, `capitalize` for names. No uppercase blocks.
- Selection color: primary at 30% (`::selection`).

## Spacing & density

High information density is correct here and intentional.

- Table rows `py-2`, cells `px-3`. Header bar `px-4 py-3`. Panels `p-4`.
- Stat pills `px-3 py-2.5`. Badges `px-2 py-0.5`.
- Zebra striping (`even:bg-muted/30`) breaks the wall of white without adding chrome.

## Components

### Content shell
Rounded bordered container with a `border-l-2 border-l-primary/40` accent: a thin brand spine, the only structural color flourish.

### Stat row
Four pills, one row. Colored dot + label + bold number. Active = `bg-primary/8 border-primary/30`. No shadows, no gradients. Clickable to filter.

### Table
- Solid sticky header (`bg-background`), never transparent or blurred.
- Zebra rows; `border-b border-border/30` dividers.
- Selected row: `bg-primary/5` + `border-l-2 border-l-primary`, the blue spine marks selection unambiguously.
- `colgroup` fixed widths to prevent layout thrash.

### Detail panel
A genuinely different surface: `bg-card` (one step off the content background), `border-l border-border`. Header carries a 6% status wash (`bg-{status}/6`), nothing louder. Sections are single-bordered, never nested more than two deep.

### Connection indicator
Live SSE state surfaced as a small dot in the subtitle: pinging emerald when connected, static muted when reconnecting. State, not decoration.

## Motion

- One ambient animation only: the error-badge ping (conveys "needs attention").
- The live dot ping (conveys connection state).
- No per-row entrance animation. The dashboard loads into a task; it does not perform.
- Transitions are `transition-colors`, 150 to 200 ms. No layout-property animation, no bounce.

## Absolute bans (enforced)

- No pure `#fff` / `#000`, every neutral tinted toward hue 260.7.
- No hero-metric cards. No gradient text. No glassmorphism.
- No emoji in UI or data cells.
- No colored drop-shadows / glows on badges or chips.
- No saturated-fill status badges (contained tints only).
- No uppercase header chrome. No em dashes in copy. Sentence case, no filler.
- Route and other metadata never borrow status color.

## Decisions & rationale

- **Two-tone shell (navy sidebar / light content).** The split is the product's structural identity and keeps the eye anchored on the data plane. Never all-white (clinical, template) and never all-dark (wrong for a daytime operations room).
- **Single brand hue everywhere.** #0167FF is exact; 260.7 tints every neutral so the whole UI reads as one deliberate system rather than shadcn defaults.
- **Contained status over saturated pills.** Loud fully-saturated badges with colored shadows were the dominant slop tell. Soft tint + border + mid-tone text is calmer and higher-contrast for text.
- **13px base + sentence-case headers.** Density without shouting. Uppercase tracked headers are the single most recognizable starter-dashboard signature; removing them is the cheapest premium signal.
- **Motion budget of two.** Error attention + connection state. Everything else is instant.

## Current pages

- `/dashboard/scan-logs`, main operational view, live SSE, repost workflow (reference implementation of this system)
- `/dashboard/stops`, spoke stops management
- `/dashboard/package-scans`, package scan history
