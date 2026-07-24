import { useEffect, useRef, useState } from 'react';

import { copy, shareInvite, type ShareOutcome } from '../lib/invite';

type Feedback = 'idle' | ShareOutcome;

const LABELS: Record<Exclude<Feedback, 'idle'>, string> = {
  shared: 'Shared ✓',
  copied: 'Copied ✓',
  cancelled: '',
  failed: "Couldn't copy",
};

/** Show the result of a copy for a moment, then fall back to the real label. */
function useTransient(): [Feedback, (next: Feedback) => void] {
  const [state, setState] = useState<Feedback>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  return [
    state,
    (next) => {
      clearTimeout(timer.current);
      setState(next);
      if (next !== 'idle') timer.current = setTimeout(() => setState('idle'), 2_200);
    },
  ];
}

/**
 * Hands `text` and `url` to the OS share sheet, or copies them.
 *
 * On a phone the share sheet lands the invite straight in the group chat it is
 * meant for, which is the whole point — the share is the onboarding step.
 */
export function ShareButton({
  label,
  text,
  url,
  primary = false,
  onShared,
}: {
  label: string;
  text: string;
  url: string;
  primary?: boolean;
  onShared?: (outcome: ShareOutcome) => void;
}) {
  const [state, report] = useTransient();

  return (
    <button
      className={`button ${primary ? 'button--primary' : ''}`}
      onClick={async () => {
        const outcome = await shareInvite(text, url);
        report(outcome === 'cancelled' ? 'idle' : outcome);
        onShared?.(outcome);
      }}
    >
      {state === 'idle' ? label : LABELS[state]}
    </button>
  );
}

/** Copies one string — an address, a link — with the same transient feedback. */
export function CopyButton({
  label,
  value,
  primary = false,
}: {
  label: string;
  value: string;
  primary?: boolean;
}) {
  const [state, report] = useTransient();

  return (
    <button
      className={`button ${primary ? 'button--primary' : ''}`}
      onClick={async () => report((await copy(value)) ? 'copied' : 'failed')}
    >
      {state === 'idle' ? label : LABELS[state]}
    </button>
  );
}
