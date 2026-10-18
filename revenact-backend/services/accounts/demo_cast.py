"""Who the demo people are.

The seed_demo_* seeders are written for Acme's cast (alice, carl, dana, priya,
raj and mei @acme.io). `seed_alfee` (the Alfred workspace) runs the very same seeders with another
cast: inside `using(cast)` every place a seeder names a person goes through
`email()`, `name()` and `password()` here, so the book is identical and only
the people change. Outside `using()` nothing is translated, so `seed_demo`
and every seeder run on its own behave exactly as before.
"""

import contextvars
from contextlib import contextmanager

_cast = contextvars.ContextVar("demo_cast", default=None)


@contextmanager
def using(cast):
    """Seed with `cast`: {"password": str, "people": {acme email: {"email",
    "name"}}, "reports_to": {acme email: acme email or None}} — reports_to
    only for the lines that differ from Acme's chart."""
    token = _cast.set(cast)
    try:
        yield
    finally:
        _cast.reset(token)


def _person(acme_email):
    cast = _cast.get()
    return cast["people"].get(acme_email) if cast else None


def email(acme_email):
    person = _person(acme_email)
    return person["email"] if person else acme_email


def name(acme_email, default):
    person = _person(acme_email)
    return person["name"] if person else default


def password(default):
    cast = _cast.get()
    return cast["password"] if cast else default


def chart(acme_chart):
    """Acme's reporting lines, with the cast's own lines over them, in the
    cast's emails."""
    cast = _cast.get()
    lines = {**acme_chart, **(cast.get("reports_to", {}) if cast else {})}
    return {email(person): (email(boss) if boss else None) for person, boss in lines.items()}
