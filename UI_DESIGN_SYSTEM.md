# E2E Test Lab Design System

The redesign presents the lab as a restrained professional QA developer tool. It does not change route behavior, APIs, deterministic data, selectors, authentication, or test scenarios.

## Foundations

- Design tokens define background, surfaces, borders, primary/state colors, text hierarchy, radii, focus rings, and shadows.
- Themes: Light, Dark, and System, persisted under the `theme` browser preference.
- Typography: Inter-compatible system sans stack with IBM Plex Mono-compatible monospace fallbacks.
- Icons: Lucide React exclusively.
- Motion: 150–250 ms transitions with `prefers-reduced-motion` support.

## Shared components

- `Brand`: technical browser/checkmark identity used in login and sidebar.
- `AppLayout`: grouped/collapsible navigation, sticky header, breadcrumbs, environment status, global search, theme selector, user menu, and responsive shell.
- `PageHeader`: icon, title, difficulty, description, and reset action.
- `TestInfoPanel`: Overview, Test Data, Selectors, Assertions, and API tabs with monospace technical content.
- Dashboard module cards, metrics, filters, list/grid views, command palette, profile tabs, empty states, skeletons, tables, dialogs, toasts, and status badges use shared CSS primitives.

## Responsive behavior

- Desktop: fixed 270 px sidebar and two-column practice/test-information workspace.
- Compact desktop: optional 76 px icon sidebar and narrower information rail.
- Tablet: off-canvas sidebar, single-column lab, information panel below target content.
- Mobile: touch-sized controls, single-column cards/forms, compressed header, responsive tables and full-width dialogs.

## Accessibility

Focus rings, semantic navigation, labelled dialogs/tabs, accessible names, status announcements, skip navigation, keyboard command search, WCAG-conscious contrast, and reduced motion are preserved. Intentionally problematic accessibility training examples remain isolated and clearly marked.
