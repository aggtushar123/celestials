"""Binding an OAuth round trip to the browser that started it (agent
bundles D3 contract §5.4, D3-22; the mail callback's rule, Gmail D1
decision 33). The start sets an HttpOnly cookie holding a random nonce and
puts its SHA-256 in the signed state; the callback is trusted only when
the cookie's hash matches, so a forwarded link connects nothing. Over
https the `__Host-` name (Secure, Path=/, no Domain: a sibling subdomain
cannot plant one); plain-http development keeps the unprefixed name,
scoped to the callback's path."""

import hashlib
import hmac
import secrets


def digest(nonce):
    """What the state carries: a hash, so the authorize URL never holds the cookie."""
    return hashlib.sha256(nonce.encode()).hexdigest()


def cookie_for(request, name, path):
    """(cookie name, path) for this request's scheme."""
    if request.is_secure():
        return f"__Host-{name}", "/"
    return name, path


def bind(response, request, *, name, path, max_age):
    """Set a fresh nonce on `response`; return the digest the state must carry."""
    nonce = secrets.token_urlsafe(32)
    cookie, cookie_path = cookie_for(request, name, path)
    # SOC2:AUTH-01 the callback finishes only in this browser
    response.set_cookie(
        cookie,
        nonce,
        max_age=max_age,
        path=cookie_path,
        secure=request.is_secure(),
        httponly=True,
        samesite="Lax",
    )
    return digest(nonce)


def same_browser(request, state, *, name, path):
    """True when this request's cookie hashes to the digest the signed state carries."""
    cookie, _ = cookie_for(request, name, path)
    nonce = request.COOKIES.get(cookie, "")
    expected = state.get("browser") if isinstance(state, dict) else None
    if not nonce or not isinstance(expected, str):
        return False
    return hmac.compare_digest(digest(nonce), expected)


def forget(response, request, *, name, path):
    """Clear the cookie on `response`; every callback answer does this."""
    cookie, cookie_path = cookie_for(request, name, path)
    response.delete_cookie(cookie, path=cookie_path, samesite="Lax")
