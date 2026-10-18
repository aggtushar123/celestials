import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMap, saveMap } from './canvasApi';
import { stubCanvases } from './testCanvases';

describe('stubCanvases POST /canvases/ (Contract note 6)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('a non-positive customer id reads as no id: 400 "choose a record", not 404', async () => {
    stubCanvases();
    await expect(createMap({ name: 'x', start: 'blank', customer: -1 })).rejects.toMatchObject({
      status: 400,
      body: { non_field_errors: ['Choose an organisation or an account.'] },
    });
    await expect(createMap({ name: 'x', start: 'blank', customer: 0 })).rejects.toMatchObject({
      status: 400,
      body: { non_field_errors: ['Choose an organisation or an account.'] },
    });
  });

  it('a non-integer account id truncates like the backend\'s _pk, not a 404', async () => {
    stubCanvases();
    // 12.9 truncates to 12 (Pizza EMEA) — same as Python's int(12.9).
    const made = await createMap({ name: 'x', start: 'blank', account: 12.9 });
    expect(made.record).toEqual({ kind: 'account', id: 12, name: 'Pizza EMEA' });
  });

  it('a non-finite account id reads as no id too', async () => {
    stubCanvases();
    await expect(createMap({ name: 'x', start: 'blank', account: NaN })).rejects.toMatchObject({
      status: 400,
      body: { non_field_errors: ['Choose an organisation or an account.'] },
    });
  });

  it('a valid positive id still creates the map (no regression)', async () => {
    stubCanvases();
    const made = await createMap({ name: 'x', start: 'blank', customer: 7 });
    expect(made.record).toEqual({ kind: 'organization', id: 7, name: 'Pizza Hut' });
  });
});

describe('stubCanvases mirrors canvas.py and canvas_views.py', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lays out a map made from people with c<contact id> node ids, as layout() does', async () => {
    stubCanvases();
    const made = await createMap({ name: 'x', start: 'people', customer: 7 });
    expect(made.nodes.length).toBeGreaterThan(0);
    expect(made.nodes.every((n) => n.id === `c${n.data.contact_id}`)).toBe(true);
  });

  it('refuses a missing version (400) before looking the map up (404)', async () => {
    stubCanvases();
    const noVersion = { name: 'x', nodes: [], edges: [] } as unknown as Parameters<typeof saveMap>[1];
    await expect(saveMap(304, noVersion)).rejects.toMatchObject({ status: 400, body: { version: ['Send the version you loaded.'] } });
    await expect(saveMap(9999, noVersion)).rejects.toMatchObject({ status: 400 });
    await expect(saveMap(9999, { name: 'x', nodes: [], edges: [], version: 1 })).rejects.toMatchObject({ status: 404 });
  });

  it('measures the name after trimming, as clean_name does', async () => {
    stubCanvases();
    const long = `${'a'.repeat(120)} `;
    const made = await createMap({ name: long, start: 'blank', customer: 7 });
    expect(made.name).toBe('a'.repeat(120));
    const saved = await saveMap(made.id, { name: long, nodes: [], edges: [], version: made.version });
    expect(saved.name).toBe('a'.repeat(120));
    await expect(saveMap(made.id, { name: 'a'.repeat(121), nodes: [], edges: [], version: saved.version })).rejects.toMatchObject({ status: 400 });
  });
});
