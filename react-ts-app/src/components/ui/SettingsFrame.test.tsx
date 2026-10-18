import { describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { SettingsFrame, SettingsNote, SettingsRow, SettingsSave, SettingsSection } from './SettingsFrame';

describe('SettingsFrame (UI foundations spec §6.3)', () => {
  it('heads the page with the display h1 and a muted intro, full width up to its cap', () => {
    render(
      <SettingsFrame title="Members" intro="Who is in this workspace." action={<button type="button">Invite</button>}>
        Body
      </SettingsFrame>,
    );
    const title = screen.getByRole('heading', { level: 1, name: 'Members' });
    expect(title).toHaveClass('text-[22px]', 'font-semibold');
    expect(screen.getByText('Who is in this workspace.')).toHaveClass('text-ink-muted', 'max-w-[68ch]');
    const frame = screen.getByText('Body').parentElement;
    expect(frame).toHaveClass('w-full', 'max-w-[960px]', 'px-4', 'pt-8', 'md:px-6');
    expect(screen.getByRole('button', { name: 'Invite' })).toBeInTheDocument();
  });

  it('caps a page at max-w-[960px]', () => {
    render(<SettingsFrame title="General">Body</SettingsFrame>);
    expect(screen.getByText('Body').parentElement).toHaveClass('max-w-[960px]');
  });

  it('puts a section heading outside one divided card, rows and footer inside', () => {
    render(
      <SettingsSection title="Workspace" description="The name everyone sees." footer={<button type="button">Save</button>}>
        <SettingsRow label="Name" hint="Shown in the sidebar." htmlFor="name">
          <input id="name" />
        </SettingsRow>
        <SettingsRow label="Owner">Alice</SettingsRow>
      </SettingsSection>,
    );
    const section = screen.getByRole('region', { name: 'Workspace' });
    expect(screen.getByRole('heading', { level: 2, name: 'Workspace' })).toHaveClass('text-[15px]', 'font-semibold');
    const card = section.querySelector('.rounded-xl')!;
    expect(card).toHaveClass('border-line', 'bg-surface');
    expect(card).not.toContainElement(screen.getByRole('heading', { level: 2 }));
    expect(card.firstElementChild).toHaveClass('divide-y', 'divide-line-subtle');
    expect(screen.getByRole('textbox', { name: 'Name' })).toBeInTheDocument();
    expect(screen.getByText('Shown in the sidebar.')).toHaveClass('text-[11px]');
    expect(screen.getByText('Owner')).toHaveClass('text-[13px]', 'font-semibold');
    expect(screen.getByRole('button', { name: 'Save' }).parentElement).toHaveClass('border-t', 'justify-end');
  });
});

describe('SettingsFrame, Settings PR additions', () => {
  it('takes a note under the intro and a focusable heading', () => {
    const ref = createRef<HTMLHeadingElement>();
    render(
      <SettingsFrame title="Defaults" intro="What the workspace assumes." note={<SettingsNote icon="lock">You can't change this.</SettingsNote>} headingRef={ref}>
        Body
      </SettingsFrame>,
    );
    const title = screen.getByRole('heading', { level: 1, name: 'Defaults' });
    expect(ref.current).toBe(title);
    expect(title).toHaveAttribute('tabindex', '-1');
    expect(title).toHaveClass('focus-visible:outline-accent');
    const note = screen.getByText("You can't change this.").closest('[data-part="settings-note"]')!;
    expect(note).toHaveClass('text-[13px]', 'text-ink-muted');
    expect(note).not.toHaveClass('rounded-lg');
    expect(note.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('puts an action on the section heading row, a list body, a header inside the card, and a state in place of the body', () => {
    const { rerender } = render(
      <SettingsSection title="Catalogue" action={<button type="button">Add product</button>} list="Products" header={<div data-testid="labels" />}>
        <li>Product A</li>
      </SettingsSection>,
    );
    const section = screen.getByRole('region', { name: 'Catalogue' });
    expect(section).toHaveClass('@container');
    expect(screen.getByRole('button', { name: 'Add product' }).closest('.rounded-xl')).toBeNull();
    const list = screen.getByRole('list', { name: 'Products' });
    expect(list).toHaveClass('divide-y', 'divide-line-subtle');
    expect(screen.getByTestId('labels').nextElementSibling).toBe(list);
    expect(list.closest('.rounded-xl')).toHaveClass('overflow-hidden');
    rerender(
      <SettingsSection title="Catalogue" list="Products" state={<p>Loading products</p>}>
        <li>Product A</li>
      </SettingsSection>,
    );
    expect(screen.queryByRole('list', { name: 'Products' })).toBeNull();
    expect(screen.getByText('Loading products').closest('.rounded-xl')).not.toBeNull();
  });

  it('shows a field error under the control, a stacked label above it, and names a group by its label', () => {
    render(
      <SettingsSection title="Webhook">
        <SettingsRow label="URL" htmlFor="url" hint="Where it posts." hintId="url-hint" error="Enter a full URL." errorId="url-error" stacked>
          <input id="url" aria-invalid="true" aria-describedby="url-hint url-error" />
        </SettingsRow>
        <SettingsRow label="Applies to" group>
          <label>
            <input type="checkbox" /> Organizations
          </label>
        </SettingsRow>
      </SettingsSection>,
    );
    const input = screen.getByRole('textbox', { name: 'URL' });
    expect(input).toHaveAccessibleDescription('Where it posts. Enter a full URL.');
    const error = screen.getByRole('alert');
    expect(error).toHaveAttribute('id', 'url-error');
    expect(error).toHaveClass('text-[11px]', 'text-danger-ink');
    expect(input.closest('.flex-col.px-4')).not.toBeNull();
    expect(screen.getByRole('group', { name: 'Applies to' })).toContainElement(screen.getByRole('checkbox', { name: 'Organizations' }));
  });

  it('draws a one-section form save: the status region first and always there, then the one primary', async () => {
    const { rerender } = render(
      <form onSubmit={(event) => event.preventDefault()}>
        <SettingsSave dirty={false} saving={false} />
      </form>,
    );
    const region = screen.getByRole('status');
    const save = screen.getByRole('button', { name: 'Save changes' });
    expect(save).toHaveAttribute('type', 'submit');
    expect(save).toHaveAttribute('aria-disabled', 'true');
    expect(save).toHaveClass('bg-accent');
    rerender(
      <form onSubmit={(event) => event.preventDefault()}>
        <SettingsSave dirty={false} saving={false} status="Saved." label="Save" />
      </form>,
    );
    expect(screen.getByRole('status')).toBe(region);
    expect(region).toHaveTextContent('Saved.');
    expect(screen.getByRole('button', { name: 'Save' })).not.toHaveAttribute('aria-busy');
  });

  it('draws a warning note in ink with the warning icon, never a tinted box', () => {
    render(<SettingsNote icon="warning">Saving clears 2 exchange rates.</SettingsNote>);
    const note = screen.getByText('Saving clears 2 exchange rates.').closest('[data-part="settings-note"]')!;
    expect(note).toHaveClass('text-ink');
    expect(note.querySelector('svg')).toHaveClass('text-warning');
    expect(note.className).not.toMatch(/bg-|border/);
  });

  it('names a group by its label even when the label also targets a control', () => {
    render(
      <SettingsSection title="S">
        <SettingsRow label="Applies to" group htmlFor="x">
          <input id="x" type="checkbox" />
        </SettingsRow>
      </SettingsSection>,
    );
    expect(screen.getByRole('group', { name: 'Applies to' })).toBeInTheDocument();
  });
});

describe('production layout (settings production spec §5.1-§5.3)', () => {
  it('caps every page at one width', () => {
    const { container } = render(<SettingsFrame title="General">{null}</SettingsFrame>);
    expect(container.firstElementChild).toHaveClass('max-w-[960px]');
  });

  it('lays a form section out in two columns from lg, help on the left', () => {
    render(
      <SettingsFrame title="General">
        <SettingsSection title="Workspace" description="Name and address people see.">
          <SettingsRow label="Name">x</SettingsRow>
        </SettingsSection>
      </SettingsFrame>,
    );
    const section = screen.getByRole('region', { name: 'Workspace' });
    expect(section).toHaveClass('lg:grid-cols-[260px_minmax(0,1fr)]');
  });

  it('keeps a list section stacked at every width', () => {
    render(
      <SettingsSection title="Products" list="Products">
        <li>One</li>
      </SettingsSection>,
    );
    expect(screen.getByRole('region', { name: 'Products' })).not.toHaveClass('lg:grid-cols-[260px_minmax(0,1fr)]');
  });

  it('colours a danger section title', () => {
    render(
      <SettingsSection title="Danger zone" variant="danger">
        <SettingsRow label="New owner">x</SettingsRow>
      </SettingsSection>,
    );
    expect(screen.getByRole('heading', { name: 'Danger zone' })).toHaveClass('text-danger-ink');
  });

  it('puts the control at the end of the row from sm', () => {
    render(
      <SettingsSection title="Digest">
        <SettingsRow label="Daily digest">
          <span data-testid="control">c</span>
        </SettingsRow>
      </SettingsSection>,
    );
    expect(screen.getByTestId('control').parentElement).toHaveClass('sm:items-end');
  });
});

describe('stacked row control', () => {
  it('is full width, not capped or end-aligned', () => {
    render(
      <SettingsSection title="Hooks">
        <SettingsRow label="URL" stacked>
          <span data-testid="stacked-control">c</span>
        </SettingsRow>
      </SettingsSection>,
    );
    const wrapper = screen.getByTestId('stacked-control').parentElement;
    expect(wrapper).not.toHaveClass('sm:max-w-sm');
    expect(wrapper).not.toHaveClass('sm:items-end');
  });
});
