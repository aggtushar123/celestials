---
description: # Company Brain — Frontend PRD
---


## 1. Product context

Company Brain is a knowledge operating system for AI automation. It extracts scattered institutional knowledge from a company's data sources, structures it into a living graph, and compiles it into executable skills files for AI agents.

The frontend must serve two distinct surfaces:
1. **Marketing/landing site** — communicates the product vision to AI leads, ops heads, and enterprise buyers
2. **Web application** — the primary workspace where knowledge owners, automation leads, and engineers configure, review, and maintain the knowledge graph and skills files

---

## 2. Design direction

### Aesthetic mandate

The product lives at the intersection of **infrastructure seriousness** and **knowledge intelligence**. It should feel like a tool that senior engineers and operations leaders trust with critical company infrastructure — not a consumer SaaS with gamified onboarding.

**Chosen direction: Editorial-industrial dark**
- Dark-first color system (deep charcoal/near-black backgrounds)
- Monospaced type for data labels, version strings, confidence scores — signals precision
- A single serif display font for hero headings — signals gravitas and intelligence
- Tight, dense information layouts — this is a professional tool, not a landing page toy
- Micro-animations that feel mechanical and purposeful, not springy or playful
- Color used sparingly: one dominant accent (deep teal or amber) with semantic colors for status

**Anti-patterns to avoid:**
- Purple gradient on white (over-used in AI products)
- Glassmorphism / frosted panels
- Lottie animations of "brains" or "neural networks"
- Rounded-everything consumer SaaS aesthetics
- Generic Inter/Roboto everywhere

### Typography stack

| Role | Font | Weight | Size |
|------|------|--------|------|
| Display / hero headings | Freight Display or Canela | 300–400 | 56–96px |
| Section headings | DM Serif Display | 400 | 28–42px |
| UI labels, nav, buttons | DM Mono | 400–500 | 11–13px |
| Body / prose | Geist or Lato | 300–400 | 15–17px |
| Data / metrics / code | DM Mono | 400 | 12–14px |

### Color system

```
Background:
  --bg-base:         #0D0F0E   (near-black, warm tint)
  --bg-surface:      #141716   (card surfaces)
  --bg-elevated:     #1C1F1D   (modals, popovers)
  --bg-subtle:       #232623   (hover states, muted fills)

Text:
  --text-primary:    #F0EDE8   (warm off-white)
  --text-secondary:  #9A9690   (muted prose)
  --text-tertiary:   #5C5A57   (hints, placeholders)

Accent (pick one — to be finalized in design):
  Option A — Teal:   #2DD4A8   (active states, CTAs, links)
  Option B — Amber:  #F0A832   (warmer, more archival feel)

Semantic:
  --success:         #3DAA78
  --warning:         #D4843A
  --danger:          #C85A5A
  --info:            #5A9BC8

Borders:
  --border-subtle:   rgba(255,255,255,0.06)
  --border-default:  rgba(255,255,255,0.10)
  --border-strong:   rgba(255,255,255,0.18)
```

---

## 3. Surface 1 — Marketing / landing site

### 3.1 Pages required

| Page | Priority | Notes |
|------|----------|-------|
| `/` — Homepage | P0 | Primary conversion page |
| `/product` — How it works | P0 | Architecture deep-dive |
| `/use-cases` | P1 | By department: Ops, Support, Engineering, Finance |
| `/pricing` | P1 | After beta; placeholder for now |
| `/docs` | P2 | Developer-facing; link to separate docs site |
| `/blog` | P2 | Thought leadership; can be Notion-backed |
| `/about` | P2 | Team and vision |

### 3.2 Homepage sections

**Hero section**
- Full-viewport, dark background
- Large serif headline: something like *"Every company runs on knowledge it can't find"*
- 1–2 line subheadline explaining the product
- Two CTAs: "Request access" (primary) + "See how it works" (ghost/secondary)
- Animated visual: a subtle particle graph or node map — NOT a generic brain illustration. Think: a live-updating knowledge graph slowly populating, with confidence scores ticking up and node connections forming
- Do not auto-play video on load

**Problem strip**
- Three-column layout: Scattered knowledge / Stale documentation / Agents can't act
- Each with a short statement and a single supporting data point or quote
- Dark surface cards, minimal iconography (no emoji-style icons)

**Architecture walkthrough**
- Five-layer stack (L1–L5) visualized as a vertical or horizontal flow
- Each layer expands on hover/click to show more detail
- Subtle connector lines between layers with animated data-flow indicators
- Monospaced labels for layer names

**Social proof / trust signals**
- Logo strip (enterprise customers or design partners)
- One or two pull quotes from design partners
- Metrics if available (e.g., "3h avg time-to-first-skill")

**Use case spotlights**
- Horizontal scrolling cards or tabs: Support / Engineering / Finance / HR
- Each shows a before/after: "How this workflow ran before" vs. "With Company Brain skills"
- Avoid generic screenshots — use well-crafted UI mockups

**Skills file preview**
- Interactive code block showing a sample skills file (YAML/JSON)
- Syntax highlighted, with annotations explaining key fields
- Demonstrates the developer-facing primitive

