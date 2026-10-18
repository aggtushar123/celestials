---
description: ## 5. Design system requirements   A full design system must be established before component development begins.
---


 
### 5.1 Token hierarchy
 
```
Tier 1 — Primitive tokens:   raw values (colors, sizes, radii)
Tier 2 — Semantic tokens:    purpose-named (--color-surface-default, --color-text-muted)
Tier 3 — Component tokens:   component-scoped (--card-border-color, --button-bg-active)
```
 
### 5.2 Core components to build (v1)
 
**Atoms:**
Button (5 variants: primary, secondary, ghost, danger, link)  
Badge / status pill  
Input, Textarea, Select  
Checkbox, Radio, Toggle  
Tooltip  
Avatar / initials circle  
Skeleton loader  
Spinner  
 
**Molecules:**
Card (flat / raised / interactive)  
Metric card  
Search bar with keyboard shortcut hint  
Breadcrumb  
Tabs  
Dropdown menu  
Command palette (⌘K)  
Empty state  
Confirmation dialog  
 
**Organisms:**
Side navigation  
Top bar / app header  
Split-panel layout  
Data table (sortable, filterable, paginated)  
Graph canvas wrapper  
Connector card  
Node detail panel  
Skills file viewer (with diff mode)  
Review action toolbar  
Activity feed  
 
### 5.3 Iconography rules
 
- Use Lucide React exclusively — no mixing sets
- Icon size: 16px for inline/label use, 20px for standalone actions, 24px for section headers
- No emoji as UI icons
- All icons need accessible `aria-label` when used without adjacent text
---
 
## 6. Motion & interaction principles
 
| Principle | Guidance |
|-----------|----------|
| Purposeful | Animations communicate state change, not decorate |
| Fast | Transitions: 120–200ms. Reveals: 200–300ms. Nothing over 400ms |
| Mechanical | Ease curves: `easeOut` for enters, `easeIn` for exits. No bouncy springs |
| Staggered reveals | Page loads stagger children with 30–50ms delay per item |
| Reduced motion | All animations respect `prefers-reduced-motion: reduce` |
 
**Key animation moments:**
- Graph node appearing: scale from 0.6 + fade, 200ms
- Side panel sliding in: translate from right, 180ms easeOut
- Node approval: node pulses green briefly, then settles
- Confidence score updating: numeric counter animation, 600ms
- Skill publishing: brief full-panel flash in success color, 300ms
---
 
## 7. Navigation structure
 
### Marketing site
```
Top nav: Logo / Product / Use cases / Docs / Blog / Sign in / Request access (CTA)
Footer: Product / Company / Legal / Social
```
 
### Web application
```
Left sidebar (collapsed to icons at < 1280px):
  - Dashboard
  - Knowledge graph
  - Nodes (with review count badge)
  - Skills
  - Feedback
  ─────────────────
  - Connectors
  - Settings
 
Top bar:
  - Breadcrumb
  - Global search (⌘K)
  - Notifications bell
  - User avatar / org switcher
```
 
---
 
## 8. Empty states
 
Every view needs a designed empty state — not a blank screen.
 
| View | Empty state message | CTA |
|------|---------------------|-----|
| Dashboard (no connectors) | "Connect your first data source to start extracting knowledge" | Add connector |
| Graph (no nodes) | "Your knowledge graph is empty — extraction will populate it automatically" | View connectors |
| Review queue (empty) | "All caught up — no nodes awaiting review" | View graph |
| Skills library (no skills) | "No skills files yet. Skills are compiled once nodes are approved." | Review nodes |
| Feedback (no data) | "Agent feedback will appear here once skills are in active use" | View skills |
 
---
 
## 9. Error & loading states
 
**Loading:**
- Skeleton screens (not spinners) for all data-heavy views
- Graph canvas shows skeleton node clusters while loading
- Inline loading state on actions (button shows spinner, disabled state)
**Errors:**
- Toast notifications for action failures (non-blocking)
- Inline error states for form validation
- Full error boundary for catastrophic failures with a reload prompt
- Connector sync errors surface in the connector card with a timestamp and error message
---
 
## 10. Responsive & platform requirements
 
| Breakpoint | Behavior |
|------------|----------|
| ≥ 1440px | Full layout, sidebar expanded |
| 1280–1439px | Full layout, sidebar icons-only (tooltips on hover) |
| 1024–1279px | Condensed layout; sidebar as overlay |
| < 1024px | Read-only mode; prompt to use desktop for editing |
 
**Browser support:** Last 2 versions of Chrome, Firefox, Safari, Edge. No IE.  
**OS:** macOS, Windows, Linux (Electron wrapper is a Phase 2 consideration).
 
---
 
## 11. Accessibility checklist
 
- [ ] All interactive elements reachable by keyboard
- [ ] Focus indicators visible and styled (not browser default)
- [ ] Color is never the only means of conveying information
- [ ] All images and icons have alt text or aria-label
- [ ] Form inputs have associated labels
- [ ] Error messages are announced to screen readers
- [ ] Graph canvas has a text-based fallback view (table of nodes)
- [ ] Contrast ratios ≥ 4.5:1 for normal text, ≥ 3:1 for large text
- [ ] ARIA roles applied to custom interactive components
- [ ] `prefers-reduced-motion` respected across all animations
---
 
## 12. Open design questions
 
1. **Graph canvas vs. list-first:** Should the knowledge graph canvas be the primary navigation metaphor, or is a filterable list table more practical for large knowledge bases (> 1,000 nodes)? Consider progressive disclosure: list as default, graph as an alternate view.
2. **Node edit experience:** Is inline editing in the review panel sufficient, or do heavy-edit workflows need a dedicated full-page editor?
3. **Skills file format — visual vs. raw:** Should we build a visual form-based editor for skills files (easier for non-technical users) alongside the raw YAML view? Phase 2 consideration.
4. **Onboarding flow:** First-time user experience needs its own design pass — the product is complex enough to warrant a guided setup: connect source → watch first extraction → review first node → publish first skill.
5. **Mobile strategy:** Is read-only sufficient, or do knowledge owners need mobile-friendly review capability? Push notifications for review queue could be a strong retention mechanic on mobile.
6. **White-labeling:** Will enterprise customers need custom branding (logo, accent color)? If so, the design token system must support runtime theme overrides from day one.
---
 