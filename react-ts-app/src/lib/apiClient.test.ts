import { describe, it, expect, beforeEach, vi } from 'vitest';
import { API_ORIGIN, apiFetch, apiFetchBlob, apiUpload, ApiError, endSession, SessionChangedError, setAuthHooks } from './apiClient';

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

describe('apiFetch', () => {
  let refreshAccessToken: ReturnType<typeof vi.fn<() => Promise<string | null>>>;
  let onAuthFailure: ReturnType<typeof vi.fn<() => void>>;

  beforeEach(() => {
    vi.unstubAllGlobals();
    refreshAccessToken = vi.fn<() => Promise<string | null>>();
    onAuthFailure = vi.fn<() => void>();
    setAuthHooks({
      getAccessToken: () => 'stale.access.jwt',
      refreshAccessToken,
      onAuthFailure,
    });
  });

  it('attaches the access token from auth hooks automatically', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch('/some/protected/');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer stale.access.jwt' }) })
    );
  });

  it('an explicit accessToken option overrides the auto-attached one', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch('/some/path/', { accessToken: 'explicit.jwt' });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer explicit.jwt' }) })
    );
  });

  it('sends cookies cross-origin only when a call asks for credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch('/plain/');
    await apiFetch('/mail/connect/google/', { method: 'POST', body: {}, credentials: 'include' });

    expect(fetchMock.mock.calls[0][1]).not.toHaveProperty('credentials');
    expect(fetchMock.mock.calls[1][1]).toEqual(expect.objectContaining({ method: 'POST', credentials: 'include' }));
  });

  it('keeps credentials on the retry after a refresh', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { detail: 'expired' }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    refreshAccessToken.mockResolvedValue('fresh.access.jwt');

    await apiFetch('/mail/connect/google/', { method: 'POST', body: {}, credentials: 'include' });

    expect(fetchMock.mock.calls[1][1]).toEqual(expect.objectContaining({ credentials: 'include' }));
  });

  it('on 401, refreshes and retries once with the new token', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { detail: 'expired' }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    refreshAccessToken.mockResolvedValue('fresh.access.jwt');

    const result = await apiFetch('/some/protected/');

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer fresh.access.jwt' }) })
    );
    expect(onAuthFailure).not.toHaveBeenCalled();
  });

  it('on 401 with no successful refresh, gives up and forces logout', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(401, { detail: 'expired' })));
    refreshAccessToken.mockResolvedValue(null);

    await expect(apiFetch('/some/protected/')).rejects.toThrow(ApiError);
    expect(onAuthFailure).toHaveBeenCalledOnce();
  });

  it('on 401 when the retried request also 401s, forces logout', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(401, { detail: 'still expired' })));
    refreshAccessToken.mockResolvedValue('fresh.access.jwt');

    await expect(apiFetch('/some/protected/')).rejects.toThrow('still expired');
    expect(onAuthFailure).toHaveBeenCalledOnce();
  });

  it('skipAuthRetry prevents any refresh attempt, even on 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(401, { detail: 'bad credentials' })));

    await expect(apiFetch('/auth/login/', { skipAuthRetry: true })).rejects.toThrow('bad credentials');
    expect(refreshAccessToken).not.toHaveBeenCalled();
    expect(onAuthFailure).not.toHaveBeenCalled();
  });
});

