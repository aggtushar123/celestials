"""Agentic retrieval: tools the Copilot model may call while answering.

The plain Copilot send (views.SendMessageView, no Ask surface) starts with
the same pre-grounded summary as before (context.build_grounding), so an
answer is never worse than single-shot. With Gemini it may then call
`search_records` — up to MAX_TOOL_ROUNDS times, for other companies or
other angles — when the summary does not hold what the question needs
(anthropic_client.get_completion's tool loop).

Privacy is the existing rule, not a new one (context.py's docstring):
which company a question is about is matched across the whole workspace,
but records are read only through retrieval.retrieve_with_sources, which
returns nothing on a company the asker may not open and only records that
pass their own visibility rule. A company the asker cannot open answers
with who is responsible for it (workspace-wide knowledge) and no content.
Every record a search returns is added to the reply's `sources`, which is
what a shared conversation's other readers are checked against per source
(SOC2:AUTH-02), so a tool can never put a record in front of a reader that
the stored reply would not already have been checked for."""

from services.customers.models import Account, Customer

from .context import _responsible_line
from .embeddings import rank_by_similarity
from .retrieval import (
    _company_profile_text,
    find_mentioned_company,
    find_relevant_company_semantic,
    retrieve_with_sources,
)

#: Model turns that may call tools before the model must answer.
MAX_TOOL_ROUNDS = 3
#: Records one search returns, across the companies it covers.
RESULTS_PER_SEARCH = 6
#: Companies a search without a company name looks across.
COMPANIES_PER_OPEN_SEARCH = 3
MAX_QUERY_LENGTH = 300

TOOL_GUIDANCE = (
    "\n\nAnswer straight from the real-data summary when it already holds the answer "
    "(counts, owners, health, renewals, ARR of the asker's customers): call no tool then. "
    f"You have at most {MAX_TOOL_ROUNDS} rounds of lookups for a question, so go straight "
    "to the path or search you need. Never state a figure for a company the asker may not "
    "read, and never estimate one."
    "\n\nYou can call browse_knowledge to read the company's knowledge, kept as an "
    "Open Knowledge Format bundle: what each metric means and how it is computed, "
    "each customer's profile and who answers for it, and what colleagues have written "
    "down. Start with an empty path for the top index, then follow the paths it "
    "lists; read an index before opening the concepts in it."
    "\n\nYou can call search_records to read more of the customer records the asker "
    "may see — emails, tickets, notes, activities and calls — when the summary above "
    "does not hold what the question needs. Search with a short, specific query, and "
    "name the company when you know it. Use only what the summary and the searches "
    "returned; if a search finds nothing, say so rather than guessing. When a search "
    "says the asker may not read a company's records, do not say it has none: say "
    "the asker doesn't have access to that company's records and name who to ask."
)


