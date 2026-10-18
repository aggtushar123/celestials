import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { typingIn, useMailKeys } from './useMailKeys';

// Unit tier: the keys and when they stay out of the way (Decision 8).

describe('typingIn', () => {
  it('is true in fields, editable text, dialogs, menus, the mail frame and the composer', () => {
    document.body.innerHTML =
      '<input id="i"><textarea id="t"></textarea><select id="s"></select><div contenteditable="true"><span id="c">x</span></div><div role="dialog"><button id="d">x</button></div><ul role="menu"><li id="m">x</li></ul><iframe id="f"></iframe><button id="b">x</button><div data-mail-composer><button id="w">x</button></div>';
    for (const id of ['i', 't', 's', 'c', 'd', 'm', 'f', 'w']) expect(typingIn(document.getElementById(id)), id).toBe(true);
    expect(typingIn(document.getElementById('b'))).toBe(false);
    expect(typingIn(null)).toBe(false);
  });

  it('is false on a ticked row\'s checkbox or radio, so the keys keep working', () => {
    document.body.innerHTML = '<input id="x" type="checkbox"><input id="r" type="radio"><input id="t" type="text">';
    expect(typingIn(document.getElementById('x'))).toBe(false);
    expect(typingIn(document.getElementById('r'))).toBe(false);
    expect(typingIn(document.getElementById('t'))).toBe(true);
  });
});

describe('useMailKeys', () => {
  it('maps e, j, #, r, k, a, c and f inside the mailbox, and nothing else', async () => {
    document.body.innerHTML = '<section id="mailbox"><button id="row">Row</button><input id="field"></section><button id="outside">x</button>';
    const scope = { current: document.getElementById('mailbox') };
    const onKey = vi.fn();
    renderHook(() => useMailKeys(scope, onKey));
    document.getElementById('row')!.focus();
    await userEvent.keyboard('ej#rkxacf');
    expect(onKey.mock.calls.map(([key]) => key)).toEqual(['archive', 'next', 'delete', 'reply', 'previous', 'replyAll', 'compose', 'forward']);
  });

  it('stays out of the way with a modifier, in a field, and outside the mailbox', async () => {
    document.body.innerHTML = '<section id="mailbox"><button id="row">Row</button><input id="field"></section><button id="outside">x</button>';
    const scope = { current: document.getElementById('mailbox') };
    const onKey = vi.fn();
    renderHook(() => useMailKeys(scope, onKey));
    document.getElementById('row')!.focus();
    await userEvent.keyboard('{Control>}e{/Control}');
    document.getElementById('field')!.focus();
    await userEvent.keyboard('e');
    document.getElementById('outside')!.focus();
    await userEvent.keyboard('e');
    expect(onKey).not.toHaveBeenCalled();
  });

  it('acts from the page body', async () => {
    document.body.innerHTML = '<section id="mailbox"></section>';
    const scope = { current: document.getElementById('mailbox') };
    const onKey = vi.fn();
    renderHook(() => useMailKeys(scope, onKey));
    (document.activeElement as HTMLElement | null)?.blur();
    await userEvent.keyboard('j');
    expect(onKey).toHaveBeenCalledWith('next');
  });
});