describe('apiFetch error messages', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    setAuthHooks({
      getAccessToken: () => 'access.jwt',
      refreshAccessToken: async () => null,
      onAuthFailure: () => {},
    });
  });

  async function messageFor(body: unknown, status = 400) {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(status, body)));
    try {
      await apiFetch('/anything/');
      throw new Error('expected apiFetch to reject');
    } catch (err) {
      return (err as ApiError).message;
    }
  }

  it('reads DRF\'s {"detail": "..."} shape', async () => {
    expect(await messageFor({ detail: 'Not found.' }, 404)).toBe('Not found.');
  });

  it('reads a field-level {"field": ["..."]} shape', async () => {
    expect(await messageFor({ email: ['A user with this email already exists.'] })).toBe(
      'A user with this email already exists.'
    );
  });

  it('reads a serializer-level {"non_field_errors": ["..."]} shape', async () => {
    expect(await messageFor({ non_field_errors: ['This is the only person who can manage users.'] })).toBe(
      'This is the only person who can manage users.'
    );
  });

  it('reads a bare ["..."] array, which a view-body ValidationError produces', async () => {
    // Without this case these surfaced as the useless "Request failed
    // (400)" — exactly what a user sees when a guardrail refuses them.
    expect(await messageFor(['Move the people holding this role onto another one first.'])).toBe(
      'Move the people holding this role onto another one first.'
    );
  });

  it('falls back to a status message when the body has nothing readable', async () => {
    expect(await messageFor({ weird: { nested: true } }, 500)).toBe('Request failed (500)');
  });
});

describe('a session that ends while a request is out', () => {
  const never = () => undefined;
  beforeEach(() => {
    vi.unstubAllGlobals();
    setAuthHooks({ getAccessToken: () => 'jwt', refreshAccessToken: vi.fn<() => Promise<string | null>>(), onAuthFailure: never });
  });

  /** A fetch that answers only when the test lets it. */
  function held() {
    let answer: (r: unknown) => void = never;
    const fetchMock = vi.fn(() => new Promise((resolve) => (answer = resolve)));
    vi.stubGlobal('fetch', fetchMock);
    return { fetchMock, answer: (r: unknown) => answer(r) };
  }

  it('drops an answer that lands after the session ended', async () => {
    const pending = held();
    const call = apiFetch('/customers/');
    const outcome = call.then(
      (v) => ({ v }),
      (e: unknown) => ({ e }),
    );
    endSession();
    pending.answer(jsonResponse(200, { name: 'the last person' }));
    expect(await outcome).toEqual({ e: expect.any(SessionChangedError) });
  });

  it('drops a file download the same way', async () => {
    const pending = held();
    const outcome = apiFetchBlob('/files/1/download/').then(
      (v) => ({ v }),
      (e: unknown) => ({ e }),
    );
    endSession();
    pending.answer({ ok: true, status: 200, blob: async () => new Blob(['x']) });
    expect(await outcome).toEqual({ e: expect.any(SessionChangedError) });
  });

  it('leaves a request that started after the session change alone', async () => {
    endSession();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { ok: true })));
    await expect(apiFetch('/customers/')).resolves.toEqual({ ok: true });
  });

  it('drops the retried answer when the session ended during the refresh', async () => {
    const refresh = vi.fn<() => Promise<string | null>>(async () => {
      endSession();
      return 'fresh';
    });
    setAuthHooks({ getAccessToken: () => 'jwt', refreshAccessToken: refresh, onAuthFailure: never });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse(401, {})).mockResolvedValueOnce(jsonResponse(200, { ok: true })));
    await expect(apiFetch('/customers/')).rejects.toBeInstanceOf(SessionChangedError);
  });

  it('still refreshes and retries when nothing else changed', async () => {
    const refresh = vi.fn<() => Promise<string | null>>().mockResolvedValue('fresh');
    setAuthHooks({ getAccessToken: () => 'jwt', refreshAccessToken: refresh, onAuthFailure: never });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse(401, {})).mockResolvedValueOnce(jsonResponse(200, { ok: true })));
    await expect(apiFetch('/customers/')).resolves.toEqual({ ok: true });
  });

  it('keeps the 401 when the failed refresh is itself what ended the session', async () => {
    let failure = 0;
    setAuthHooks({
      getAccessToken: () => 'jwt',
      refreshAccessToken: async () => null,
      onAuthFailure: () => {
        failure += 1;
        endSession();
      },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(401, { detail: 'expired' })));
    await expect(apiFetch('/customers/')).rejects.toMatchObject({ status: 401 });
    expect(failure).toBe(1);
  });
});

