# Design system

Tokens live in `src/app/globals.css`: navy (#153b48), neutral surfaces, sage green, restrained saffron, semantic borders, radii, shadows and focus outlines. Core spacing follows 8px multiples with compact typography adjustments. Desktop/public content is capped at 1440px; responsive breakpoints are 1300, 1050 and 760px. Dense tables scroll in a named keyboard-focusable region. Critical actions are visible without hover.

Light, dark and system themes use next-themes' initial theme script. Only the theme preference may be stored locally; financial drafts are server-persisted. Motion respects `prefers-reduced-motion`. Language routing is `/en` and `/hi`; next-intl supports additional catalogs. System Unicode fonts fall back to Noto Sans Devanagari/Arial without third-party font requests. Date-only data uses database DATE; operational times display Asia/Kolkata. Native datetime inputs currently use the operator's browser timezone and say so in the label.

The visual monogram is a development mark, explicitly not an authorized NCC logo. Illustrations are decorative icons and CSS geometry; no real cadet photographs or invented impact metrics are used.

Accessibility evidence lives in browser tests: semantic headings/landmarks, keyboard labels, focus outlines, dialog trapping/restoration, mobile overflow, and axe WCAG A/AA checks. Automated checks do not establish complete WCAG conformance. Some secondary finance/security controls and server error messages remain English; complete human-reviewed Hindi validation and official notice translations are a release gate. Urdu/RTL is not enabled.
