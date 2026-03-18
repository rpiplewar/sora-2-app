import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ─── Mock the store (path relative to THIS test file: src/test/) ─────────────
// src/test/ → ../stores/ = src/stores/sceneBuilderStore
const mockCreateNewScene = vi.fn();

vi.mock('../stores/sceneBuilderStore', () => ({
  useSceneBuilderStore: () => ({
    currentSceneId: null,
    scenes: [],
    updatePrompt: vi.fn(),
    remixCurrentVersion: vi.fn(),
    isRemixing: false,
    createNewScene: mockCreateNewScene,
    isGenerating: false,
    extendScene: vi.fn(),
    isExtending: false,
  }),
}));

import { PromptEditor } from '../components/scene-builder/PromptEditor';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PromptEditor — duration dropdown', () => {
  it('renders 4s, 8s, 12s, 16s, 20s options', () => {
    render(<PromptEditor />);
    // Duration label wraps select, so accessible name = "Duration:"
    const select = screen.getByRole('combobox', { name: /duration/i });
    const options = within(select).getAllByRole('option');
    const values = options.map((o) => o.getAttribute('value'));
    expect(values).toContain('4');
    expect(values).toContain('8');
    expect(values).toContain('12');
    expect(values).toContain('16');
    expect(values).toContain('20');
  });

  it('has exactly 5 duration options', () => {
    render(<PromptEditor />);
    const select = screen.getByRole('combobox', { name: /duration/i });
    const options = within(select).getAllByRole('option');
    expect(options).toHaveLength(5);
  });
});

describe('PromptEditor — size dropdown', () => {
  it('includes Full HD sizes with Pro label', () => {
    render(<PromptEditor />);
    const select = screen.getByRole('combobox', { name: /size/i });
    const options = within(select).getAllByRole('option');
    const texts = options.map((o) => o.textContent);
    expect(texts.some((t) => t?.includes('1920x1080') && t.includes('Pro'))).toBe(true);
    expect(texts.some((t) => t?.includes('1080x1920') && t.includes('Pro'))).toBe(true);
  });
});

describe('PromptEditor — model auto-selection via getModelForSize', () => {
  it('calls createNewScene with sora-2 for standard HD size', async () => {
    const user = userEvent.setup();
    render(<PromptEditor />);

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'A beach at dusk');

    const sizeSelect = screen.getByRole('combobox', { name: /size/i }) as HTMLSelectElement;
    await user.selectOptions(sizeSelect, '1280x720');

    await user.click(screen.getByRole('button', { name: /create scene/i }));

    expect(mockCreateNewScene).toHaveBeenCalledOnce();
    const [, params] = mockCreateNewScene.mock.calls[0];
    expect(params.model).toBe('sora-2');
    expect(params.size).toBe('1280x720');
  });

  it('calls createNewScene with sora-2-pro when 1920x1080 is selected', async () => {
    const user = userEvent.setup();
    render(<PromptEditor />);

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'Cinematic Full HD scene');

    const sizeSelect = screen.getByRole('combobox', { name: /size/i }) as HTMLSelectElement;
    await user.selectOptions(sizeSelect, '1920x1080');

    await user.click(screen.getByRole('button', { name: /create scene/i }));

    expect(mockCreateNewScene).toHaveBeenCalledOnce();
    const [, params] = mockCreateNewScene.mock.calls[0];
    expect(params.model).toBe('sora-2-pro');
    expect(params.size).toBe('1920x1080');
  });

  it('calls createNewScene with sora-2-pro when 1080x1920 is selected', async () => {
    const user = userEvent.setup();
    render(<PromptEditor />);

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'Vertical video scene');

    const sizeSelect = screen.getByRole('combobox', { name: /size/i }) as HTMLSelectElement;
    await user.selectOptions(sizeSelect, '1080x1920');

    await user.click(screen.getByRole('button', { name: /create scene/i }));

    expect(mockCreateNewScene).toHaveBeenCalledOnce();
    const [, params] = mockCreateNewScene.mock.calls[0];
    expect(params.model).toBe('sora-2-pro');
    expect(params.size).toBe('1080x1920');
  });

  it('passes selected duration to createNewScene', async () => {
    const user = userEvent.setup();
    render(<PromptEditor />);

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'Long cinematic scene');

    const durationSelect = screen.getByRole('combobox', { name: /duration/i }) as HTMLSelectElement;
    await user.selectOptions(durationSelect, '16');

    await user.click(screen.getByRole('button', { name: /create scene/i }));

    const [, params] = mockCreateNewScene.mock.calls[0];
    expect(params.seconds).toBe('16');
  });

  it('does not call createNewScene when prompt is empty', async () => {
    const user = userEvent.setup();
    render(<PromptEditor />);

    const button = screen.getByRole('button', { name: /create scene/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    await user.click(button);
    expect(mockCreateNewScene).not.toHaveBeenCalled();
  });
});
