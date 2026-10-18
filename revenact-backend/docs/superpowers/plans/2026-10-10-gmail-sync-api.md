# Two-way Gmail, delivery 1 ("sync engine"): API contract

**Sources:**
- Spec: react-ts-app `docs/superpowers/specs/2026-10-10-gmail-two-way-design.md`, §1, §2, §4 (Settings and portal parts) and §5 "Deliveries 1".
- Code read for this contract: `services/mail/` (models, views, serializers, urls, sync, categorise, providers, visibility, `sync_mail`), `services/identity/models.py` (`OrganizationDomain`, `OrganizationMembership`), `services/billing/` (`SeatAssignment`, `seats.py`, `signals.py`), `services/platform/views.py`, `services/accounts/models.py` (`Organisation`), `core/audit.py`, `core/throttling.py`, `services/connectors/views.py` (`ConnectorInboundView`), `docs/API_CONTRACTS.md` (`mail` and the portal), revenact-infra `deploy/docker-compose.prod.yml` (`mailsync`).
- Backend plan: `docs/superpowers/plans/2026-10-10-gmail-sync-backend.md` (to follow). Frontend plan: react-ts-app `docs/superpowers/plans/2026-10-10-gmail-sync-frontend.md` (to follow).

**Conventions:**
- Every path is under `/api/v1/`. Bodies are JSON. Timestamps are ISO 8601 UTC as DRF writes them.
- Every route is `IsAuthenticated` except the OAuth callback (today's, unchanged) and the push webhook (new). Both are `AllowAny` with `authentication_classes = []`, the `ConnectorInboundView` pattern.
- Mail errors use the drafts shape, `{"code": "...", "detail": "..."}` (`services/customers/drafts_views._code`). Validation errors keep DRF's field shape. The existing `{"detail": "..."}` answers without a code are unchanged.
- Portal errors keep the portal's shape, `{"success": false, "error": {"code", "message"}}`.
- "Google connection" means a `MailboxConnection` with `provider="google"`. Outlook and IMAP keep today's behaviour everywhere; §9 says how their responses look with the new fields.

## Decisions made in this contract

The spec leaves these open, or the code forced them. Each one is the owner's to overrule.

1. **The workspace switch is a field on `Organisation`**: `gmail_two_way_enabled = BooleanField(default=False)`, next to `ai_agent_enabled`. It is not on the tenant's settings serializer, so tenant admins can neither read nor write it there. Only the portal changes it.
2. **The portal switch is its own route.** It is `POST platform/organisations/<id>/gmail/ {enabled, reason}`, shaped like `status/`. The reason is required, as on every other portal mutation. A no-op (same value) answers 200 and writes no audit row.
3. **The 100-test-user cap is shown, not enforced.** The cap is Google's (test users in the Cloud console), and Google itself refuses anyone not on the list. The portal shows live Google connections against `GMAIL_TEST_USER_CAP` (default 100), platform-wide and per workspace.
4. **Two checks happen before OAuth, and every check runs again in the callback.**
   - `POST mail/connect/google/` refuses up front when the workspace is off, the workspace has no verified domain, the person is not an active member, or they hold no seat. This saves a pointless trip to Google.
   - The callback checks all of these again (the state lives 15 minutes). It then checks the **address's domain**, which only Google can tell us. A refusal after the code exchange revokes the token Google just issued, and nothing is stored.
5. **The domain match is exact.** The part after `@` of the address `users.getProfile` returns, lowercased, must equal a `verified` `OrganizationDomain.domain` of the person's organisation. A subdomain does not match its parent.
6. **One live Google connection per address.** A partial unique constraint covers `(provider, address)` where provider is google and status is not disconnected. A second person connecting the same Gmail gets `ADDRESS_IN_USE`. The push webhook relies on this to find the mailbox by `emailAddress`.
7. **All three scopes, or nothing.** Google's consent screen lets a person untick scopes. If the grant lacks any of `gmail.modify`, `gmail.send` or `gmail.compose`, the callback refuses with `SCOPES_MISSING`, revokes the grant and stores nothing. So a *new* connection is always two-way. `needs_reconnect` exists for connections made before D1.
8. **Every Google connection runs the new engine**, legacy read-only ones too. `gmail.readonly` allows everything D1 calls: history, labels, get, list, getProfile and watch. `two_way: false` only means that D2's actions will be off for it. The gates and pauses apply to every Google connection. The Google OAuth client was never configured in any environment, so no real legacy rows exist. This keeps one code path.
9. **Disconnect keeps the row.** `MailboxConnection` is one-to-one with the user, so the simplest tombstone is the row itself:
   - `status` becomes `disconnected`, `disconnected_at` is set, the credentials are wiped and the token is revoked at Google.
   - The personal copies stay attached to the row.
   - The nightly prune deletes the row after `MAIL_DISCONNECT_RETENTION_DAYS` (30), and the personal copies cascade with it.
   - Reconnecting the **same** provider and address within the 30 days resumes the row and keeps the copies. Connecting a **different** address or provider deletes the kept row first.
   - **Google only.** Outlook and IMAP disconnects still delete at once, as today.
10. **`GET mail/connection/` answers `connection: null` once disconnected**, plus a new top-level `disconnected` block (address, when, `delete_after`). Today's frontend check (`connection` null → show Connect) keeps working.
11. **For Google mailboxes, Gmail's labels are the truth from D1 on.**
    - `locally_changed_at` no longer freezes a Google message's flags. A PATCH still changes `is_read`, `is_starred` and `state` locally, and D1 writes nothing back (the outbox is D2). So a local change lasts until Gmail next reports a change to that message.
    - `muted` is never touched by sync.
    - Outlook and IMAP keep the `locally_changed_at` rule.
12. **Labels in responses are user labels only**, resolved to `{id, name, color}`. System labels are already the folder and flags, and category labels are already the category. `id` is the Revenact `MailLabel` id, not Gmail's, because a label created here in D2 has no Gmail id until the outbox sends it.
13. **`GET mail/labels/` lists user labels only, without counts.** Unread counts per label and the `?label=` list filter come with the D2 sidebar. The GIN index on `label_ids` arrives with that filter.
14. **`cc` is split out for new Gmail rows only.** Every provider merges To and Cc into `to` today. From D1, Gmail rows store `to` (To only), `cc` and `bcc`.
    - Outlook and IMAP rows, and Gmail rows stored before D1, keep the merged `to` and answer `cc: []`, `bcc: []`.
    - Filing is unchanged: the counterpart match and the filed `Email.to_addresses` still use To + Cc. Bcc is never filed.
15. **The import has two bounds**: `import_after` (the 12-month line) and `import_before` (the moment of connecting). Gmail page tokens only work with the identical `q`, so both bounds are stored. The spec named only `import_before`, calling it the 12-month line.
16. **The import total is `users.getProfile.messagesTotal`**, as the spec says. That count covers the whole mailbox, not the 12 months. So for an old mailbox the import often reports `done` well before `imported` reaches `total_estimate`. The UI must say "about" and treat `done` as final.
17. **Imported mail is filed but not always classified at once.** Mail the import files is classified inline only when sent within the last 30 days, matching today's first sync. Older filed mail waits for the nightly, capped `classify_interactions` pass, so a 12-month backfill cannot spend a workspace's AI credits in one afternoon. That pass runs oldest first, so it works through the backfill before it reaches anything newer. New mail from history is classified inline as today.
18. **Mailboxes are claimed with a lease, not held under a row lock.**
    - Each tick claims due rows with `select_for_update(skip_locked=True)` inside a short transaction. The claim clears `wake_at`, stamps `lease_until = now + MAIL_LEASE_SECONDS` and commits. The Gmail work then runs outside any transaction.
    - The spec held the lock for the whole tick. Then the webhook's `UPDATE wake_at` would block for a whole tick, and Pub/Sub's push deadline (10 s) would expire.
    - A push that arrives mid-tick sets `wake_at` again, so the mailbox is due again straight after.
    - Every write a tick makes to the connection is conditional on its claim: the row must still carry the tick's `lease_until` stamp and not be `disconnected`. A disconnect or a reconnect clears the stamp, so a tick running then stops quietly. It writes no credentials, sync state, backoff or pause over the person's change, and audits nothing. A send that is refused never pauses a disconnected row either.
19. **The order of history 404 recovery is corrected.**
    - The fresh `history_id` is taken from `users.getProfile` *before* the re-list, not after. Otherwise changes made during the re-list are lost.
    - The re-list is resumable: one page per tick, like the import, with its own page token, so a week of the VM being off does not stall every other mailbox. Recovery also refreshes the labels of known rows (`format=minimal`).
    - When the re-list finishes, it deletes local rows in the window that it did not see. This needs a new `MailMessage.refreshed_at`.
20. **Errors are sorted into four outcomes.**
    - **`token_revoked`:** the token refresh answers `400 invalid_grant` (or `invalid_client`), or an API call still answers `401` after one refresh. The connection goes to status `error` with "Reconnect Google", and sync stops until a reconnect.
    - **Backoff:** `429`, `5xx`, network errors, and `403` with reason `rateLimitExceeded` / `userRateLimitExceeded`. These are no longer reauth, as `http_json` treats every 403 today.
    - **Error with "Reconnect Google":** a `403` `insufficientPermissions`.
    - **Recovery:** a `404` on `history.list`.

    Today's `_fresh` treats *any* refresh failure as reauth, 5xx included. D1 narrows that.
21. **Backoff needs a failure count**: `consecutive_failures`. The delay is `min(30 s × 2^(n−1), 15 min)`, or Google's `Retry-After` if that is longer. A transient failure never changes `status`: it stays `connected`, and `error` carries the latest transient reason until the next success.
22. **Pauses are evaluated in bulk**, not per tick per mailbox. Once every `MAIL_SYNC_INTERVAL_SECONDS` the loop recomputes `paused_reason` for every live Google connection in a few queries, and audits each change. Paused rows are never claimed. `token_revoked` is cleared only by reconnecting.
23. **The precedence of `paused_reason`** is `token_revoked`, then `workspace_off`, then `suspended`, then `no_seat`.
    - `suspended` covers four cases: the user is inactive, the membership is suspended or revoked, there is no live membership, or the organisation is suspended or archived.
    - `no_seat` is nearly unreachable: `billing.signals` gives every active membership a seat with `enforce=False`. It is kept for a seat released by hand.
24. **A paused Google mailbox cannot send.** Compose, reply and draft send through it answer `409 MAILBOX_PAUSED`. Turning the pilot off must stop Revenact acting as the person in Gmail, not only reading.
25. **Sync now is queued for Google.** `POST mail/sync/` on a Google connection sets `wake_at` and answers `202`. An import page can take tens of seconds, which is too long for a request, and an inline tick would race the loop's lease. Outlook and IMAP still sync inline and answer 200 with `filed`.
26. **Push is off when not configured, and fails closed.**
    - Without `GMAIL_PUBSUB_TOPIC` the webhook answers `404`.
    - With it, an empty `GMAIL_PUBSUB_AUDIENCE` or `GMAIL_PUBSUB_SERVICE_ACCOUNT` makes every push `401`.
    - The OIDC token is verified with PyJWT (already pinned) and Google's JWKS, not a Google SDK. This follows `providers/base.py`'s no-vendor-SDK rule.
27. **A push is acknowledged even when it is useless.** A verified push for an unknown or paused address, with a malformed `data`, or with an old `historyId` answers `204` and does nothing, so Pub/Sub does not retry it forever. Rejected tokens are audited (`mailbox.push_rejected`), as `connector.inbound_rejected` is.
28. **HTML policy.** The policy is `nh3`, added to `requirements.txt` as a new pinned dependency:
    - tables, inline `style` attributes and `<style>` blocks are kept;
    - `http`, `https`, `mailto` and `cid` URLs are allowed, and `data:` URLs are not;
    - remote images are left in place;
    - sanitised output over `MAIL_HTML_MAX_BYTES` (1 MB) is dropped, and the text body is shown instead.
29. **The 12-month import skips what it already holds.** Ids already stored are not fetched again, so a restarted import (an expired page token, a reconnect) costs one list call per page.
30. **Labels are listed in full on every Google tick.** `labels.list` costs 1 quota unit. Gmail labels that are gone are deleted locally, and their ids left on messages are ignored when resolving.
31. **The callback still lands on `/integrations`.** The spec says "Settings › My mailbox", but the mailbox card is `MailboxSection` on the Integrations page today (`react-ts-app src/components/integrations/MailboxSection.tsx`). The redirect keeps `?mailbox=<outcome>&detail=` and adds the outcome `refused` with a `code`.
32. **Audit events beyond the spec's list:**
    - `mailbox.connect_refused`, so a refused attempt leaves a trace;
    - `mailbox.pruned`, as deletion evidence;
    - `mailbox.push_rejected`.

    Scope change is its own event (`mailbox.scopes_changed`), written alongside `mailbox.reconnect`.
33. **The OAuth callback finishes only in the browser that started it** (added 2026-10-10, owner-approved security fix; Google and Microsoft). The signed state alone named the person, so a member could forward their authorize link and a colleague consenting in their own browser would connect *their* mailbox to the sender's account. `POST mail/connect/<provider>/` now mints a random nonce, puts its SHA-256 in the signed state (`browser`), and sets the nonce as a cookie: HttpOnly, `SameSite=Lax` (the callback is a top-level GET, so it is sent), `Max-Age` 900 (the state's lifetime), no `Domain`. Over https it is `__Host-revenact_mail_oauth` with `Secure` and `Path=/`: the prefix makes the browser refuse any such cookie set with a `Domain` or from plain http, so a sibling subdomain (any other `*.sslip.io` site) cannot toss the starter's nonce into a victim's browser. Plain-http dev keeps `revenact_mail_oauth` with `Path=/api/v1/mail/oauth/`. The callback reads only the name for its own scheme, so over https an unprefixed cookie is ignored. The callback compares the two in constant time **before** the code exchange; a missing or different cookie, or a state with no binding, is `refused`/`BROWSER_MISMATCH`, audited `mailbox.connect_refused`. Every callback answer clears the cookie. The SPA sends that one fetch with `credentials: 'include'`: in local dev the SPA (`:5173`) and API (`:8000`) are cross-origin but same-site, so the browser stores the cookie only for a credentialed request, which `CORS_ALLOW_CREDENTIALS` already permits; in production they share one host. `MAIL_OAUTH_REDIRECT_BASE` must therefore be the API's own host.

