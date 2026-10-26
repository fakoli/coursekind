# Dependency review — 26 October 2026

The first CI install reported 33 advisories across development and production
packages (2 low, 14 moderate, 17 high). `npm audit --omit=dev --json` narrowed
production dependency metadata to 14 (1 low, 9 moderate, 4 high). These were
pre-existing lockfile dependencies, not introduced by Playwright.

Compatible updates, without `--force`:

| Package | Before | After |
| --- | --- | --- |
| Mermaid | 11.12.2 | 11.17.2 |
| react-router / react-router-dom | 7.12.0 | 7.18.4 |
| DOMPurify (transitive) | 3.3.1 | 3.4.17 |
| lodash-es (transitive) | 4.17.22 | 4.18.1 |

`npm update mermaid react-router-dom dompurify lodash-es katex uuid chevrotain
@mermaid-js/parser langium --ignore-scripts` refreshed compatible direct and
transitive constraints. Manifest minimums now match the qualified Mermaid and
Router versions. All 127 frontend tests passed on Node 24.18.0 and 22.16.0;
lint, production build and browser typecheck passed. Two added tests parse a
real installed Mermaid flowchart and reject malformed syntax. The browser
rich-lesson scenario also requires an actual rendered Mermaid SVG; its CI result
is tracked separately. Rendering via CUA is coordinator-owned.

After the compatible updates, production audit reports **4 advisories:
0 high, 2 moderate, 2 low**. Full dependency metadata still reports 23
(3 low, 7 moderate, 13 high), including development tools. This is not a
zero-vulnerability or complete exploitability claim.

Remaining production metadata:

- `@tailwindcss/typography` → `postcss-selector-parser` 6.0.10:
  [quadratic selector parsing](https://github.com/advisories/GHSA-rj75-hqrm-r3gf),
  moderate, parser versions below 7.1.6. This plugin runs at build time; the app
  does not accept user-supplied CSS for the Tailwind build. Npm proposes a
  typography downgrade to 0.5.4 outside the current compatible requirement.
  A parser major override or plugin migration needs separate compatibility work.
- Mermaid → KaTeX:
  [existing prototype pollution can bypass trust restrictions](https://github.com/advisories/GHSA-238p-pmpm-9mq7),
  low, KaTeX 0.11.0–0.18.1. This advisory requires existing prototype pollution;
  shared diagrams are a relevant rendering boundary, so residual risk remains
  explicit. Npm proposes Mermaid 12.2.0, a major upgrade. The baseline retains
  compatible Mermaid 11.17.2 pending a deliberate major migration. No known
  prototype-pollution path was established by this bounded dependency review.

Router is used as client-side BrowserRouter; the app does not use Router SSR,
RSC, server actions or its manifest server. Compatible updating still removed
its reported high advisories, including redirect-related classes. Author-supplied
Markdown and Mermaid rendering is reviewed separately in the baseline fix;
updating dependencies alone does not make unsafe rendering configuration safe.
