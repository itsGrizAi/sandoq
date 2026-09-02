import { useEffect, useRef, useState } from 'react';

import { ANCHOR_HOME_DOMAIN, shortAddress, txUrl } from '../config';
import type { Wallet } from '../hooks/useWallet';
import {
  authenticate,
  defaultAsset,
  discover,
  getTransaction,
  listTransactions,
  sendWithdrawal,
  startInteractive,
  STATUS_LABELS,
  TERMINAL_STATUSES,
  type Anchor,
  type AnchorAsset,
  type AnchorTransaction,
  type Direction,
} from '../lib/anchor';
import { track } from '../lib/analytics';
import { AppError, classifyError } from '../lib/errors';
import type { TxProgress, TxStage } from '../lib/rpc';
import { signTransaction } from '../lib/wallet';
import { ErrorBanner } from './ErrorBanner';
import { TxStatus } from './TxStatus';

/** How often to ask the anchor where a transaction stands while it is open. */
const POLL_MS = 4_000;

/**
 * Cash in and cash out — the SEP-24 surface.
 *
 * The anchor does the part that needs a regulated business: identity, bank
 * details, the fiat leg. It runs in its own window. This panel does the parts
 * that need the user's key — proving they own the account, and for a
 * withdrawal, sending the asset — and shows where each transaction stands.
 */