### Spec against the code: mismatches found

- **The `mailsync` loop runs `sync_tickets` too.** revenact-infra's `mailsync` runs `sync_mail` **and** `sync_tickets` every 600 s, and the spec mentions only mail. Turning it into `sync_mail --loop` needs a separate ticket loop (operator step, §10).
- **Disconnect deletes personal copies today.** `MyMailboxView.delete` calls `connection.delete()` (`MailMessage.connection` cascades), and API_CONTRACTS documents it. The 30-day retention is a behaviour change, not a clarification.
- **There is no Settings › My mailbox.** The mailbox card is Integrations › `MailboxSection` (decision 31).
- **Gmail already merges Cc into `to`** (`parse_gmail_message`), and so do Graph and IMAP (decision 14).
- **The history-recovery order in §2 would lose changes** (decision 19).
- **`messagesTotal` is the whole mailbox** (decision 16).
- **Holding `select_for_update` for a whole tick blocks the webhook** (decision 18).
- **"Not CSRF-exempt beyond this one route" is moot.** DRF's `APIView.as_view()` is already `csrf_exempt`, and the API authenticates by JWT bearer, not by session cookie. The webhook adds no `@csrf_exempt` and no middleware change.
- **There is no seat gap to find.** `billing.signals.seat_follows_membership` gives every active membership a seat, so "holds a seat" and "is an active member" coincide in practice (decision 23).
- **The mail connection routes are undocumented.** `GET/DELETE mail/connection/`, `POST mail/connect/<provider>/`, the OAuth callback and `POST mail/sync/` are missing from `docs/API_CONTRACTS.md`. D1 documents them.
- **`docs/data-classification.md` is stale.** Its mailbox row says "the rest of the mailbox is read but never stored". It has been stored since `MailMessage` (2026-09-21). D1 corrects the row.
- **`MailMessage`'s docstring and API_CONTRACTS say "Gmail is connected read-only"**, and that "Gmail's cursor lists only mail newer than the last pass". D1 makes both untrue for Google.
- **`nh3` is not a dependency yet.** `cryptography`, which Fernet already uses, is only transitive. It is not pinned.

