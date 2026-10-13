// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyText } from './clipboard.js';

const originalExecCommand = Object.getOwnPropertyDescriptor(document, 'execCommand');
afterEach(() => {
  vi.unstubAllGlobals();
  if (originalExecCommand) Object.defineProperty(document, 'execCommand', originalExecCommand);
  else Reflect.deleteProperty(document, 'execCommand');
  document.body.replaceChildren();
  window.getSelection()?.removeAllRanges();
});

describe('copyText', () => {
  it('uses the native clipboard API when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    expect(await copyText('Agent context')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('Agent context');
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('copies through execCommand on HTTP and restores focus and selection', async () => {
    vi.stubGlobal('navigator', {});
    const trigger = document.createElement('button');
    const paragraph = document.createElement('p');
    paragraph.textContent = 'Original selection';
    document.body.append(trigger, paragraph);
    trigger.focus();
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    expect(window.getSelection()?.toString()).toBe('Original selection');
    const execCommand = vi.fn(() => {
      const textarea = document.querySelector('textarea');
      expect(textarea?.value).toBe('Agent context');
      expect(textarea?.selectionEnd).toBe('Agent context'.length);
      return true;
    });
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand });
    expect(await copyText('Agent context')).toBe(true);
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(document.querySelector('textarea')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(window.getSelection()?.toString()).toBe('Original selection');
  });

  it('falls back after clipboard permission denial', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('Denied')) } });
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand });
    expect(await copyText('Agent context')).toBe(true);
    expect(execCommand).toHaveBeenCalledWith('copy');
  });

  it('returns false, not success, when both clipboard mechanisms are unavailable', async () => {
    vi.stubGlobal('navigator', {});
    Object.defineProperty(document, 'execCommand', { configurable: true, value: undefined });
    expect(await copyText('Agent context')).toBe(false);
  });

  it.each(['rejected', 'throwing'])('cleans up a %s fallback without reporting success', async (mode) => {
    vi.stubGlobal('navigator', {});
    const execCommand = vi.fn(() => {
      if (mode === 'throwing') throw new Error('Blocked');
      return false;
    });
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand });
    expect(await copyText('Agent context')).toBe(false);
    expect(document.querySelector('textarea')).toBeNull();
  });
});
