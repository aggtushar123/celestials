# Ask Revenact on the Brain

The owner approved this design on 2026-10-06, as the delivery after the Brain UI (#117). It adds the same Ask rail as Organizations, Accounts and Pipelines to the four Brain tabs. Answers are grounded in the current tab and scope.

## Decisions (owner)

1. **Starter questions.** There are 3 per tab: fixed text, with no extra model call. They show only while the conversation is empty. This is new to Ask, so the other surfaces stay as they are.
2. **Sharing.** A Brain answer is readable by the person who asked it, and by a reader of the same organisation who sees everything (view_all_accounts) and reads every ticket department (in practice Leadership). That holds for every reader other than the asker, whoever they are in the conversation: its owner, an accepted session participant and a mentioned reader alike. Any other reader sees the question with the answer redacted, and the answer reaches their next question's model history and the session facilitator only as the redaction notice. This is because Brain answers are scope-wide aggregates (a team's or the company's book), with open-ticket counts taken under the asker's ticket rules, that cannot be re-filtered per reader.

## 0. What exists

- **Backend.** `services/copilot/ask.py`, `SURFACES`, holds one `Surface(serializer, ground, system_prompt, purpose)` per page. `SendMessageView` validates the context through `AskContextSerializer`, grounds it, runs `get_completion` (budget, credits and a `ModelCall`), and stores the context on the turn. Shared-reader access goes through `_reply_readable_by` (fail-closed), with `Grounding.customer_ids` and `records` as the snapshot. Adding a surface means three things, or the tests fail: a row in `SURFACES`, a purpose in `usage.PURPOSES`, and a `Skill` in `skills.py`.
- **Brain.**
  - `brain.scope.resolve(reader, key)` returns a `Scope`, or raises `ScopeUnknown` / `ScopeNotAllowed`.
  - The tab payloads are `changed.build(scope, today)`, `waiting.build(reader, scope, today)`, `doing.build(...)` and `customers.build(...)`. They already apply the twice-filter: no names the reader can't open, and figures counted only over what the reader may read.
  - `briefs.latest` returns the readable stored brief.
  - `metrics/brief.py` `evidence_from` / `build_prompt` is the existing "Brain → model text" pipeline.
- **Frontend.**
  - `AskProvider`, `AskRail` (the glass rail, which portals AskControls into the bar's actions slot) and `CopilotRail`.
  - Per surface there is an `XAskLayout` with `surface {name, context, chipLabel}` and a `preferenceKey`.
  - Types in `src/pages/copilot/types.ts`: the `SurfaceContext` union and `SurfaceOrigin`.
  - `BrainFrame` has a reserved `rail` prop, and `BrainControls` portals the scope switch into the same slot.

## 1. Backend

### 1.1 Context (`services/copilot/brain_context.py`)

`BrainContextSerializer`:
- `surface: "brain"`
- `scope: "me" | "team" | "company"`
- `tab: "changed" | "waiting" | "doing" | "customers"`

`validate()` calls `brain.scope.resolve(user, scope)`. An unknown scope, or one the reader may not use, gives 400 `{"scope": ["You can't ask about that view."]}`. There is no focus in this delivery.

### 1.2 Grounding (`services/copilot/brain_grounding.py`)

`build_brain_grounding(user, context, question, *, today=None) -> Grounding`:
- Resolve the scope. Build the **current tab's** payload in full, using the same `build` the page uses. For the other three tabs, add one summary line each:
  - What changed: the four headline metrics, now and change.
  - Waiting: counts per kind.
  - Doing: initiatives on track out of active, open plans and how many are at risk, rules that fired last night.
  - Customers: asks total, anomalies total, NPS and CSAT now (or "not enough answers"), negative contacts.
- If a readable stored brief exists for this scope (`briefs.latest`), add its headline and paragraphs.
- Render as plain lines in the `metrics/brief.build_prompt` style: tab sections, figures with units, and "N more on records you can't open" wherever the payload has hidden counts. Never put a hidden record's name or id in the prompt.
- Snapshot:
  - `customer_ids` is every customer named anywhere in the prompt (asks, anomalies, sentiment records, plan records, waiting records and moves).
  - `records` is `[]`.
  - `pipeline` and `tickets` stay at their empty defaults.
- `brain_system_prompt(tone, summary)` wraps `dashboard_system_prompt` with a Brain persona. The persona says:
  - answer only from the given figures for this view;
  - name customers only from the data;
  - say "not in this view" rather than guessing;
  - keep it short, with figures in the reader's currency.
- Purpose is `"brain"` (label "Ask on the Brain") in `usage.PURPOSES`, plus a `Skill` entry. It is metered and charges AI credits like the other surfaces.

### 1.3 Sharing (`views._reply_readable_by`, `views.brain_gated`)

For a turn whose context `surface == "brain"`, the reply is readable only when one of these holds:
- the reader is the turn's author (the user who asked);
- the reader is in the conversation's organisation, `sees_everything(reader)`, and `reads_every_ticket_department(reader)` (`_brain_reply_readable_by`).

This applies to every reader other than the asker, regardless of whether they own the conversation, are an accepted session participant, or are only mentioned. Otherwise the reply is `REDACTED_REPLY`, its question loses its context, and a Brain `origin` from that question is null. A reply fed a Brain answer as history is withheld the same way. The send's model history and the facilitator transcript are built from the same per-reader view (`visible_messages`), so a withheld answer reaches the model only as `REDACTED_REPLY`. Every other rule stays as it is. The check fails closed on a malformed context, meaning anything other than exactly `{surface, scope, tab}`. Other Ask surfaces keep the existing behaviour, where the owner and participants read every reply whole.

### 1.4 Docs

API_CONTRACTS (copilot surfaces), data-classification (Ask on the Brain → model provider), TRD, PRD.

## 2. Frontend

### 2.1 Types

`BrainAskContext {surface: 'brain'; scope: BrainScopeKey; tab: BrainTab}` and `BrainAskOrigin` go into the unions. `withFocus` passes it through unchanged.

### 2.2 BrainAskLayout

- **Placement.** `src/pages/brain/ask/BrainAskLayout.tsx` wraps the Brain routes once (in `BrainRoutes`), so the rail is never remounted by a tab or scope change.
- **Provider.** It renders `AskProvider` with these values:
  - `surface`: `{name: 'brain', context, chipLabel}`;
  - `context`: built from the active tab (from the route) and the page's resolved scope;
  - `preferenceKey`: `BRAIN_ASK_KEY`.
- **Scope reporting.** The scope is reported up by the Brain pages through a small context, the way Organizations reports its options. It is `null` until the scope settles. The rail can't send while the context is `null`, and the composer says so.
- **Sub-pages.** Feature Requests, Anomalies and the Graph have no Ask context in this delivery. The rail stays mounted but shows "Ask from one of the four Brain tabs" and sends nothing.
- **Rail.** `BrainFrame`'s `rail` gets `<AskRail />`. AskControls portal into the same bar slot as the scope switch, to its right.
- **Chip.** `chipLabel` gives "Brain · What changed · Company", using the tab title and scope label.

### 2.3 Starter questions

When the thread is empty and the context is valid, show 3 buttons above the composer. Pressing one sends it as the question. The text is fixed per tab:
- **What changed:**
  - "Why did these numbers move?"
  - "Where is the ARR at risk concentrated?"
  - "What should I watch next?"
- **Waiting on you:**
  - "What should I decide first?"
  - "What has been waiting longest, and why?"
  - "Which of these can I clear today?"
- **What's being done:**
  - "Which initiatives are off track?"
  - "Are the plans moving health and ARR?"
  - "What are the rules doing for this book?"
- **Customers:**
  - "What are customers asking for most?"
  - "Who turned negative, and what do they have in common?"
  - "What do the latest comments say?"

The starters are shared in `CopilotRail` behind an optional `starters` prop. Other surfaces pass none, so they don't change. They have 44px targets and sentence case.

### 2.4 States

- The existing refusal handling covers a scope refusal: a 400 shows "That view changed; ask again".
- A 429 means the budget is spent.
- A 503 means Ask isn't set up.

## 3. Tests

- **Backend: context.** Each tab and scope validates. A scope the reader may not use gives 400. An unknown tab gives 400.
- **Backend: grounding.**
  - Figures equal the page payloads for the same scope.
  - A hidden record never appears in the prompt.
  - The other-tab summary lines are present.
  - `customer_ids` covers the named customers.
  - The query count stays constant for 1 vs N items.
- **Backend: send.** The surface is metered as "brain", charges credits and stores the context. The 429, 503 and 502 mappings work.
- **Backend: sharing.**
  - The asker reads the reply.
  - A view_all reader reads it.
  - A mentioned-only teammate gets `REDACTED_REPLY`, even when they can open every named customer.
  - Malformed context fails closed.
- **Frontend.**
  - The rail opens from the bar, and the chip label is right.
  - The context follows tab and scope changes without remounting.
  - Nothing sends before the scope settles.
  - The starters show only when the thread is empty, and send on press.
  - Sub-pages show the "ask from a tab" state.
  - At 375px the rail is a sheet.
  - The house rules pass, and the e2e asks a question on What changed in My team.

## 4. Out of scope

- A per-item focus, such as asking about one move, initiative or ask.
- Starters on the other Ask surfaces.
- Ask on Feature Requests, Anomalies and the Graph.
