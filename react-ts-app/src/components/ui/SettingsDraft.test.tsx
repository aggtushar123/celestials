import { describe, expect, it, vi } from 'vitest';
import { useState, type ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Link, Route, Routes } from 'react-router-dom';
import { SettingsDraftScope } from './SettingsDraft';
import { SettingsFrame } from './SettingsFrame';
import { DRAFT, useSettingsDraft, useSettingsDraftSave } from './settingsDraftContext';

function Field({ name, save }: { name: string; save: (value: string) => Promise<boolean> }) {
  const [saved, setSaved] = useState('a');
  const [value, setValue] = useState('a');
  useSettingsDraft({
    dirty: value !== saved,
    saving: false,
    save: async () => {
      const ok = await save(value);
      if (ok) setSaved(value);
      return ok;
    },
    discard: () => setValue(saved),
  });
  return <input aria-label={name} value={value} onChange={(event) => setValue(event.target.value)} />;
}

function page(saveOne = vi.fn().mockResolvedValue(true), saveTwo = vi.fn().mockResolvedValue(true)) {
  render(
    <MemoryRouter initialEntries={['/settings/work/tasks']}>
      <Routes>
        <Route
          path="/settings/work/tasks"
          element={
            <SettingsDraftScope>
              <Field name="One" save={saveOne} />
              <Field name="Two" save={saveTwo} />
              <Link to="/settings/general">General</Link>
            </SettingsDraftScope>
          }
        />
        <Route path="/settings/general" element={<p>General page</p>} />
      </Routes>
    </MemoryRouter>,
  );
  return { saveOne, saveTwo };
}

