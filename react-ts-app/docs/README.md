# Revenact product documents

Six reference documents describing Revenact as it exists. Each lives next to the
code it describes: the two frontend ones are here, the other four are in
`revenact-backend/docs/product/`.

| # | Document | Repository | Answers |
|---|---|---|---|
| 1 | [PRD](../../revenact-backend/docs/product/01-prd.md) | backend | Who Revenact is for, what it solves, what is built, what is next |
| 2 | [TRD](../../revenact-backend/docs/product/02-trd.md) | backend | Architecture, stack, security, deployment, non-functional requirements |
| 3 | [UI/UX Design](03-ui-ux-design.md) | **here** | Design system, components, interaction rules, accessibility bar, design debt |
| 4 | [App Flow](04-app-flow.md) | **here** | Every route and user journey, with the files and endpoints involved |
| 5 | [Backend Schema](../../revenact-backend/docs/product/05-backend-schema.md) | backend | Every model, field, relation, constraint and visibility rule |
| 6 | [Implementation Plan](../../revenact-backend/docs/product/06-implementation-plan.md) | backend | The work ahead as bite-sized tasks with tests |

The cross-repository links above assume both repositories are checked out as
siblings, which is how they are developed.

## Before changing the UI

Read `.claude/skills/revenact-design/SKILL.md`. It is the authority on tokens,
fonts, icons and the motion budget, and it routes to the right one of the twenty
vendored design skills. Document 3 is the readable version of that truth plus a
survey of what the code does today, including the eleven-point review checklist
every change must pass.

## Conventions

- Status words: **Built**, **Partial**, **Mock**, **Planned**.
- When a document and the code disagree, the code is right and the document is a
  bug. Fix it in the same pull request.
- `.agents/workflows/repo-architecture.md` is the agent-facing map of this
  repository and is currently stale; see task A2 in the Implementation Plan.

## Design specifications

Surface designs, written before the code. Each carries its own visual.

- [Communications](design/communications.md) — the queue of what is waiting on you. Specification approved 2026-09-18, not yet built.