describe('errorMessage', () => {
  it('shows nothing for a dropped answer, the server words for an ApiError, the fallback otherwise', async () => {
    const { errorMessage } = await import('../components/organizations/portfolio/usePagedRead');
    expect(errorMessage(new SessionChangedError(), 'Could not load.')).toBe('');
    expect(errorMessage(new ApiError(400, null, 'Bad.'), 'Could not load.')).toBe('Bad.');
    expect(errorMessage(new Error('x'), 'Could not load.')).toBe('Could not load.');
  });
});

describe('server-given paths (D2 Decision 11)', () => {
  it('prefixes a /api/v1/ download_url once, not twice', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, blob: async () => new Blob(['x']) });
    vi.stubGlobal('fetch', fetchMock);
    await apiFetchBlob('/api/v1/files/7/download/');
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_ORIGIN}/api/v1/files/7/download/`);
    await apiFetchBlob('/files/7/download/');
    expect(fetchMock.mock.calls[1][0]).toBe(`${API_ORIGIN}/api/v1/files/7/download/`);
    vi.unstubAllGlobals();
  });
});

describe('apiUpload (two-way Gmail D3, Decision 9)', () => {
  class Xhr {
    static last: Xhr | null = null;
    static answers: { status: number; body: unknown }[] = [];
    status = 0;
    responseText = '';
    headers: Record<string, string> = {};
    url = '';
    upload: { onprogress: ((event: ProgressEvent) => void) | null } = { onprogress: null };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    open(_method: string, url: string) {
      this.url = url;
      Xhr.last = this;
    }
    setRequestHeader(name: string, value: string) {
      this.headers[name] = value;
    }
    send() {
      const answer = Xhr.answers.shift() ?? { status: 201, body: { ok: true } };
      queueMicrotask(() => {
        this.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 } as ProgressEvent);
        this.status = answer.status;
        this.responseText = JSON.stringify(answer.body);
        this.onload?.();
      });
    }
  }

  beforeEach(() => {
    vi.unstubAllGlobals();
    Xhr.answers = [];
    vi.stubGlobal('XMLHttpRequest', Xhr);
  });

  it('posts the form with the token, reports progress and returns the body', async () => {
    setAuthHooks({ getAccessToken: () => 'a.jwt', refreshAccessToken: vi.fn(), onAuthFailure: vi.fn() });
    const progress: number[] = [];
    const body = await apiUpload<{ ok: boolean }>('/mail/drafts/55/attachments/', new FormData(), (f) => progress.push(f));
    expect(body).toEqual({ ok: true });
    expect(Xhr.last?.url).toBe(`${API_ORIGIN}/api/v1/mail/drafts/55/attachments/`);
    expect(Xhr.last?.headers.Authorization).toBe('Bearer a.jwt');
    expect(progress).toEqual([0.5]);
  });

  it('throws the server words as an ApiError', async () => {
    setAuthHooks({ getAccessToken: () => 'a.jwt', refreshAccessToken: vi.fn(), onAuthFailure: vi.fn() });
    Xhr.answers = [{ status: 413, body: { code: 'DRAFT_TOO_LARGE', detail: 'Attachments are limited to 25 MB in total.' } }];
    await expect(apiUpload('/mail/drafts/55/attachments/', new FormData())).rejects.toMatchObject({ status: 413, message: 'Attachments are limited to 25 MB in total.' });
  });

  it('refreshes once on 401 and retries with the new token', async () => {
    const refreshAccessToken = vi.fn(async () => 'fresh.jwt');
    setAuthHooks({ getAccessToken: () => 'stale.jwt', refreshAccessToken, onAuthFailure: vi.fn() });
    Xhr.answers = [{ status: 401, body: { detail: 'expired' } }, { status: 201, body: { ok: true } }];
    await expect(apiUpload('/mail/drafts/55/attachments/', new FormData())).resolves.toEqual({ ok: true });
    expect(Xhr.last?.headers.Authorization).toBe('Bearer fresh.jwt');
  });
});
