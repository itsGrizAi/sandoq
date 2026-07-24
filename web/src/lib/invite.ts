/**
 * Invite links.
 *
 * The app keeps the open circle in the location hash, so every circle already
 * has its own URL. Inviting a group is therefore a matter of handing them that
 * URL plus enough context to know what they are being asked to join — no
 * backend, no invite token, nothing to expire.
 *
 * Nothing here touches the chain. On a public circle the link *is* the whole
 * invite: open it, connect, join. On an invite-only one the organizer still
 * has to `allow()` the address on-chain, so the message asks for that address
 * outright and the invitee gets a one-tap way to send it back.
 */

export interface InviteDetails {
  name: string;
  /** Already formatted for display, e.g. `"10"` and `"every 7 days"`. */
  contribution: string;
  period: string;
  collateral: string;
  size: number;
  private: boolean;
}

const currentHref = (): string =>
  typeof window === 'undefined' ? 'https://itsgriznft.github.io/sandoq/' : window.location.href;

/**
 * The shareable URL of a circle, derived from wherever the app is being
 * served, so a local dev link stays local and a Pages link stays on Pages.
 */
export function circleUrl(address: string, href: string = currentHref()): string {
  const url = new URL(href);
  url.hash = address;
  return url.toString();
}

/** The message that travels with the link — WhatsApp, Telegram, wherever. */
export function inviteMessage(details: InviteDetails, url: string): string {
  const lines = [
    `Join my savings circle "${details.name}" on Sandoq.`,
    '',
    `${details.size} people put in ${details.contribution} XLM ${details.period}, and each round the` +
      ' whole pot goes to one member until everyone has been paid once. A Stellar contract holds' +
      ` the money — not me. Your seat stakes ${details.collateral} XLM, refundable when the circle` +
      ' finishes.',
    '',
    'Testnet only, so it is free play money — nothing real at risk.',
    url,
  ];

  if (details.private) {
    lines.push(
      '',
      'This one is invite-only: send me your Stellar address (it starts with G) and I will add you.',
    );
  }

  return lines.join('\n');
}

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

/**
 * Hand the invite to the OS share sheet when there is one — that is the whole
 * point on a phone, where the next step is a specific chat — and fall back to
 * the clipboard everywhere else. A share the user backs out of is reported as
 * cancelled so the UI stays quiet instead of claiming success.
 */
export async function shareInvite(text: string, url: string): Promise<ShareOutcome> {
  const nav: Navigator | undefined = typeof navigator === 'undefined' ? undefined : navigator;

  if (nav?.share) {
    try {
      await nav.share({ title: 'Sandoq', text, url });
      return 'shared';
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return 'cancelled';
      // Anything else (an unsupported payload, a permissions policy) is worth
      // retrying as a copy rather than reporting as a failure.
    }
  }

  return (await copy(`${text}`)) ? 'copied' : 'failed';
}

/**
 * Copy text to the clipboard. The async Clipboard API needs a secure context,
 * which a plain-HTTP LAN preview is not, so keep the old execCommand path as a
 * fallback rather than leaving those users with a dead button.
 */
export async function copy(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy path.
  }

  try {
    if (typeof document === 'undefined') return false;
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.appendChild(field);
    field.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(field);
    return ok;
  } catch {
    return false;
  }
}
