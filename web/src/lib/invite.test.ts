import { afterEach, describe, expect, it, vi } from 'vitest';

import { circleUrl, copy, inviteMessage, shareInvite, type InviteDetails } from './invite';

const CIRCLE = 'CB73QYCRM7BXR52W6FUTNCF6SVLAD26QTLUJCPMOKVKI7A6FPGNBVHRC';

const details = (overrides: Partial<InviteDetails> = {}): InviteDetails => ({
  name: 'Neighbors sandoq',
  contribution: '10',
  period: 'every 7 days',
  collateral: '50',
  size: 5,
  private: false,
  ...overrides,
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('circleUrl', () => {
  it('puts the circle in the hash of the page it is served from', () => {
    expect(circleUrl(CIRCLE, 'https://itsgriznft.github.io/sandoq/')).toBe(
      `https://itsgriznft.github.io/sandoq/#${CIRCLE}`,
    );
  });

  it('replaces a hash that is already there', () => {
    expect(circleUrl(CIRCLE, 'https://itsgriznft.github.io/sandoq/#COTHER')).toBe(
      `https://itsgriznft.github.io/sandoq/#${CIRCLE}`,
    );
  });

  it('keeps a local dev link local', () => {
    expect(circleUrl(CIRCLE, 'http://localhost:5173/')).toBe(`http://localhost:5173/#${CIRCLE}`);
  });
});

describe('inviteMessage', () => {
  const url = `https://itsgriznft.github.io/sandoq/#${CIRCLE}`;

  it('names the circle, its terms, and the link', () => {
    const message = inviteMessage(details(), url);

    expect(message).toContain('Neighbors sandoq');
    expect(message).toContain('10 XLM every 7 days');
    expect(message).toContain('50 XLM');
    expect(message).toContain('5 people');
    expect(message).toContain(url);
  });

  it('asks an invitee for their address only on a private circle', () => {
    expect(inviteMessage(details({ private: true }), url)).toContain('starts with G');
    expect(inviteMessage(details(), url)).not.toContain('starts with G');
  });
});

describe('shareInvite', () => {
  it('uses the OS share sheet when there is one', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { share });

    await expect(shareInvite('text', 'url')).resolves.toBe('shared');
    expect(share).toHaveBeenCalledWith({ title: 'Sandoq', text: 'text', url: 'url' });
  });

  it('reports a dismissed share sheet as cancelled, not as success', async () => {
    const abort = Object.assign(new Error('dismissed'), { name: 'AbortError' });
    vi.stubGlobal('navigator', { share: vi.fn().mockRejectedValue(abort) });

    await expect(shareInvite('text', 'url')).resolves.toBe('cancelled');
  });

  it('falls back to the clipboard when there is no share sheet', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    await expect(shareInvite('text', 'url')).resolves.toBe('copied');
    expect(writeText).toHaveBeenCalledWith('text');
  });

  it('falls back to the clipboard when the share sheet itself breaks', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', {
      share: vi.fn().mockRejectedValue(new Error('NotAllowedError')),
      clipboard: { writeText },
    });

    await expect(shareInvite('text', 'url')).resolves.toBe('copied');
  });

  it('reports failure when nothing can carry the invite', async () => {
    vi.stubGlobal('navigator', {});
    await expect(shareInvite('text', 'url')).resolves.toBe('failed');
  });
});

describe('copy', () => {
  it('reports failure rather than throwing when the clipboard is blocked', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });

    // No document in this environment, so the legacy fallback cannot run either.
    await expect(copy('anything')).resolves.toBe(false);
  });
});
