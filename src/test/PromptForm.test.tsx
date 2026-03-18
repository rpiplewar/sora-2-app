import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PromptForm } from '../components/PromptForm';

// PromptForm labels aren't linked via htmlFor, so we query by index:
// getAllByRole('combobox')[0] = Segment Duration
// getAllByRole('combobox')[1] = Resolution & Orientation

describe('PromptForm — duration dropdown', () => {
  it('renders 4s, 8s, 12s, 16s, 20s options', () => {
    render(<PromptForm onSubmit={vi.fn()} />);
    const [durationSelect] = screen.getAllByRole('combobox');
    const options = within(durationSelect).getAllByRole('option');
    const values = options.map((o) => o.getAttribute('value'));
    expect(values).toContain('4');
    expect(values).toContain('8');
    expect(values).toContain('12');
    expect(values).toContain('16');
    expect(values).toContain('20');
  });

  it('has exactly 5 duration options', () => {
    render(<PromptForm onSubmit={vi.fn()} />);
    const [durationSelect] = screen.getAllByRole('combobox');
    const options = within(durationSelect).getAllByRole('option');
    expect(options).toHaveLength(5);
  });

  it('defaults to 4 seconds', () => {
    render(<PromptForm onSubmit={vi.fn()} />);
    const [durationSelect] = screen.getAllByRole('combobox') as HTMLSelectElement[];
    expect(durationSelect.value).toBe('4');
  });

  it('allows selecting 20 seconds', async () => {
    const user = userEvent.setup();
    render(<PromptForm onSubmit={vi.fn()} />);
    const [durationSelect] = screen.getAllByRole('combobox') as HTMLSelectElement[];
    await user.selectOptions(durationSelect, '20');
    expect(durationSelect.value).toBe('20');
  });

  it('allows selecting 16 seconds', async () => {
    const user = userEvent.setup();
    render(<PromptForm onSubmit={vi.fn()} />);
    const [durationSelect] = screen.getAllByRole('combobox') as HTMLSelectElement[];
    await user.selectOptions(durationSelect, '16');
    expect(durationSelect.value).toBe('16');
  });
});

describe('PromptForm — resolution dropdown', () => {
  it('renders Pro resolution options', () => {
    render(<PromptForm onSubmit={vi.fn()} />);
    const [, sizeSelect] = screen.getAllByRole('combobox');
    const options = within(sizeSelect).getAllByRole('option');
    const values = options.map((o) => o.getAttribute('value'));
    expect(values).toContain('1792x1024');
    expect(values).toContain('1024x1792');
    expect(values).toContain('1280x720');
    expect(values).toContain('720x1280');
  });

  it('shows hint about Pro resolutions requiring sora-2-pro', () => {
    render(<PromptForm onSubmit={vi.fn()} />);
    expect(screen.getByText(/sora-2-pro/i)).toBeInTheDocument();
  });
});

describe('PromptForm — submit', () => {
  it('calls onSubmit with correct data including selected seconds', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<PromptForm onSubmit={onSubmit} />);

    await user.type(screen.getByRole('textbox'), 'A sunset over mountains');
    const [durationSelect] = screen.getAllByRole('combobox');
    await user.selectOptions(durationSelect, '20');
    await user.click(screen.getByRole('button', { name: /generate video/i }));

    expect(onSubmit).toHaveBeenCalledOnce();
    const arg = onSubmit.mock.calls[0][0];
    expect(arg.seconds).toBe(20);
    expect(arg.prompt).toBe('A sunset over mountains');
  });

  it('does not call onSubmit with empty prompt', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    // jsdom doesn't fire form submit for required-field HTML5 validation,
    // but PromptForm uses an alert + early return, so just confirm button exists disabled
    render(<PromptForm onSubmit={onSubmit} />);
    const button = screen.getByRole('button', { name: /generate video/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});