## 1. Gates

### The workspace switch (platform portal)

`Organisation.gmail_two_way_enabled`, default `false`. It is staff-only.

#### `POST /api/v1/platform/organisations/<id>/gmail/`

`IsPlatformStaff` (a superuser whose token carries `mfa: true`).

```json
{"enabled": true, "reason": "Pilot approved: Dough Co, 6 users added in Google Cloud"}
```

**200:**

```json
{"gmail": {"enabled": true, "connected": 0, "paused": 0}}
```

| Status | `error.code` | When |
|---|---|---|
| 404 | `ORGANIZATION_NOT_FOUND` | No such organisation |
| 400 | `INVALID_ENABLED` | `enabled` missing or not a boolean |
| 400 | `REASON_REQUIRED` | Blank reason |

- Audited as `platform.organisation.gmail_two_way` `{from, to, reason}`, on the tenant's own trail.
- A no-op answers 200 without an audit row.
- Turning it **off** pauses every Google connection in the workspace (`workspace_off`) at the loop's next gate sweep (≤ 60 s). Nothing is deleted.
- Turning it **on** resumes them at the next sweep.

#### Portal payloads gain `gmail`

`_summary` (so both `GET organisations/` and `GET organisations/<id>/`) gains:

```json
"gmail": {"enabled": true, "connected": 4, "paused": 1}
```

- `connected`: the workspace's Google connections that are not `disconnected`, paused and errored ones included. These are the ones holding a Google test-user slot.
- `paused`: how many of those have a `paused_reason`.
- The list endpoint computes both in one aggregate query, never per row.
- The pinned key set `DETAIL_KEYS` in `services/platform/tests/test_platform.py` gains `gmail`.

`GET platform/overview/` gains:

```json
"gmail": {"enabled_workspaces": 2, "connected": 37, "test_user_cap": 100}
```

These are platform-wide: the cap belongs to the one Google Cloud project. **Metadata only:** the portal shows no addresses beyond the membership emails it already lists, and no mail content.

### Who may connect Google

All four gates must pass. They are checked in this order, and the first failure is the answer:

| # | Gate | `code` | Message |
|---|---|---|---|
| 1 | `organisation.gmail_two_way_enabled` | `GMAIL_NOT_ENABLED` | "Your workspace isn't enabled for Gmail yet: ask Revenact support." |
| 2 | The person is active and has an `active` `OrganizationMembership` in `user.organisation` (`identity.context.active_membership`), and the organisation is `active` | `MEMBER_SUSPENDED` | "Your access to this workspace is suspended, so Gmail can't be connected." |
| 3 | An open `SeatAssignment` (`released_at` null) for that membership | `NO_SEAT` | "You need a seat in this workspace to connect Gmail. Ask an admin." |
| 4a | *(before OAuth)* The organisation has at least one `verified` domain | `NO_VERIFIED_DOMAIN` | "Your workspace has no verified domain yet, so no Google account can connect. An admin can verify one in Settings." |
| 4b | *(callback)* The address's domain is one of them, exactly | `WRONG_DOMAIN` | "Connect your pizzahut.com account." (it names up to three verified domains, joined with "or") |

The callback adds four more refusals:

| `code` | When | Message |
|---|---|---|
| `SCOPES_MISSING` | The grant lacks `gmail.modify`, `gmail.send` or `gmail.compose` | "Revenact needs all the Gmail permissions on the consent screen. Connect again and leave them all ticked." |
| `ADDRESS_IN_USE` | Another person has a live Google connection on this address | "This Google account is already connected by someone else in Revenact." |
| `GOOGLE_DENIED` | Google redirected with `error=access_denied` | "Google didn't grant access. Either you cancelled, or this Google account isn't on Revenact's test-user list yet: ask Revenact support." |
| `BROWSER_MISMATCH` | The callback reached a browser without the connect's cookie (a forwarded link), for Google and Microsoft alike (decision 33) | "Finish connecting in the same browser you started from. If someone sent you a connect link, start from your own Integrations page instead." |

The gates apply to `provider_key == "google"` only. Microsoft and IMAP connect as today.

#### `POST /api/v1/mail/connect/google/`

**On success:** `200 {"authorize_url": "https://accounts.google.com/o/oauth2/v2/auth?..."}`, plus `Set-Cookie: __Host-revenact_mail_oauth=<nonce>; HttpOnly; SameSite=Lax; Secure; Path=/; Max-Age=900` over https, or `revenact_mail_oauth=<nonce>; HttpOnly; SameSite=Lax; Path=/api/v1/mail/oauth/; Max-Age=900` over plain http (decision 33). Any OAuth provider, Microsoft too.

The URL now asks for these scopes:

```
https://www.googleapis.com/auth/gmail.modify
https://www.googleapis.com/auth/gmail.send
https://www.googleapis.com/auth/gmail.compose
openid email profile
```

It keeps `access_type=offline` and `prompt=consent`. `gmail.readonly` is no longer requested, because `gmail.modify` includes read. The backend plan's first task confirms against Google's per-method scope table that `gmail.modify` covers `history.list`, `labels.list`, `users.watch`, `users.getProfile` and `settings.sendAs.list`. If any method needs another scope, the plan stops and asks the owner.

**Refusals,** in the drafts error shape:

```json
{"code": "GMAIL_NOT_ENABLED", "detail": "Your workspace isn't enabled for Gmail yet: ask Revenact support."}
```

| Status | `code` |
|---|---|
| 403 | `GMAIL_NOT_ENABLED`, `MEMBER_SUSPENDED`, `NO_SEAT`, `NO_VERIFIED_DOMAIN` |
| 400 | unchanged: unknown provider, provider not configured (`{"detail"}` only) |

These refusals are not audited (no credential was touched). The callback's are.

#### `GET /api/v1/mail/oauth/google/callback/?code=&state=` (public)

It still answers a **302** to `${FRONTEND_URL}/integrations?mailbox=<outcome>[&code=<CODE>][&detail=<≤200 chars>]`.

| `mailbox=` | `code=` | Meaning |
|---|---|---|
| `connected` | (none) | New connection, or a reconnect of the same address |
| `refused` | one of the gate codes, `SCOPES_MISSING`, `ADDRESS_IN_USE`, `GOOGLE_DENIED`, `BROWSER_MISMATCH` | A gate said no; `detail` is the message above |
| `error` | (none) | Today's failures (bad or expired state, provider mismatch, unknown user, the code exchange failed), unchanged |

**The order of the work:**
1. **The state.** As today: the signed state, the provider, and an active user. Then the browser: the connect cookie for this scheme (`__Host-revenact_mail_oauth` over https, `revenact_mail_oauth` over http) must hash to the state's `browser`, else `refused`/`BROWSER_MISMATCH` before anything is exchanged (decision 33; Microsoft too). Every answer clears the cookie.
2. **The early gates.** Gates 1 to 3 run again. A refusal redirects before the code exchange.
3. **The code exchange.** Google's `scope` field is stored, space-split, as `granted_scopes`.
4. **The scope check.** A missing scope revokes the grant (`POST https://oauth2.googleapis.com/revoke`) and redirects `refused`/`SCOPES_MISSING`.
5. **The address checks.** `getProfile` gives the address. Gate 4b runs, then `ADDRESS_IN_USE`, and either refusal revokes the grant.
6. **Save:**
   - **The same user, provider and address** (live or `disconnected`): update the credentials and scopes, clear `disconnected_at`, `paused_reason`, `error` and the failure count, and set `status=connected`. This is audited as `mailbox.reconnect`, plus `mailbox.scopes_changed {from, to}` when the scope set changed.
   - **A row with a different address or provider:** that row is deleted first (its personal copies with it, `customers.Email.mailbox` nulled as today), with `mailbox.disconnect`. A new row is then created, audited as `mailbox.connect`.
   - **No row:** create, audited as `mailbox.connect`.

   `mailbox.connect` metadata gains `scopes` and `two_way`.
7. **Start the sync.** Set `history_id` from `getProfile.historyId`, then start the import (§5): `import_before = now`, `import_after = now − MAIL_IMPORT_MONTHS`, `import_total_estimate = getProfile.messagesTotal`, `import_done_at = null`, and an empty page token. A reconnect of a kept row (one that was `disconnected` or in `error`) also starts a 30-day reconcile (§5), because changes made while it was away are unknown. Finally `wake_at = now`.

Every refusal in steps 1 (`BROWSER_MISMATCH`) to 5 is audited as `mailbox.connect_refused {provider, code, domain?}` with outcome `failure`. It records the domain only, never the full address.

## 2. Scopes and the connection's state

`granted_scopes` is a JSON list of the full scope URLs Google granted. The API reports Gmail scopes by their short names (`gmail.modify`, ...).

- `two_way` = Google, and `{gmail.modify, gmail.send, gmail.compose} ⊆ granted_scopes`.
- `needs_reconnect` = Google, not disconnected, and (`two_way` is false **or** `paused_reason == "token_revoked"`). The frontend picks the banner from `paused_reason`: "Reconnect to turn on two-way", or "Google access was revoked: reconnect".
- Rows made before D1 have `granted_scopes = []` (the migration cannot know). They read as not two-way, with `needs_reconnect: true`.

## 3. My mailbox

### `GET /api/v1/mail/connection/`

```json
{
  "connection": {
    "id": 12,
    "provider": "google",
    "provider_display": "Google Workspace / Gmail",
    "address": "dana@doughco.com",
    "display_name": "Dana Ruiz",
    "status": "connected",
    "error": "",
    "last_synced_at": "2026-10-10T09:14:05Z",
    "created_at": "2026-10-10T08:01:44Z",
    "two_way": true,
    "needs_reconnect": false,
    "granted_scopes": ["gmail.modify", "gmail.send", "gmail.compose"],
    "import": {"state": "importing", "imported": 4210, "total_estimate": 18000, "done_at": null},
    "push": true,
    "paused_reason": null
  },
  "disconnected": null,
  "providers": [
    {"key": "google", "label": "Google Workspace / Gmail", "uses_oauth": true, "gate": null},
    {"key": "microsoft", "label": "Microsoft 365 / Outlook", "uses_oauth": true, "gate": null},
    {"key": "imap", "label": "IMAP / SMTP", "uses_oauth": false, "gate": null}
  ]
}
```

| Field | Meaning |
|---|---|
| `status` | `connected` or `error` (as today). `disconnected` rows are never returned as `connection` |
| `error` | The reconnect reason when `status=error`; else the latest **transient** reason while the mailbox is in backoff (for example "Gmail is rate-limiting this mailbox; retrying at 09:20 UTC"); else `""`. Never mail content |
| `last_synced_at` | The end of the last successful tick |
| `import` | `{state: "importing" \| "done", imported, total_estimate, done_at}`. `imported` is the count of this connection's `MailMessage` rows; `total_estimate` is `messagesTotal` taken at connect, which may be null (decision 16). `null` for Outlook and IMAP |
| `push` | `true` when `GMAIL_PUBSUB_TOPIC` is set and `watch_expires_at` is in the future. `false` otherwise, and always for Outlook and IMAP |
| `paused_reason` | `null`, `"no_seat"`, `"suspended"`, `"workspace_off"` or `"token_revoked"` (precedence in decision 23). `token_revoked` comes with `status: "error"` |
| `providers[].gate` | For `google`: the first failing **pre-OAuth** gate code (`GMAIL_NOT_ENABLED`, `MEMBER_SUSPENDED`, `NO_SEAT`, `NO_VERIFIED_DOMAIN`) or `null`. Always `null` for the others. The screen shows the gate's message instead of the Connect button |

`paused_reason` is computed **live** for this response with the same function the loop uses, so the screen is never a sweep behind. GET writes nothing.

**After a Google disconnect:**

```json
{
  "connection": null,
  "disconnected": {
    "provider": "google",
    "address": "dana@doughco.com",
    "disconnected_at": "2026-10-10T10:00:00Z",
    "delete_after": "2026-11-09T10:00:00Z"
  },
  "providers": ["..."]
}
```

`disconnected` is `null` otherwise, and always after an Outlook or IMAP disconnect, which deletes at once as today.

### `DELETE /api/v1/mail/connection/`

