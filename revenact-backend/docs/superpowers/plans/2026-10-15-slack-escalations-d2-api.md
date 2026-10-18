# Slack escalations, delivery 2 ("Account team and department heads"): API contract

Backend plan: `docs/superpowers/plans/2026-10-15-slack-escalations-d2-backend.md`. Frontend plan:
react-ts-app `docs/superpowers/plans/2026-10-15-slack-escalations-d2-frontend.md` (branch
`feat/slack-escalations-d2`). Spec: react-ts-app `docs/superpowers/specs/2026-10-15-slack-escalations-design.md`
§2 (decisions 3 and 9), §4 (D2), §9 (the D2 row), §10, §11 (set-up step 2), §14 Q1 and §15, on its `main`.
The D1 contract (`2026-10-15-slack-escalations-d1-api.md`, as built in `docs/API_CONTRACTS.md`) and the
knowledge contracts (`docs/API_CONTRACTS.md` › `knowledge`) still hold except where this file changes them.
Every path is under `/api/v1/`, every route is `IsAuthenticated` (401 without a token) unless it says
otherwise, every body is JSON.

Merge order: this delivery's backend PR, then its frontend PR. What an old frontend sees between the two
merges: nothing changes (one new route nobody calls yet, one new audit row on an existing PATCH whose
shape is unchanged).

## What the merged code does today (main 7fabf66, D1 merged as #124)