class RecordSearch:
    """`search_records(query, company?)` for one asker and one send. Collects
    every record it returns into `sources`, starting from the grounding's own,
    deduplicated, so the stored reply cites everything the model saw."""

    name = "search_records"
    description = (
        "Search the customer records the asker may see (emails, tickets, notes, "
        "activities, calls) by meaning. Returns the best-matching records, each with "
        "its company. Give `company` to search one company; leave it out to search "
        "the companies the query is most about."
    )
    parameters = {
        "query": "What to look for, in a few words.",
        "company": "Optional: the customer or account name to search within.",
    }
    required = ["query"]

    def __init__(self, organisation, user, sources=None):
        self.organisation = organisation
        self.user = user
        self.sources = list(sources or [])
        self._seen = {self._key(source) for source in self.sources}
        self.calls = 0

    @staticmethod
    def _key(source) -> tuple:
        return (source.get("type"), source.get("id"))

    def add_source(self, source) -> None:
        """Record one source on the reply, once (shared with KnowledgeBrowser)."""
        key = self._key(source)
        if key not in self._seen:
            self._seen.add(key)
            self.sources.append(source)

    def _companies(self):
        # Matching is workspace-wide (context.py); reading is not (below).
        customers = Customer.objects.filter(organisation=self.organisation, is_archived=False)
        accounts = Account.objects.filter(customers__organisation=self.organisation).distinct()
        return list(customers), list(accounts)

    def _targets(self, query: str, company_name: str):
        customers, accounts = self._companies()
        if company_name:
            named = find_mentioned_company(company_name, customers, accounts)
            if named is None:
                named = find_relevant_company_semantic(company_name, customers, accounts)
            return [named] if named is not None else []
        companies = [*customers, *accounts]
        if not companies:
            return []
        ranked = rank_by_similarity(
            query, [_company_profile_text(c) for c in companies], organisation=self.organisation
        )
        return [companies[index] for index, _ in ranked[:COMPANIES_PER_OPEN_SEARCH]]

    def __call__(self, args: dict) -> dict:
        self.calls += 1
        query = str(args.get("query") or "").strip()[:MAX_QUERY_LENGTH]
        company_name = str(args.get("company") or "").strip()[:MAX_QUERY_LENGTH]
        if not query:
            return {"results": [], "note": "Give a query to search for."}

        targets = self._targets(query, company_name)
        if not targets:
            return {"results": [], "note": f"No company matches {company_name!r}."}

        per_company = max(2, RESULTS_PER_SEARCH // len(targets))
        results, notes = [], []
        for company in targets:
            # SOC2:AUTH-02 only records the asker may open (retrieve_with_sources)
            items = retrieve_with_sources(company, limit=per_company, query=query, viewer=self.user)
            for item in items:
                results.append({"company": company.name, "record": item.line})
                self.add_source(item.source)
            if not items:
                responsible = _responsible_line(company)
                notes.append(
                    f"The asker may not read {company.name}'s records (that is not the "
                    "same as there being none)." + (f" {responsible}." if responsible else "")
                )
        reply = {"results": results[:RESULTS_PER_SEARCH]}
        if notes:
            reply["note"] = " ".join(notes)
        return reply


#: Characters of one concept or index returned to the model.
MAX_KNOWLEDGE_CHARS = 6000


class KnowledgeBrowser:
    """`browse_knowledge(path?)` over the asker's own copy of the workspace's
    Open Knowledge Format bundle (services/knowledge/okf.py), walked the way
    OKF intends (§8, progressive disclosure): the root `index.md`, then a
    directory's index, then a concept.

    The copy is built for this asker, once per send: customers they may open
    and notes passing visible_contributions only, and metric definitions and
    computations without values (figures stay on the Brain, under its own
    sharing rule). Everything a page shows is recorded on the reply through
    `search.add_source` (customer profiles carry their company, notes are
    contributions), so a shared conversation's other readers are checked
    against it per source, failing closed (SOC2:AUTH-02)."""

    name = "browse_knowledge"
    description = (
        "Read the company's knowledge bundle (Open Knowledge Format). An empty path "
        "returns the top index; a directory such as 'customers/' returns its index; a "
        "file such as 'metrics/active_arr.md' returns that concept."
    )
    parameters = {"path": "Path in the bundle: empty for the top, a directory, or a .md file."}
    required = []

    def __init__(self, organisation, user, search: RecordSearch):
        self.organisation = organisation
        self.user = user
        self.search = search
        self._bundle = None
        self.calls = 0

    def _files(self):
        if self._bundle is None:
            from services.knowledge.okf import Bundle

            self._bundle = Bundle(self.organisation, self.user, values=False)
            self._bundle.build()
        return self._bundle

    @staticmethod
    def _normalise(path: str) -> str | None:
        path = (path or "").strip().replace("\\", "/").lstrip("/")
        while path.startswith("./"):
            path = path[2:]
        if ".." in path.split("/"):
            return None
        return path

    def __call__(self, args: dict) -> dict:
        self.calls += 1
        bundle = self._files()
        files = bundle.files
        path = self._normalise(str(args.get("path") or ""))
        if path is None:
            return {"error": "Paths stay inside the bundle."}
        candidates = (
            [path]
            if path.endswith(".md")
            else [f"{path.rstrip('/')}/index.md" if path else "index.md"]
        )
        found = next((c for c in candidates if c in files), None)
        if found is None:
            return {
                "error": f"Nothing at {path!r}.",
                "top": "Read the empty path for the top index and follow its paths.",
            }
        for source in bundle.sources_by_path.get(found, []):
            self.search.add_source(source)
        content = files[found]
        if len(content) > MAX_KNOWLEDGE_CHARS:
            content = content[:MAX_KNOWLEDGE_CHARS] + "\n\n[truncated]"
        return {"path": found, "content": content}