**204**, as today. For Google:
1. If a watch is live, `users.stop`. This is best effort.
2. Revoke the refresh token at `https://oauth2.googleapis.com/revoke`. This is also best effort: a failure is logged, not shown.
3. Wipe `credentials` (set to `""`) and set `status=disconnected`, `disconnected_at=now`. Clear `history_id`, `wake_at`, `lease_until`, `backoff_until`, `watch_expires_at`, `paused_reason` and the import and reconcile tokens.
4. Keep `MailMessage`, `MailLabel` and `MailAttachment`. Filed `customers.Email` rows are untouched (company records).

It is audited as `mailbox.disconnect {provider, address, revoked: bool, delete_after}`. Outlook and IMAP: unchanged (the row is deleted and its copies cascade).

A disconnected Google row answers like "no mailbox" everywhere else:
- `mail/sync/` answers 400 "No mailbox connected.";
- compose and reply answer as they do today without a mailbox;
- `mail/messages/*` keeps listing the kept copies, because the owner may still read them for the 30 days. The Communications sidebar decides whether to offer them.

### `POST /api/v1/mail/sync/`

| Connection | Answer |
|---|---|
| None, or disconnected | 400 `{"detail": "No mailbox connected."}` (unchanged) |
| Google, paused | 409 `{"code": "MAILBOX_PAUSED", "detail": "...", "paused_reason": "workspace_off"}` |
| Google | Sets `wake_at = now`. **202**: the connection payload above plus `"filed": null, "queued": true` |
| Outlook or IMAP | Unchanged: syncs inline, **200**: the connection payload plus `"filed": <n>` |

### Sending through a paused Google mailbox

`POST customers/<id>/emails/send/`, `POST customers/<id>/accounts/<id>/emails/send/`, `POST mail/messages/<id>/reply/`, `POST communications/emails/<id>/reply/` and draft Send answer:

```json
{"code": "MAILBOX_PAUSED", "detail": "Your Gmail connection is paused: your workspace isn't enabled for Gmail.", "paused_reason": "workspace_off"}
```

The status is **409**. This is checked before any provider call, so a draft is never claimed.

## 4. Storage

### `MailboxConnection` gains

| Field | Type | Notes |
|---|---|---|
| `Status.DISCONNECTED` | choice `"disconnected"` | New third status |
| `granted_scopes` | `JSONField(default=list)` | Full scope URLs |
| `history_id` | `PositiveBigIntegerField(null=True)` | Gmail's last applied `historyId`. Null means "initialise on the next tick" |
| `import_after` | `DateTimeField(null=True)` | The 12-month line (lower bound) |
| `import_before` | `DateTimeField(null=True)` | Connect time (upper bound); newer mail comes by history |
| `import_page_token` | `CharField(512, blank=True)` | `""` = start or finished (see `import_done_at`) |
| `import_total_estimate` | `PositiveIntegerField(null=True)` | `messagesTotal` |
| `import_done_at` | `DateTimeField(null=True)` | Set when the last page is stored |
| `reconcile_started_at` | `DateTimeField(null=True)` | A 30-day reconcile is running (decision 19) |
| `reconcile_page_token` | `CharField(512, blank=True)` | |
| `watch_expires_at` | `DateTimeField(null=True)` | From `users.watch` |
| `wake_at` | `DateTimeField(null=True)` | Set by push, Sync now, connect; cleared on claim |
| `lease_until` | `DateTimeField(null=True)` | Decision 18 |
| `backoff_until` | `DateTimeField(null=True)` | |
| `consecutive_failures` | `PositiveSmallIntegerField(default=0)` | Decision 21 |
| `paused_reason` | `CharField(16, choices, blank=True)` | `no_seat suspended workspace_off token_revoked`; `""` ↔ `null` in the API |
| `disconnected_at` | `DateTimeField(null=True)` | Decision 9 |

- **New constraint:** `UniqueConstraint(fields=["provider", "address"], condition=Q(provider="google") & ~Q(status="disconnected"), name="one_live_google_connection_per_address")`.
- **New index:** `(provider, status, wake_at)`.
- `sync_cursor` stays, and only Outlook and IMAP use it from D1 on.
- **Migration:** existing rows get `granted_scopes=[]` and null sync fields. An existing Google row is initialised on its first tick: `history_id` from `getProfile`, and the import is started.

### `MailMessage` gains

| Field | Type | Notes |
|---|---|---|
| `html_body` | `TextField(blank=True)` | Sanitised at store (§6); `""` when there is none or it was too large |
| `cc` | `JSONField(default=list)` | `[[name, address], ...]`, the shape of `to` |
| `bcc` | `JSONField(default=list)` | Same; only ever present on the owner's sent mail and drafts |
| `rfc_message_id` | `CharField(998, blank=True)` | The `Message-ID` header, verbatim. Left blank rather than truncated if it is longer |
| `references` | `TextField(blank=True)` | The `References` header, verbatim |
| `label_ids` | `JSONField(default=list)` | Gmail label ids, all of them (system and user) |
| `has_attachments` | `BooleanField(default=False)` | At least one non-inline attachment part |
| `refreshed_at` | `DateTimeField(null=True)` | Every store or label refresh from Gmail; the reconcile uses it to find deletions |

`provider_message_id` is unchanged, and the upsert key stays `(connection, provider_message_id)`. Microsoft and IMAP rows leave every new field at its default.

### `MailLabel` (new)

| Field | Type | Notes |
|---|---|---|
| `connection` | FK `MailboxConnection`, CASCADE, `related_name="labels"` | |
| `gmail_id` | `CharField(255, blank=True)` | `""` only for a D2 label not yet created in Gmail |
| `name` | `CharField(225)` | Gmail's full name, `/` nesting included |
| `type` | `CharField(8)`: `system`, `user` | |
| `color_background` | `CharField(7, blank=True)` | `#rrggbb` |
| `color_text` | `CharField(7, blank=True)` | |
| `synced_at` | `DateTimeField(auto_now=True)` | |

There is a unique constraint on `(connection, gmail_id)` where `gmail_id` is not blank. It is mirrored from `labels.list` on every Google tick (decision 30).

### `MailAttachment` (new; metadata only in D1)

| Field | Type | Notes |
|---|---|---|
| `message` | FK `MailMessage`, CASCADE, `related_name="attachments"` | |
| `part_id` | `CharField(64)` | The MIME part id. It is stable, and it is what D2 matches on |
| `gmail_attachment_id` | `TextField(blank=True)` | Gmail rotates these between fetches, so D2 re-reads the message and matches on `part_id` |
| `filename` | `CharField(255)` | Sanitised like `customers.Attachment.name` |
| `mime_type` | `CharField(255)` | As Gmail declares it; D2 checks it again on fetch |
| `size` | `PositiveBigIntegerField` | Bytes, `body.size` |
| `content_id` | `CharField(255, blank=True)` | For `cid:` inline images |
| `is_inline` | `BooleanField(default=False)` | `Content-Disposition: inline` with a `Content-ID` |
| `file` | `FileField(blank=True)` | **Empty in D1.** D2 fetches it from Gmail on first open, through the existing attachment storage |

There is a unique constraint on `(message, part_id)`. Inline parts are recorded but do not set `has_attachments`.

### How labels become the folder and flags (Google only)

These rules are applied at every store and every label change:

| Rule | Result |
|---|---|
| `DRAFT` ∈ labels | `folder = drafts` |
| else `TRASH` | `folder = trash` |
| else `SPAM` | `folder = spam` |
| else `SENT`, or the sender is the mailbox's own address | `folder = sent` |
| else | `folder = inbox` |
| `UNREAD` ∈ labels | `is_read = false`, else `true` |
| `STARRED` | `is_starred` |
| `IMPORTANT` | `is_important` |
| none of `INBOX SENT DRAFT SPAM TRASH` | **archived**: `state = done` (unless `muted`) |
| any of them | `state = open` (unless `muted`) |

- **What is new for Gmail.** A message moved back to the Inbox in Gmail reopens: today a `done` row never reopens. And `locally_changed_at` no longer guards Google rows (decision 11).
- **Category** is still decided once, at the first store (`categorise`), and never re-derived.
- **What is never stored:** messages labelled `CHAT`.
- **What is filed** against a customer: only messages whose derived folder is inbox or sent at first store, as today (`FILED_FOLDERS`). A filed `customers.Email` is never deleted or moved by a later label change, trash, spam or Gmail deletion.

## 5. The sync loop (non-HTTP)

### `python manage.py sync_mail`

| Invocation | What it does |
|---|---|
| `sync_mail` | One pass over every live mailbox, ignoring the due rules. Google mailboxes get one tick each. Outlook and IMAP get today's `sync_mailbox`. `--user <email>` narrows it. Paused and disconnected mailboxes are skipped |
| `sync_mail --loop` | Forever: one tick every `MAIL_SYNC_TICK_SECONDS` (5). It exits cleanly on SIGTERM between mailboxes |

### Each loop tick

1. **The gate sweep.** At most once per `MAIL_SYNC_INTERVAL_SECONDS`, in bulk:
   - Recompute `paused_reason` for every Google connection that is neither disconnected nor `token_revoked`.
   - Write each change. It is audited as `mailbox.paused {reason}` or `mailbox.resumed {from}`, with no actor (system) and the workspace as organisation.
   - A resumed mailbox gets `wake_at = now`.
