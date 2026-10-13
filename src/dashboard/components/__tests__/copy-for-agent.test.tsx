// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, act } from '@testing-library/react';
import { CopyForAgent } from '../CopyForAgent.js';
import { copyText } from '../../lib/clipboard.js';

vi.mock('../../lib/clipboard.js', () => ({ copyText: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.resetAllMocks();
});

describe('CopyForAgent', () => {
  it('copies the full brief and announces success only after copying succeeds', async () => {
    vi.mocked(copyText).mockResolvedValue(true);
    render(<CopyForAgent content={'Make changes here.\nSource: index.mdx'} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy for agent' }));
    await waitFor(() => expect(screen.getByText('Copied')).toBeTruthy());
    expect(copyText).toHaveBeenCalledWith('Make changes here.\nSource: index.mdx');
    expect(screen.getByRole('status').textContent).toContain('copied to clipboard');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('offers selected manual-copy text and restores focus when copying is blocked', async () => {
    vi.mocked(copyText).mockResolvedValue(false);
    const content = 'Make changes here.\nMDX source';
    render(<CopyForAgent content={content} />);
    const trigger = screen.getByRole('button', { name: 'Copy for agent' });
    fireEvent.click(trigger);
    await screen.findByRole('dialog');
    const textarea = screen.getByRole('textbox', { name: 'Agent instructions' }) as HTMLTextAreaElement;
    expect(textarea.value).toBe(content);
    expect(textarea.selectionStart).toBe(0);
    expect(textarea.selectionEnd).toBe(content.length);
    expect(document.activeElement).toBe(textarea);
    expect(screen.queryByText('Copied')).toBeNull();
    fireEvent.keyDown(textarea, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close copy instructions' }));
    fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(textarea);
    fireEvent.keyDown(textarea, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('clears transient success feedback', async () => {
    vi.useFakeTimers();
    vi.mocked(copyText).mockResolvedValue(true);
    render(<CopyForAgent content="Agent context" />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy for agent' })); });
    expect(screen.getByText('Copied')).toBeTruthy();
    await act(async () => { vi.advanceTimersByTime(2500); });
    expect(screen.queryByText('Copied')).toBeNull();
    expect(screen.getByRole('button', { name: 'Copy for agent' }).textContent).toContain('Copy for agent');
  });
});