- **The account team exists** as `knowledge.FunctionOwner` (`services/knowledge/models.py`): one row per
  customer per function, `clean()` (run by `save()`) refuses a person outside the function ("Priya Nair
  is in Engineering, not Sales."). Customer Success is not a row: it is `Customer.owner`, from any
  function.
- **`GET/PATCH /customers/<id>/responsible/`** (`knowledge.views.CustomerResponsibleView`): GET answers
  `{customer_id, account_owner, responsible: [{function, function_display, user}]}` for the six
  functions to any member of the workspace (`_company_customer`: knowledge is company-wide). PATCH
  `{"function", "user_id" | null, "note"?}` needs `view_all_accounts` (403 "Setting who is responsible
  needs view-all-accounts."); `cs` writes `Customer.owner` behind `ownership.may_change_owner`, writes the
  handover contribution and notifies the new owner; any other function refuses a person outside it (400
  "<name> is in <function>, not <function>. Pick someone from <function>."). **It writes no audit row**,
  and it accepts a deactivated person.
- **Edited only in the organisation's Knowledge tab** (react-ts-app `CompanyViewTab.tsx`).
- **No department head exists.** `identity.Department` is free-form and routes nothing.
- **Nothing resolves "who handles this customer in a function"** with a fallback.
  `knowledge/mentions.py` has its own rule for @-mentions (the responsible person, else everyone in the
  function); it is not changed.

## Decisions narrowing the spec

| # | Decision | Cost if wrong |
|---|---|---|
| SE2-1 | **Scope.** A department is a function (`User.Function`: `cs`, `engineering`, `sales`, `analytics`, `leadership`, `other`; spec §2.9, §14 Q1). This delivery adds `FunctionHead`, `GET/PATCH /function-heads/`, `ownership.handler_for` and one audit row on the existing `/responsible/` PATCH. No route calls `handler_for` yet (the escalation bundle, D3, will). No change to @-mention routing, ticket visibility or queues. | None. |
| SE2-2 | **`knowledge.FunctionHead`** (§1.1): `(organisation, function)` unique; `user` required. Clearing a head **deletes its row** (there is never a row with no head). CASCADE from the user and the organisation. | None. |
| SE2-3 | **Who may head a function:** an active member of the same workspace whose `User.function` is that function. `FunctionHead.clean()` (run by `save()`) refuses otherwise, keyed `user`, with the sentences of §2. | Low. |
| SE2-4 | **On duty at read time.** People move between functions and leave after they were named. A head, or an account-team person (`FunctionOwner`), who is deactivated **or no longer works in that function** is off duty: `handler_for` skips them and `GET /function-heads/` reads that function as `null`. The Customer Success answer (`Customer.owner` / `Account.owner`) is open to any function, so for it only "active" is checked. Stored rows are not deleted when someone leaves or moves; naming someone else replaces the row. | Low: a head who moves back into the function is head again without anyone choosing them. |
| SE2-5 | **The route** (§2): `GET /function-heads/` for any member (names only members of the reader's own workspace, already listed to every member by `/auth/members/`); `PATCH /function-heads/` needs `manage_org_settings` (SOC2 AUTH-02; the spec's "admins only"). | Low. |
| SE2-6 | **Audit** `function_head.changed` (SOC2 LOG-01), written only when the head actually changes: actor the caller, organisation and target the workspace (`Organisation`), metadata `{"function", "from", "to"}` with user ids or null. Setting the same head again writes nothing. | None. |
| SE2-7 | (changed during the build: owner ruling 2026-10-16) **`knowledge.ownership.handler_for(record, function, *, organisation_id=None) -> (user | None, via)`** (spec §4.3), `via` one of `"team"`, `"head"`, `"nobody"`. For a **customer**: Customer Success is `customer.owner` when active; any other function is its `FunctionOwner` when on duty (SE2-4): `"team"`; else the function's head when on duty: `"head"`; else `(None, "nobody")`. For an **account**: Customer Success goes to the account's own owner first, when set and active (any function): `"team"`; otherwise exactly one parent customer, that customer's answer (its owner, then the Customer Success head); with none or several parents, the function's head. Other functions: the one-parent rule, else the head. A customer always uses its own workspace's head; `organisation_id` is only the fallback for an account with no parent customer. An unknown function raises `ValueError`. Only heads of the record's own workspace are ever used. | Low: answered by the owner: the account's own owner first. |
| SE2-8 | **Ceilings.** `FUNCTION_HEADS_QUERIES = 1` (the GET, whatever the number of heads). `handler_for`, with no related row cached on the record: a customer's team hit 1 query, a fallback to the head 2. An account, as measured: Customer Success hit on its own owner 1; one parent, other function, team hit 2, head fallback 3; one parent, Customer Success, parent's owner hit 1; account owner off duty then parent's owner 2, then the head 3; two parents, head fallback 2 (parents are read with `select_related("owner")`). No `DISTINCT`. PATCH is not pinned (a write behind a capability check, like other settings writes). | Low. |
| SE2-9 | **The account team is audited.** The existing `PATCH /customers/<id>/responsible/` writes `function_owner.changed` (SOC2 LOG-01) when the person for a function actually changes: target the customer, metadata `{"function", "from", "to"}` with user ids or null (Customer Success included: `from`/`to` are the owner). Its shape, rights (`view_all_accounts`; Customer Success also `may_change_owner`), handover contribution and notification are unchanged; it still accepts a deactivated person (who is then off duty, SE2-4). | Low. |
| SE2-10 | **Privacy and the twice-filter.** No model reads anything new in this delivery. `/function-heads/` exposes names and ids only (no email). Neither row stores text. | None. |
| SE2-11 | **Screens** (frontend plan): the Account team card on the organisation's Details tab reads `/responsible/` (and writes it, `view_all_accounts`), `/function-heads/` and `/auth/members/`; Settings › People & teams › Department heads reads `/function-heads/` and `/auth/users/` and writes `/function-heads/` (`manage_org_settings`; the page itself is `manage_users`). | None. |

## 1. Data

### 1.1 `knowledge.FunctionHead` (`knowledge.0006_functionhead`)

| Field | Type | Notes |
|---|---|---|
| `organisation` | FK `accounts.Organisation`, CASCADE, `related_name="function_heads"` | the workspace |
| `function` | char 16, choices `User.Function` | |
| `user` | FK User, CASCADE, `related_name="function_headships"` | SE2-3 |
| `updated_at` | datetime, `auto_now` | |

Constraint `one_head_per_function_per_organisation` unique on `(organisation, function)`.

## 2. `GET/PATCH /function-heads/`

`GET` → `200`, always the six functions in `User.Function` order:

```json
[
  {"function": "cs", "function_display": "Customer Success", "user": {"id": 3, "name": "Faiz Jamal"}},
  {"function": "engineering", "function_display": "Engineering", "user": {"id": 7, "name": "Jesh Sanghvi"}},
  {"function": "sales", "function_display": "Sales", "user": null},
  {"function": "analytics", "function_display": "Analytics", "user": null},
  {"function": "leadership", "function_display": "Leadership", "user": null},
  {"function": "other", "function_display": "Other", "user": null}
]
```

`PATCH {"function": "engineering", "user_id": 7}` (or `"user_id": null` to clear) → `200` with the same
six rows. Refusals, in this order:

| # | Case | Status | Body |
|---|---|---|---|
| 1 | no token | 401 | DRF's |
| 2 | caller lacks `manage_org_settings` | 403 | `{"detail": "You don't have permission to change organisation settings."}` |
| 3 | `function` missing or not one of the six | 400 | `{"function": ["This field is required."]}` / `{"function": ["\"finance\" is not a valid choice."]}` |
| 4 | `user_id` missing (a missing key never clears a head) | 400 | `{"user_id": ["This field is required."]}` |
| 5 | `user_id` is not a member of the caller's workspace | 400 | `{"user_id": ["No such member."]}` |
| 6 | the person is deactivated | 400 | `{"user_id": ["Jesh Sanghvi is deactivated. Pick an active member."]}` |
| 7 | the person works in another function | 400 | `{"user_id": ["Faiz Jamal is in Customer Success, not Engineering. Pick someone from Engineering."]}` |

A refused PATCH changes nothing and writes no audit row.

## 3. `GET/PATCH /customers/<id>/responsible/` (changed: audit only)

Unchanged shape, rights and refusals. A PATCH that changes who answers for a function writes
`function_owner.changed` (SE2-9); one that sets the same person, or is refused, writes nothing.

## 4. `handler_for` (in-process, no route)

```python
from services.knowledge.ownership import handler_for

handler_for(globex, "engineering")  # (jesh, "team") | (head, "head") | (None, "nobody")
handler_for(emea_account, "cs", organisation_id=4)  # the account rule (SE2-7)
```

## 5. Audit

| Event | Actor | Target | Metadata |
|---|---|---|---|
| `function_head.changed` | user (`manage_org_settings`) | Organisation | `function`, `from`, `to` (user ids or null) |
| `function_owner.changed` | user (`view_all_accounts`) | Customer | `function`, `from`, `to` (user ids or null) |

## 6. Query ceilings

Pinned by tests (SE2-8) and written into `docs/API_CONTRACTS.md` and "Changes during the build".

## 7. Not in this delivery

The escalation bundle and everything that calls `handler_for` (D3); an account's own account team (an
account inherits its parent customer's, SE2-7); free-form `identity.Department` as a routing unit;
refusing a deactivated person on `/responsible/` (SE2-9).

## 8. Owner set-up and live checks (Alfiee, dev DB org 4; spec §11 step 2)

- Settings › People & teams: Jesh's function Engineering, Faiz's Customer Success (Members). Then
  **Department heads**: Engineering Jesh Sanghvi, Customer Success Faiz Jamal.
- Globex (QA) › Details › **Account team**: Customer Success Faiz Jamal (the owner), Engineering Jesh
  Sanghvi.
- **LC-D2a** Initech (QA) › Details › Account team, Engineering row empty: reads "Nobody yet · Jesh
  Sanghvi (Engineering head) takes it".
- **LC-D2b** As a member without `manage_org_settings`: Department heads reads but cannot be changed.

## Changes during the build

The build records here every change to this contract (with the measured ceilings), and relays each to the
frontend controller.

1. **SE2-7, owner question 1 (owner ruling 2026-10-16).** For an account, Customer Success goes to the account's own owner first, when set and active (any function): `via="team"`. Only then: exactly one parent customer -> that customer's answer (its owner, then the Customer Success head); otherwise the Customer Success head. Other functions unchanged. **Frontend impact:** none on the D2 screens (the Account team card is on the organisation/customer page, which reads `/customers/<id>/responsible/`; accounts have no Account team card in D2). Any copy that explains account routing (D3) must say "the account's owner, else the organisation's".
2. **SE2-7, whose head.** A customer always uses its own workspace's head; `organisation_id` is only the fallback for an account with no parent customer. **Frontend impact:** none.
3. **SE2-8, measured ceilings for `handler_for`** (pinned by tests). Customer: team hit 1; head fallback 2. Account: Customer Success hit on the account's own owner 1 (parents not read); one parent, other function, team hit 2, head fallback 3; one parent, Customer Success, no account owner, parent's owner hit 1 (parents read with their owner); account owner off duty -> parent's owner 2, -> head 3; two parents, head fallback 2. Parents are read with `select_related("owner")`. **Frontend impact:** none.
4. **`PATCH /customers/<id>/responsible/` is atomic** (final review): the change and its `function_owner.changed` row commit together (an audit failure rolls the change back and answers 500); the Customer Success "made you the account owner" notification is sent after commit. Shape, rights and refusals unchanged. **Frontend impact:** none.
5. **OpenAPI:** `/function-heads/` has a documented schema (`FunctionHeadRowSerializer` rows; PATCH body `{function, user_id}`). **Frontend impact:** none.