export function AnchorPanel({ wallet, onClose }: { wallet: Wallet; onClose: () => void }) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [discovering, setDiscovering] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [authing, setAuthing] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  const [direction, setDirection] = useState<Direction>('deposit');
  const [asset, setAsset] = useState<AnchorAsset | null>(null);
  const [starting, setStarting] = useState(false);

  const [current, setCurrent] = useState<AnchorTransaction | null>(null);
  const [history, setHistory] = useState<AnchorTransaction[]>([]);

  const [amount, setAmount] = useState('');
  const [progress, setProgress] = useState<TxProgress>({ stage: 'idle' });
  const reached = useRef<TxStage>('idle');

  // Discover the anchor once. Nothing here needs a wallet.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const found = await discover();
        if (cancelled) return;
        setAnchor(found);
        setAsset(defaultAsset(found, 'deposit') ?? null);
        track('anchor_opened', { anchor: found.homeDomain });
      } catch (caught) {
        if (!cancelled) setError(classifyError(caught));
      } finally {
        if (!cancelled) setDiscovering(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Changing direction may change which assets are on offer.
  useEffect(() => {
    if (!anchor) return;
    if (asset && asset[direction]) return;
    setAsset(defaultAsset(anchor, direction) ?? null);
  }, [anchor, direction, asset]);

  // The session token is tied to the account; a different wallet needs its own.
  useEffect(() => {
    setToken(null);
    setCurrent(null);
    setHistory([]);
  }, [wallet.address]);

  // While a transaction is open, keep asking the anchor where it stands.
  useEffect(() => {
    if (!anchor || !token || !current || TERMINAL_STATUSES.has(current.status)) return;
    const id = current.id;
    const timer = setInterval(async () => {
      try {
        const next = await getTransaction(anchor, token, id);
        setCurrent(next);
        if (TERMINAL_STATUSES.has(next.status)) {
          track('anchor_completed', { kind: next.kind, status: next.status });
          void wallet.refresh();
          void loadHistory(anchor, token, asset?.code);
        }
      } catch {
        // A missed poll is not an error the user needs to see; the next one may succeed.
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [anchor, token, current, asset, wallet]);

  async function loadHistory(a: Anchor, t: string, code?: string) {
    if (!code) return;
    try {
      setHistory(await listTransactions(a, t, code));
    } catch {
      // History is a convenience; the live transaction is what matters.
    }
  }

  async function login() {
    if (!anchor || !wallet.address) return;
    setAuthing(true);
    setError(null);
    try {
      const jwt = await authenticate(anchor, wallet.address, (xdr) => signTransaction(xdr, wallet.address!));
      setToken(jwt);
      track('anchor_authenticated');
      await loadHistory(anchor, jwt, asset?.code);
    } catch (caught) {
      setError(caught instanceof AppError ? caught : classifyError(caught));
    } finally {
      setAuthing(false);
    }
  }

  async function begin() {
    if (!anchor || !token || !asset || !wallet.address) return;
    setStarting(true);
    setError(null);
    setProgress({ stage: 'idle' });
    try {
      const session = await startInteractive(anchor, token, direction, asset.code, wallet.address);
      track('anchor_started', { kind: direction, asset: asset.code });
      // The anchor's page runs in its own window: it is their KYC and their
      // payment form, and it must not be framed by anyone else's site.
      window.open(session.url, 'sandoq-anchor', 'width=520,height=760');
      setCurrent(await getTransaction(anchor, token, session.id));
    } catch (caught) {
      setError(caught instanceof AppError ? caught : classifyError(caught));
    } finally {
      setStarting(false);
    }
  }

  async function pay() {
    if (!current || !asset || !wallet.address) return;
    const value = amount.trim() || current.amountIn || '';
    if (!value) return;
    reached.current = 'idle';
    setError(null);
    try {
      await sendWithdrawal(
        wallet.address,
        current,
        asset,
        value,
        (xdr) => signTransaction(xdr, wallet.address!),
        (next) => {
          reached.current = next.stage;
          setProgress(next);
        },
      );
      void wallet.refresh();
    } catch (caught) {
      const appError = caught instanceof AppError ? caught : classifyError(caught);
      setProgress({ stage: 'failed', failedAt: reached.current, error: appError });
    }
  }

  const paying = ['simulating', 'signing', 'submitting', 'confirming'].includes(progress.stage);
  const offered = anchor?.assets.filter((a) => a[direction]) ?? [];
  const awaitingPayment = current?.kind === 'withdraw' && current.status === 'pending_user_transfer_start';

  return (
    <section className="card anchor-panel">
      <header className="section-header">
        <h2>Cash in · cash out</h2>
        <button className="button button--ghost" onClick={onClose}>
          Close
        </button>
      </header>

      <p className="muted">
        Move money between your bank and your wallet through a Stellar <strong>anchor</strong> — the
        regulated on- and off-ramp (SEP-24). The anchor handles identity and the bank leg in its own
        window; this app only ever asks your wallet to sign.
      </p>

      {error && <ErrorBanner error={error} onDismiss={() => setError(null)} />}

      {discovering ? (
        <p className="muted">Reading {ANCHOR_HOME_DOMAIN}…</p>
      ) : !anchor ? null : !wallet.address ? (
        <div className="feedback-connect">
          <p className="muted">Connect a wallet to cash in or out.</p>
          <button className="button button--primary" onClick={wallet.connect} disabled={wallet.connecting}>
            {wallet.connecting ? 'Opening wallet…' : 'Connect wallet'}
          </button>
        </div>
      ) : !token ? (
        <div className="anchor-login">
          <p>
            <strong>{anchor.homeDomain}</strong> moves{' '}
            {anchor.assets.map((a) => (a.code === 'native' ? 'XLM' : a.code)).join(', ')} on this
            network.
          </p>
          <p className="muted">
            First, prove to the anchor that you hold {shortAddress(wallet.address)}. Your wallet signs
            a challenge that can never be submitted — it is a login, not a payment.
          </p>
          <button className="button button--primary" onClick={login} disabled={authing}>
            {authing ? 'Waiting for your signature…' : 'Sign in to the anchor'}
          </button>
        </div>
      ) : (
        <>
          <div className="anchor-controls">
            <fieldset className="field">
              <span>I want to</span>
              <div className="chips">
                {(['deposit', 'withdraw'] as Direction[]).map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={`chip ${direction === d ? 'chip--active' : ''}`}
                    onClick={() => setDirection(d)}
                    disabled={starting || paying}
                  >
                    {d === 'deposit' ? 'Cash in' : 'Cash out'}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="field">
              <span>Asset</span>
              <div className="chips">
                {offered.map((a) => (
                  <button
                    key={a.code}
                    type="button"
                    className={`chip ${asset?.code === a.code ? 'chip--active' : ''}`}
                    onClick={() => setAsset(a)}
                    disabled={starting || paying}
                  >
                    {a.code === 'native' ? 'XLM' : a.code}
                  </button>
                ))}
              </div>
              {asset?.code === 'native' && (
                <small className="muted">The asset every circle here settles in.</small>
              )}
            </fieldset>

            <button className="button button--primary" onClick={begin} disabled={!asset || starting || paying}>
              {starting
                ? 'Opening the anchor…'
                : direction === 'deposit'
                  ? 'Cash in through the anchor'
                  : 'Cash out through the anchor'}
            </button>
          </div>

          {current && (
            <div className={`anchor-tx ${TERMINAL_STATUSES.has(current.status) ? 'anchor-tx--done' : ''}`}>
              <div className="anchor-tx__head">
                <strong>{current.kind === 'deposit' ? 'Cash in' : 'Cash out'}</strong>
                <span className="anchor-tx__status">{STATUS_LABELS[current.status] ?? current.status}</span>
              </div>
              {(current.amountIn || current.amountOut) && (
                <p className="muted">
                  {current.amountIn && <>in {current.amountIn}</>}
                  {current.amountIn && current.amountOut && ' · '}
                  {current.amountOut && <>out {current.amountOut}</>}
                  {current.amountFee && <> · fee {current.amountFee}</>}
                </p>
              )}
              {current.message && <p className="muted">{current.message}</p>}

              {awaitingPayment && (
                <div className="anchor-pay">
                  <p>
                    The anchor is ready. Send{' '}
                    <strong>{asset?.code === 'native' ? 'XLM' : asset?.code}</strong> to{' '}
                    <code>{shortAddress(current.withdrawAnchorAccount!)}</code>
                    {current.withdrawMemo && (
                      <>
                        {' '}
                        with memo <code>{current.withdrawMemo}</code>
                      </>
                    )}{' '}
                    — your wallet signs it, the anchor pays out.
                  </p>
                  <label className="field">
                    <span>Amount</span>
                    <div className="field__row">
                      <input
                        inputMode="decimal"
                        value={amount || current.amountIn || ''}
                        onChange={(e) => setAmount(e.target.value)}
                        disabled={paying}
                      />
                      <span className="field__suffix">{asset?.code === 'native' ? 'XLM' : asset?.code}</span>
                    </div>
                  </label>
                  <button className="button button--primary" onClick={pay} disabled={paying}>
                    {paying ? 'Signing…' : 'Sign & send'}
                  </button>
                  <TxStatus progress={progress} />
                </div>
              )}

              {current.stellarTransactionId && (
                <a href={txUrl(current.stellarTransactionId)} target="_blank" rel="noreferrer">
                  View the on-chain transfer ↗
                </a>
              )}
              {current.moreInfoUrl && !TERMINAL_STATUSES.has(current.status) && (
                <a href={current.moreInfoUrl} target="_blank" rel="noreferrer">
                  Reopen the anchor window ↗
                </a>
              )}
            </div>
          )}

          {history.length > 0 && (
            <>
              <div className="section-header feedback-panel__subhead">
                <h3>Your history with this anchor</h3>
                <span className="muted">{history.length} recent</span>
              </div>
              <ul className="anchor-history">
                {history.slice(0, 8).map((t) => (
                  <li key={t.id}>
                    <span>{t.kind === 'deposit' ? '⬇️' : '⬆️'}</span>
                    <div>
                      <p>
                        {t.kind === 'deposit' ? 'Cash in' : 'Cash out'}
                        {t.amountIn && <> · {t.amountIn}</>}
                      </p>
                      <small className="muted">
                        {STATUS_LABELS[t.status] ?? t.status}
                        {t.startedAt && <> · {t.startedAt.toLocaleDateString()}</>}
                      </small>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      <p className="muted analytics__note">
        Standards in play: SEP-1 (the anchor's <code>stellar.toml</code>), SEP-10 (wallet-signed
        login), SEP-24 (the anchor's own deposit and withdrawal page). No key, document or bank
        detail ever passes through this app.
      </p>
    </section>
  );
}
