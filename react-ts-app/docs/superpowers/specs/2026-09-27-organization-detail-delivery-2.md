# The organisation page, delivery 2: the other tabs as lists

Owner decisions of 2026-09-27. Extends `2026-09-26-organization-detail-design.md` (§4, delivery 2). House rules: `.claude/skills/revenact-design/SKILL.md` §1 and §4. The owner's standing rules apply: app-ready, never spreadsheet-like, no information lost.

## 1. Header
- "+ Add account" moves into the name row, beside Edit and ⋯ (owner request).
- The account chips move above the tabs. They filter Story, People, Deals & risks and Files; the selection (`?account=`) carries across those tabs. The chip row is not rendered on Details and Knowledge (whole-organisation tabs).
- A chip's count follows the active tab: story items (Story), people (People), opportunities + risks (Deals & risks), files + calls (Files).
- With an account selected, "Edit <account>" stays at the end of the chip row.

## 2. People (list, not table)
- One list item per contact: initials, name, role, email (mailto) and phone (tel) links, account tag ("Organization" for organisation-level), status, sentiment, last contacted; ⋯ with Edit and Delete (existing flows).
- A one-line summary replaces the four stat cards: people · decision makers · active · average sentiment.
- Search stays. The dead Filter and Download buttons are removed.

## 3. Deals & risks (list, not table)
- An Opportunities / Risks switch. One list item per record: title, stage, MRR (DM Mono), priority, department, account tag. Selecting an item opens its existing edit flow.
- A one-line summary per switch replaces the stat cards (same figures as today).
- The Board (kanban) view remains an option.
- Add opportunity / Add risk keep their existing flows; with an account selected, the new record is created on that account.

## 4. Files (two sections: Files, Calls)
- Both sections include the organisation's own records and every visible account's, each tagged with its account.
- Files: name (download), size, uploader, date, source, description; delete where allowed today. Uploading while an account is selected attaches to that account.
- Calls: day-grouped plain rows like the Story stream (host, title, duration, sentiment, summary expandable, participants, transcript/recording links). No separate timeline rail, no inner scroll area.

## 5. Surveys page
- `/surveys` gains an organisation filter, kept in the URL (`?customer=<id>`), with a picker.
- The organisation page's Feedback "Manage surveys" link opens `/surveys?customer=<id>`.

## 6. Backend
- Files and calls on an organisation (`/customers/{id}/files/`, `/customers/{id}/calls/`) roll up account-level records under the same rule as the other roll-ups (`customer_rollup_q`: organisation-level plus accounts in `visible_accounts(user)`). Each record carries `account_id` and `account_name`. Creating on the organisation path still creates organisation-level records.
- The survey list (`GET /surveys/`) accepts `?customer=<id>` (organisation-level and its visible accounts' surveys); unknown or invisible ids give an empty list, never an error that confirms existence.
- Contact, opportunity and risk serializers add `account_id` so the chips filter client-side (these lists are unpaginated today).
- Query counts pinned; privacy tests use the "blind to one account" setup.

## 7. States, phones, tests
Every list: designed empty, loading (skeleton) and error-with-retry states; 44px targets below sm; phone layouts rendered conditionally; tokens only; numbers in DM Mono. Tests: unit per list item, integration through the real store and router, a jsdom end-to-end (choose an account, see People/Deals/Files narrow, upload to that account), and the house-rules suite over the new files. The controller's browser check at 1440 and 375, both themes.

## 8. Delivery
Backend PR first (merge and deploy), then frontend PR.