2. **The claim.** In one short transaction, `select_for_update(skip_locked=True)` takes up to `MAIL_SYNC_BATCH` (10) **due** connections, oldest `last_synced_at` first. For each it sets `lease_until = now + MAIL_LEASE_SECONDS` (300), clears `wake_at` and commits.
   - **A Google connection is due when:**
     - its status is `connected`;
     - `paused_reason = ""`;
     - its lease has expired;
     - it is not in backoff (`backoff_until` null or past);
     - and either `wake_at ≤ now`, or `last_synced_at` is null or older than `MAIL_SYNC_INTERVAL_SECONDS` (60).
   - **An Outlook or IMAP connection is due when:** its status is `connected` or `error` (today's job retries errored rows too), and `last_synced_at` is null or older than `MAIL_LEGACY_SYNC_INTERVAL_SECONDS` (600). It then gets today's `sync_mailbox`, unchanged.
3. **Each claimed Google mailbox**, in order:
   1. *(D2: flush the outbox. Not in D1.)*
   2. **Labels.** `labels.list`, mirrored into `MailLabel`.
   3. **Initialise** if `history_id` is null: take `getProfile.historyId`, and start the import if it has neither started nor finished.
   4. **History.** `history.list?startHistoryId=<history_id>&historyTypes=messageAdded&historyTypes=messageDeleted&historyTypes=labelAdded&historyTypes=labelRemoved`, every page:
      - **Added:** `messages.get?format=full` for ids not stored, then store and file (`file_message`) and classify inline, as today.
      - **Deleted:** delete the `MailMessage`. The filed `Email` stays.
      - **Label changes:** set `label_ids` from the event's `message.labelIds` (the last event per message wins) and re-derive. An unknown message is fetched in full and stored.
      - Then `history_id` = the response's `historyId`.
   5. **Reconcile page** if `reconcile_started_at` is set. It lists `q="after:<now−MAIL_RECONCILE_DAYS> -in:chats"`, `includeSpamTrash=true`, 100 per page:
      - unknown ids: get in full and store;
      - known ids: `format=minimal`, refresh `label_ids` and the derived fields, and stamp `refreshed_at`.

      On the last page, delete rows with `sent_at` in the window and `refreshed_at` null or before `reconcile_started_at`, then clear the reconcile fields.
   6. **Import page** if `import_done_at` is null. It lists `q="after:<import_after epoch> before:<import_before epoch> -in:chats"`, `includeSpamTrash=true`, `maxResults=MAIL_IMPORT_PAGE_SIZE` (100), with the page token. Ids already stored are skipped. New ones are fetched in full, stored, and filed, and classified only when within 30 days (decision 17). With no `nextPageToken`, `import_done_at = now`. A `400` invalid page token restarts the import from the first page.
   7. **Watch.** Only when `GMAIL_PUBSUB_TOPIC` is set and `watch_expires_at` is null or within 24 h: `users.watch {topicName}` (all labels), storing `expiration`. A failure is logged without content, push reads `false`, and the watch is retried on the next due tick. It is never a mailbox error.
   8. **Success.** `last_synced_at = now`, `consecutive_failures = 0`, `error = ""`, `backoff_until = null`, `lease_until = null`. The refreshed credentials are stored.

   A tick's work per mailbox is bounded: history until done, at most one reconcile page and at most one import page.

### Recovery and errors

| Gmail says | What happens |
|---|---|
| `history.list` 404 | Take `history_id` from `getProfile` **first**, then start a reconcile (`reconcile_started_at = now`, empty token). The current tick continues |
| `429`, `5xx`, network, `403 rateLimitExceeded` / `userRateLimitExceeded` | Backoff: `consecutive_failures += 1`, `backoff_until = now + min(30 s × 2^(n−1), MAIL_BACKOFF_MAX_SECONDS)` (900), or `Retry-After` if longer. `error` holds the transient reason, `status` stays `connected` and the lease is released. Other mailboxes carry on |
| Token refresh `400 invalid_grant` / `invalid_client`, or `401` after one refresh | `status = error`, `error = "Google access was revoked. Reconnect Google."`, `paused_reason = token_revoked`. Audited as `mailbox.paused {reason: "token_revoked"}`. Sync stops until a reconnect |
| `403 insufficientPermissions` | `status = error`, `error = "Revenact is missing a Gmail permission. Reconnect Google."`, `paused_reason = token_revoked` |
| `messages.get` 404 (gone between list and get) | Skip that id |

No log line or `error` text carries a subject, an address other than the mailbox's own, or a body.

### The nightly prune

`run_health_maintenance` runs `services.mail.prune.prune(organisation)` for each organisation, never fatally (the existing `try/except` pattern). Its `--dry-run` reports the counts without deleting.

The prune deletes `MailboxConnection` rows with `status=disconnected` and `disconnected_at < now − MAIL_DISCONNECT_RETENTION_DAYS`. `MailMessage`, `MailLabel` and `MailAttachment` cascade (D2 also deletes cached files from storage), and `customers.Email.mailbox` is set null as on today's disconnect. Each deletion is audited as `mailbox.pruned {provider, address, messages: n}`.

## 6. The read endpoints

They are **owner-only, as today.** Every route scopes on `owner=request.user` (or on the person's own connection). A manager, view-all holder or Leadership member gets 404 on another person's message and an empty list for labels. They read only filed `customers.Email` rows under `visibility.py`. Labels, cc/bcc, HTML and attachment details never reach them. The portal never sees any of it.

### `GET /api/v1/mail/messages/`

Every row gains:

```json
{
  "cc": [["Ann Lee", "ann@pizzahut.com"]],
  "bcc": [],
  "labels": [{"id": 7, "name": "Renewals", "color": {"background": "#16a766", "text": "#ffffff"}}],
  "has_attachments": true
}
```

- `labels`: this message's **user** labels, resolved through `MailLabel`, sorted by name. `color` is `null` when Gmail gives none. Unknown ids are ignored. The view loads the mailbox's labels in **one** query and passes them to the serializer through context. The page's query count stays at today's ceiling plus one.
- Everything else, the filters included, is unchanged. For Google, `folder`, `is_read`, `is_starred`, `is_important` and `state` follow the label rules in §4.

### `GET /api/v1/mail/messages/<id>/`

The detail gains the row's fields and:

```json
{
  "html_body": "<div style=\"font-family:Arial\"><p>Hi Dana,</p><img src=\"https://cdn.pizzahut.com/sig.png\"></div>",
  "attachments": [
    {"id": 31, "filename": "Renewal quote.pdf", "mime_type": "application/pdf", "size": 182311, "is_inline": false, "content_id": "", "available": false}
  ]
}
```

- `body` (text) is unchanged. `html_body` is `""` when the message has no HTML part, or its sanitised HTML was over `MAIL_HTML_MAX_BYTES`. The frontend then shows `body`.
- `attachments` lists every part, inline ones included, so D2 can resolve `cid:`. `available` is always `false` in D1: there is no download route until D2.
- `rfc_message_id`, `references` and raw `label_ids` are **not** exposed.
- PATCH is unchanged in shape. For Google rows it is still local-only in D1 (decision 11).

**The HTML sanitiser** (`services/mail/html.py`, `nh3.clean`):
- **Tags:** nh3's defaults, plus `style`, `table thead tbody tfoot tr td th caption colgroup col`, `center`, `font` and `span`. `style` is removed from `clean_content_tags` so `<style>` blocks survive. Everything else is stripped, its text kept, including `script`, `iframe`, `object`, `embed`, `form`, `input`, `button`, `svg`, `math`, `link`, `meta` and `base`.
- **Attributes:** `style`, `class`, `align`, `valign`, `width`, `height`, `bgcolor`, `color`, `border`, `cellpadding`, `cellspacing`, `colspan`, `rowspan`, `dir` and `lang` on every tag. Also `href` and `title` on `a`, and `src`, `alt`, `width` and `height` on `img`. Every `on*` handler goes.
- **URL schemes:** `http`, `https`, `mailto` and `cid`. `javascript:`, `data:` and `vbscript:` are dropped. Links get `rel="noopener noreferrer"`.
- **Remote images and CSS `url()` are left in place.** The frontend renders the HTML in an `<iframe sandbox>` with no `allow-scripts` and no `allow-same-origin`, and a CSP of `img-src cid: data:` until the person clicks "Show images". That click re-renders it with `img-src https:`. The server does not proxy or rewrite images in D1.
- **Sanitising happens once, at store.** The raw HTML is never kept.

### `GET /api/v1/mail/messages/summary/`

It gains the connection's progress, so the inbox can show "Importing mail" and paused notices without a second call:

```json
{
  "has_mailbox": true,
  "address": "dana@doughco.com",
  "last_synced_at": "2026-10-10T09:14:05Z",
  "import": {"state": "importing", "imported": 4210, "total_estimate": 18000, "done_at": null},
  "paused_reason": null,
  "folders": {"inbox": 41, "drafts": 2, "sent": 12, "done": 7, "muted": 1},
  "unread": 9,
  "categories": []
}
```

`import` and `paused_reason` are `null` without a live Google mailbox. `has_mailbox` is `false` for a disconnected one.

### `GET /api/v1/mail/labels/` (new)

The caller's own mailbox's **user** labels, ordered by name, not paginated:

```json
[
  {"id": 7, "gmail_id": "Label_12", "name": "Renewals", "color": {"background": "#16a766", "text": "#ffffff"}},
  {"id": 9, "gmail_id": "Label_19", "name": "Vendors/Billing", "color": null}
]
```

It answers `[]` when there is no mailbox, a disconnected one, or a non-Google one.

## 7. The push webhook

### `POST /api/v1/mail/google/push/` (public)

The view is `AllowAny`, `authentication_classes = []`, with throttle `GmailPushThrottle` (per source IP, scope `gmail_push`, `THROTTLE_GMAIL_PUSH`, default `600/min`, `None` under test). As a DRF `APIView` it is already CSRF-exempt at the Django level, and no decorator or middleware change is needed. It builds no URL from input, so it needs no `# nosemgrep`. The existing one on `_redirect_uri` is unchanged.

**Request** (Pub/Sub push, OIDC authentication):

```
Authorization: Bearer <Google-signed OIDC JWT>
Content-Type: application/json

{
  "message": {
    "data": "eyJlbWFpbEFkZHJlc3MiOiJkYW5hQGRvdWdoY28uY29tIiwiaGlzdG9yeUlkIjo5ODc2NTQzfQ==",
    "messageId": "2070443601311540",
    "publishTime": "2026-10-10T09:14:01.123Z"
  },
  "subscription": "projects/revenact/subscriptions/gmail-push"
}
```

`data` is base64 of `{"emailAddress": "dana@doughco.com", "historyId": 9876543}`.

**Verification, in order:**
1. **The body size.** A body over 64 KB answers `413`.
2. **Push configured?** If `GMAIL_PUBSUB_TOPIC` is empty, `404`.
3. **The token.** It needs a bearer token whose RS256 signature verifies against Google's JWKS (`https://www.googleapis.com/oauth2/v3/certs`, through `PyJWKClient`, keys cached for an hour), with all of these:
   - `aud == GMAIL_PUBSUB_AUDIENCE`;
   - `iss` in `{"https://accounts.google.com", "accounts.google.com"}`;
   - `exp` in the future;
   - `email == GMAIL_PUBSUB_SERVICE_ACCOUNT` and `email_verified` true.

**Answers:**

| Status | When |
|---|---|
| 204 | Verified. Always, whatever the body says (decision 27). No body |
| 401 | Token missing, malformed, badly signed, expired, wrong `aud` or `iss`, or the audience or service account setting is empty |
| 403 | Valid Google token, but `email` is not the configured service account |
| 404 | Push not configured |
| 413 | Body too large |
| 429 | Throttled (Pub/Sub retries later) |

401 and 403 are audited as `mailbox.push_rejected {reason}` (anonymous, outcome `failure`). Nothing is logged from `data`.

**What a verified push does:**
- It decodes `data` and lowercases `emailAddress`.
- It runs one `UPDATE` on the live Google connection with that address, `wake_at = COALESCE(wake_at, now)`. That applies only when the connection is not disconnected, not paused, and the pushed `historyId` is greater than its `history_id` (or `history_id` is null).
- Nothing else. It makes no Gmail call and does no sync inline. The loop's next tick (≤ 5 s) does the work.

## 8. Settings, audit events, documents

### New settings (`config/settings.py`, from the environment)

| Setting | Default | Meaning |
|---|---|---|
| `MAIL_SYNC_TICK_SECONDS` | `5` | Loop tick |
| `MAIL_SYNC_INTERVAL_SECONDS` | `60` | Google due interval; gate sweep interval |
| `MAIL_LEGACY_SYNC_INTERVAL_SECONDS` | `600` | Outlook and IMAP interval (today's cadence) |
| `MAIL_SYNC_BATCH` | `10` | Mailboxes claimed per tick |
| `MAIL_LEASE_SECONDS` | `300` | Claim lease |
| `MAIL_BACKOFF_MAX_SECONDS` | `900` | Backoff ceiling |
| `MAIL_IMPORT_MONTHS` | `12` | Import window |
| `MAIL_IMPORT_PAGE_SIZE` | `100` | Import and reconcile page size |
| `MAIL_RECONCILE_DAYS` | `30` | Recovery and reconnect re-list window |
| `MAIL_DISCONNECT_RETENTION_DAYS` | `30` | Personal copies kept after a Google disconnect |
| `MAIL_HTML_MAX_BYTES` | `1000000` | Sanitised HTML ceiling |
| `GMAIL_PUBSUB_TOPIC` | `""` | `projects/<project>/topics/<topic>`; empty = push off |
| `GMAIL_PUBSUB_AUDIENCE` | `""` | The push subscription's OIDC audience (normally the push URL) |
| `GMAIL_PUBSUB_SERVICE_ACCOUNT` | `""` | The push subscription's service-account email |
| `GMAIL_TEST_USER_CAP` | `100` | Shown in the portal |
| `THROTTLE_GMAIL_PUSH` | `600/min` | Webhook rate per source IP |

`GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` and `MAIL_OAUTH_REDIRECT_BASE` are unchanged. `requirements.txt` gains a pinned `nh3`.

### Audit events (`docs/audit-events.md`)

| Action | Where | Actor | Target | Metadata |
|---|---|---|---|---|
| `mailbox.connect` | callback / connect | user | MailboxConnection | provider, address, **scopes, two_way** |
| `mailbox.reconnect` (new) | callback | user | MailboxConnection | provider, address |
| `mailbox.scopes_changed` (new) | callback | user | MailboxConnection | from, to (short scope names) |
| `mailbox.connect_refused` (new) | callback | user | (none) | provider, code, domain; outcome `failure` |
| `mailbox.disconnect` | `MyMailboxView.delete`, callback (replaced row) | user | MailboxConnection | provider, address, **revoked, delete_after** |
| `mailbox.paused` / `mailbox.resumed` (new) | loop gate sweep, token errors | system (none) | MailboxConnection | reason / from |
| `mailbox.pruned` (new) | nightly prune | system (none) | MailboxConnection | provider, address, messages |
| `mailbox.push_rejected` (new) | webhook | anonymous | (none) | reason (`missing`, `invalid`, `audience`, `issuer`, `service_account`, `not_configured_*`); outcome `failure` |
| `platform.organisation.gmail_two_way` (new) | portal | platform staff | Organisation | from, to, reason |

### Documents updated in the D1 backend PR

- `docs/API_CONTRACTS.md`:
  - the `mail` section: the new fields, labels, the webhook, the disconnect retention, and the removal of the "read-only" and "cursor" paragraphs;
  - a new "Connecting a mailbox" subsection for `connection/`, `connect/`, the callback and `sync/` (undocumented until now);
  - the portal table gains `gmail/` and the `gmail` blocks.
- `docs/audit-events.md`: the table above.
- `docs/data-classification.md`: the mailbox row (personal copies stored, HTML sanitised, 30-day retention after disconnect).
- The backend's four product documents, `docs/product/`:
  - `01-prd.md`: what is built;
  - `02-trd.md`: the sync loop, push, the dependency on nh3, the security notes;
  - `05-backend-schema.md`: the fields and models above;
  - `06-implementation-plan.md`: D1 done, D2 and D3 next.
- The frontend's two, in the D1 frontend PR: react-ts-app `docs/03-ui-ux-design.md` and `docs/04-app-flow.md`.

## 9. Outlook and IMAP with the new fields

| Where | Outlook / IMAP value |
|---|---|
| `connection.two_way` | `false` |
| `connection.needs_reconnect` | `false` |
| `connection.granted_scopes` | `[]` |
| `connection.import` | `null` |
| `connection.push` | `false` |
| `connection.paused_reason` | `null` (no gates for them in this round) |
| `providers[].gate` | `null` |
| `disconnected` | `null` (their disconnect deletes at once) |
| `POST mail/sync/` | 200 inline, as today |
| Message rows | `cc: []`, `bcc: []`, `labels: []`, `has_attachments: false`; `to` keeps To + Cc merged |
| Message detail | `html_body: ""`, `attachments: []` |
| Summary | `import: null`, `paused_reason: null` |
| `GET mail/labels/` | `[]` |
| Flags | Today's `locally_changed_at` rule |
| Sync cadence | Every 600 s from the same `--loop` process, through today's `sync_mailbox` |

## 10. Operator steps (revenact-infra, a separate repo)

The compose change ships as its own revenact-infra PR, merged with the D1 backend. The VM is off (subscription disabled), so these are steps for whenever prod comes back.

1. In `deploy/docker-compose.prod.yml`:
   - `mailsync`'s command becomes `python manage.py sync_mail --loop`;
   - a new `ticketsync` service (same image, env and `depends_on`) keeps today's loop for `sync_tickets`, which currently shares `mailsync`'s 600 s sleep.
2. `backend.env` gets:
   - `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` and `MAIL_OAUTH_REDIRECT_BASE`;
   - optionally the three `GMAIL_PUBSUB_*` values.
3. Google Cloud, as in the spec's "Owner prerequisites": the consent screen in Testing with the pilot users added, the Gmail API enabled, and a web OAuth client with the local and prod redirect URIs (`<base>/api/v1/mail/oauth/google/callback/`). Optionally:
   - a Pub/Sub topic with `gmail-api-push@system.gserviceaccount.com` as publisher;
   - a push subscription to `https://<host>/api/v1/mail/google/push/` with OIDC authentication. Its service account becomes `GMAIL_PUBSUB_SERVICE_ACCOUNT` and its audience `GMAIL_PUBSUB_AUDIENCE`.
4. Turn the workspace on in the portal (`POST platform/organisations/<id>/gmail/`).

## 11. Not in D1

- **The outbox and every write-back to Gmail:**
  - read and unread, star, archive, trash, spam and labels;
  - `labels.create`;
  - `batchModify`;
  - failure notices.

  PATCH stays local-only (D2).
- **Conversation (thread) view, the label sidebar and menu, `?label=` filtering, label unread counts, bulk actions and keyboard shortcuts** (D2).
- **Attachment download or preview, and fetching the file from Gmail.** `MailAttachment.file` stays empty and `available` is `false`. The filed record's Files tab shows no mail attachments yet (D2).
- **Drafts both ways:** Gmail drafts are listed read-only in Drafts as today, and Revenact and agent drafts stay Revenact-only (D3).
- **Sending changes** (D3):
  - `threadId`, `In-Reply-To` and `References` for Gmail;
  - Reply all and Forward;
  - CC and BCC on send;
  - attachments on send and the 25 MB limit;
  - the `sendAs` signature;
  - the formatting editor;
  - "Search older mail in Gmail".

  D1 sends exactly as today, except for the paused refusal (§3).
- Any change to Outlook or IMAP sync or connect.
- Calendar scopes (round B).