describe('SettingsDraftScope (settings production spec §5.4)', () => {
  it('shows no bar until something is edited', () => {
    page();
    expect(screen.queryByRole('button', { name: DRAFT.SAVE })).toBeNull();
  });

  it('saves every edited section with one Save, then says so', async () => {
    const { saveOne, saveTwo } = page();
    await userEvent.type(screen.getByLabelText('One'), 'b');
    await userEvent.type(screen.getByLabelText('Two'), 'c');
    expect(screen.getByText(DRAFT.UNSAVED)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: DRAFT.SAVE }));
    expect(saveOne).toHaveBeenCalledWith('ab');
    expect(saveTwo).toHaveBeenCalledWith('ac');
    await waitFor(() => expect(screen.queryByRole('button', { name: DRAFT.SAVE })).toBeNull());
    expect(screen.getByRole('status')).toHaveTextContent(DRAFT.SAVED);
  });

  it('keeps the bar while a section is refused, and saves only what is still edited next time', async () => {
    const saveTwo = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
    const { saveOne } = page(undefined, saveTwo);
    await userEvent.type(screen.getByLabelText('One'), 'b');
    await userEvent.type(screen.getByLabelText('Two'), 'c');
    await userEvent.click(screen.getByRole('button', { name: DRAFT.SAVE }));
    await waitFor(() => expect(saveTwo).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: DRAFT.SAVE })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: DRAFT.SAVE }));
    await waitFor(() => expect(saveTwo).toHaveBeenCalledTimes(2));
    expect(saveOne).toHaveBeenCalledTimes(1);
  });

  it('discards every edit', async () => {
    page();
    await userEvent.type(screen.getByLabelText('One'), 'b');
    await userEvent.click(screen.getByRole('button', { name: DRAFT.DISCARD }));
    expect(screen.getByLabelText('One')).toHaveValue('a');
    expect(screen.queryByRole('button', { name: DRAFT.SAVE })).toBeNull();
  });

  it('asks before an in-app link leaves unsaved edits, and leaves on Leave', async () => {
    page();
    await userEvent.type(screen.getByLabelText('One'), 'b');
    await userEvent.click(screen.getByRole('link', { name: 'General' }));
    expect(screen.getByRole('dialog', { name: 'Leave without saving?' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Leave' }));
    expect(await screen.findByText('General page')).toBeInTheDocument();
  });
  it('recovers when a section save rejects, and Save works again', async () => {
    const saveOne = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue(true);
    page(saveOne);
    await userEvent.type(screen.getByLabelText('One'), 'b');
    await userEvent.click(screen.getByRole('button', { name: DRAFT.SAVE }));
    await waitFor(() => expect(saveOne).toHaveBeenCalledTimes(1));
    const save = await screen.findByRole('button', { name: DRAFT.SAVE });
    expect(screen.getByText(DRAFT.UNSAVED)).toBeInTheDocument();
    await userEvent.click(save);
    await waitFor(() => expect(saveOne).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('button', { name: DRAFT.SAVE })).toBeNull());
  });

  it('ignores Discard while a save is running', async () => {
    let finish: (ok: boolean) => void = () => {};
    const saveOne = vi.fn().mockReturnValue(new Promise<boolean>((resolve) => (finish = resolve)));
    page(saveOne);
    await userEvent.type(screen.getByLabelText('One'), 'b');
    await userEvent.click(screen.getByRole('button', { name: DRAFT.SAVE }));
    await userEvent.click(screen.getByRole('button', { name: DRAFT.DISCARD }));
    expect(screen.getByLabelText('One')).toHaveValue('ab');
    finish(true);
    await waitFor(() => expect(screen.queryByRole('button', { name: DRAFT.SAVE })).toBeNull());
  });

  it('hides the bar when the edited section unmounts', async () => {
    function Toggle({ children }: { children: ReactNode }) {
      const [on, setOn] = useState(true);
      return (
        <>
          <button onClick={() => setOn(false)}>Remove</button>
          {on ? children : null}
        </>
      );
    }
    render(
      <MemoryRouter>
        <SettingsDraftScope>
          <Toggle>
            <Field name="One" save={vi.fn().mockResolvedValue(true)} />
          </Toggle>
        </SettingsDraftScope>
      </MemoryRouter>,
    );
    await userEvent.type(screen.getByLabelText('One'), 'b');
    expect(screen.getByRole('button', { name: DRAFT.SAVE })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.queryByRole('button', { name: DRAFT.SAVE })).toBeNull();
  });

  it('keeps the edit and stays put on Stay', async () => {
    page();
    await userEvent.type(screen.getByLabelText('One'), 'b');
    await userEvent.click(screen.getByRole('link', { name: 'General' }));
    await userEvent.click(screen.getByRole('button', { name: /stay|cancel/i }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText('General page')).toBeNull();
    expect(screen.getByLabelText('One')).toHaveValue('ab');
  });

  describe('Enter in a field, inside a SettingsFrame (spec §5.4)', () => {
    function BarForm({ children }: { children: ReactNode }) {
      const saveAll = useSettingsDraftSave();
      return (
        <form
          aria-label="Bar form"
          onSubmit={(event) => {
            event.preventDefault();
            void saveAll();
          }}
        >
          {children}
        </form>
      );
    }

    it('saves every edited section through the bar from a form with several fields and no button', async () => {
      const saveOne = vi.fn().mockResolvedValue(true);
      const saveTwo = vi.fn().mockResolvedValue(true);
      render(
        <MemoryRouter>
          <SettingsFrame title="Work">
            <BarForm>
              <Field name="One" save={saveOne} />
              <Field name="Two" save={saveTwo} />
            </BarForm>
          </SettingsFrame>
        </MemoryRouter>,
      );
      await userEvent.type(screen.getByLabelText('One'), 'b');
      await userEvent.type(screen.getByLabelText('Two'), 'c{Enter}');
      await waitFor(() => expect(screen.getByText(DRAFT.SAVED)).toBeInTheDocument());
      expect(saveOne).toHaveBeenCalledWith('ab');
      expect(saveTwo).toHaveBeenCalledWith('ac');
    });

    it('leaves a form with its own submit button to that button', async () => {
      const own = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
      const save = vi.fn().mockResolvedValue(true);
      render(
        <MemoryRouter>
          <SettingsFrame title="Work">
            <Field name="One" save={save} />
            <form aria-label="Own form" onSubmit={own}>
              <input aria-label="Rate" />
              <input aria-label="Note" />
              <button type="submit">Add</button>
            </form>
          </SettingsFrame>
        </MemoryRouter>,
      );
      await userEvent.type(screen.getByLabelText('One'), 'b');
      await userEvent.type(screen.getByLabelText('Rate'), '1{Enter}');
      expect(own).toHaveBeenCalledTimes(1);
      expect(save).not.toHaveBeenCalled();
    });
  });
});