**CTA / waitlist section**
- Email capture, full width
- One sentence of urgency/context
- No dark patterns

**Footer**
- Product links, legal, social
- Version stamp: `v0.1 — beta`

### 3.3 Landing site technical requirements

| Requirement | Spec |
|-------------|------|
| Framework | Next.js 14+ (App Router) |
| Styling | Tailwind CSS + CSS variables for theming |
| Animation | Framer Motion for scroll reveals; CSS for micro-interactions |
| CMS | Contentful or Sanity for blog/use cases; hardcoded for core pages |
| Analytics | Posthog (product analytics) + Vercel Analytics |
| Forms | Custom with server actions or Resend for email capture |
| Performance | LCP < 2.5s; no layout shift on load; fonts subset and preloaded |
| SEO | Full meta, OG images, structured data for org |
| Accessibility | WCAG 2.1 AA minimum; keyboard nav on all interactive elements |

---

## 4. Surface 2 — Web application

### 4.1 Core app pages / views

| View | Route | Description |
|------|-------|-------------|
| Dashboard | `/dashboard` | Overview: coverage %, freshness score, recent activity |
| Knowledge graph | `/graph` | Visual canvas of the company's knowledge map |
| Knowledge nodes | `/nodes` | List/table view; filter by domain, status, confidence |
| Node detail | `/nodes/:id` | Full node view: content, sources, history, owner |
| Skills library | `/skills` | All compiled skills files, version history |
| Skill detail | `/skills/:id` | File preview, agent usage stats, edit/publish controls |
| Connectors | `/connectors` | Data source connections, sync status, last-run logs |
| Review queue | `/review` | Pending nodes awaiting knowledge owner approval |
| Feedback log | `/feedback` | Agent outcomes feeding back to the graph |
| Settings | `/settings` | Team, permissions, integrations, billing |

### 4.2 Dashboard

**Layout:** Two-column. Left: key metrics. Right: activity feed.

**Metric cards (top row):**
- Knowledge coverage % (with trend arrow)
- Agent task success rate (30-day)
- Nodes pending review
- Knowledge freshness score (median days since last update)

**Coverage by domain (middle section):**
- Horizontal bar chart per department/domain
- Color-coded by confidence level (low / medium / high)
- Click to drill into that domain's nodes

**Activity feed (right column):**
- Real-time list: new node extracted, skill published, agent escalation, human correction
- Each item links to the relevant node or skill
- Filter: all / extractions / skills / feedback

**Quick actions:**
- "Review queue" shortcut (badge with count)
- "Add connector" CTA if < 3 connectors connected

### 4.3 Knowledge graph canvas

This is the product's most visually distinctive view.

**Behavior:**
- Force-directed graph using D3 or Cytoscape.js
- Nodes clustered by domain (color-coded)
- Node size = confidence score (larger = higher confidence)
- Edge thickness = relationship strength / co-occurrence frequency
- Clicking a node opens a side panel with node detail
- Right-click context menu: Edit / View sources / Mark stale / Assign owner

**Controls:**
- Top-left: domain filter chips
- Top-right: zoom controls + "fit to screen"
- Bottom: confidence threshold slider (hides nodes below threshold)
- Search bar: node name or keyword; graph zooms to matching node

**Visual states per node:**
- Healthy (solid fill, accent color border)
- Stale (dashed border, muted fill)
- Pending review (amber border)
- Conflicted (red border, warning icon)
- New / unreviewed (pulsing outline)

**Performance requirement:** Must render up to 2,000 nodes at 60fps on a modern laptop. Use WebGL renderer (Sigma.js or Graphology) for large graphs.

### 4.4 Review queue

The most critical UX flow in the product — knowledge owners spend most of their time here.

**Layout:** Split-panel
- Left: queue list (node name, domain, source, extracted date, confidence score)
- Right: node detail with full extracted content and source evidence

**Actions per node:**
- Approve (mark as reviewed, node goes live)
- Edit + approve (inline editing before approval)
- Reject (with required reason: wrong / duplicate / out of scope)
- Assign to another owner
- Snooze (reappears after N days)

**Keyboard shortcuts required:**
- `A` — approve
- `E` — open edit mode
- `R` — reject
- `J/K` — next/previous in queue

**Bulk actions:**
- Select multiple nodes → bulk approve / assign / reject

### 4.5 Skills library

**List view columns:** Skill name / Domain / Version / Last published / Agent usage (30d) / Status

**Status values:** Draft / Published / Deprecated / Under review

**Skill detail panel:**
- YAML/JSON file preview with syntax highlighting
- Side-by-side: current version vs. previous version (diff view)
- "Used by agents" section: list of agent IDs consuming this skill
- Agent outcome stats: success rate, escalation rate, correction rate
- Publish / Deprecate / Create new version actions

### 4.6 Connectors page

**Layout:** Grid of connector cards

Each connector card shows:
- Integration name and logo
- Connection status (connected / disconnected / error)
- Last sync timestamp
- Record count (documents ingested)
- Quick actions: Sync now / Configure / Disconnect

**Add connector flow:**
- Modal with integration search
- OAuth or API key setup
- Scope selection (which channels, folders, or record types to ingest)
- Test connection → success state → trigger first sync


