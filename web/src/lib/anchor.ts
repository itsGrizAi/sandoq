import {
  Asset,
  BASE_FEE,
  Memo,
  Operation,
  StellarToml,
  TransactionBuilder,
  WebAuth,
  type Transaction,
} from '@stellar/stellar-sdk';

import { ANCHOR_HOME_DOMAIN, NETWORK_PASSPHRASE } from '../config';
import { AppError, classifyError } from './errors';
import { server, type Signer, type TxProgress } from './rpc';

/**
 * Cash in and cash out through a Stellar anchor — SEP-24.
 *
 * A savings circle only matters if the money in it can come from, and go back
 * to, the world the members actually live in. An anchor is the regulated
 * business that does that exchange: it takes a bank transfer or cash and
 * credits the user's Stellar account, and the reverse on the way out.
 *
 * Three standards make it work, and each one is a small function here:
 *
 *   SEP-1   the anchor publishes who it is in `stellar.toml`             → discover()
 *   SEP-10  the user proves they hold the account by signing a challenge → authenticate()
 *   SEP-24  the anchor runs its own KYC + payment page in a pop-up       → startInteractive()
 *
 * Nothing about the user is stored here. The JWT from SEP-10 lives in memory
 * for one session and is only ever sent back to the anchor that issued it.
 */

export interface Anchor {
  homeDomain: string;
  /** SEP-10 challenge endpoint. */
  webAuth: string;
  /** SEP-24 transfer server. */
  transferServer: string;
  /** The key the anchor signs challenges with; a challenge from anyone else is refused. */
  signingKey: string;
  /** Assets the anchor moves, as `code` → issuer (`native` has none). */
  assets: AnchorAsset[];
}

export interface AnchorAsset {
  code: string;
  issuer?: string;
  deposit: boolean;
  withdraw: boolean;
}

export type Direction = 'deposit' | 'withdraw';

/** What the anchor hands back when it wants the user in its own page. */
export interface InteractiveSession {
  id: string;
  url: string;
}

/**
 * The SEP-24 transaction record, trimmed to what the UI shows. Statuses run
 * roughly incomplete → pending_user_transfer_start → pending_anchor →
 * completed, with `error`, `expired` and `refunded` as terminal failures.
 */
export interface AnchorTransaction {
  id: string;
  kind: Direction;
  status: string;
  amountIn?: string;
  amountOut?: string;
  amountFee?: string;
  /** For a withdrawal: where the user must send the asset, and with what memo. */
  withdrawAnchorAccount?: string;
  withdrawMemo?: string;
  withdrawMemoType?: string;
  /** Hash of the on-chain transfer, once there is one. */
  stellarTransactionId?: string;
  /** Set on a deposit the anchor is asking the user to do more for. */
  moreInfoUrl?: string;
  message?: string;
  startedAt?: Date;
  completedAt?: Date;
}

export const TERMINAL_STATUSES = new Set(['completed', 'refunded', 'error', 'expired', 'no_market', 'too_small', 'too_large']);

/** Plain-English labels for the statuses a user will actually see. */
export const STATUS_LABELS: Record<string, string> = {
  incomplete: 'Waiting for you to finish in the anchor window',
  pending_user_transfer_start: 'Anchor is ready — send the funds',
  pending_user_transfer_complete: 'Your transfer is on its way',
  pending_external: 'Anchor is waiting on the bank',
  pending_anchor: 'Anchor is processing',
  pending_stellar: 'Settling on Stellar',
  pending_trust: 'Add a trustline for this asset first',
  pending_user: 'Anchor needs something more from you',
  completed: 'Done',
  refunded: 'Refunded',
  expired: 'Expired — start again',
  error: 'The anchor reported an error',
  no_market: 'No market for this amount',
  too_small: 'Amount is below the anchor minimum',
  too_large: 'Amount is above the anchor maximum',
};

// ----------------------------------------------------------------- SEP-1

/**
 * Read the anchor's `stellar.toml` and pull out the three things a client
 * needs: where to authenticate, where to transfer, and which key to trust.
 */
export async function discover(homeDomain: string = ANCHOR_HOME_DOMAIN): Promise<Anchor> {
  let toml: StellarToml.Api.StellarToml;
  try {
    toml = await StellarToml.Resolver.resolve(homeDomain);
  } catch (error) {
    throw new AppError(
      'NETWORK',
      `Could not reach the anchor at ${homeDomain}.`,
      error instanceof Error ? error.message : undefined,
    );
  }

  const webAuth = toml.WEB_AUTH_ENDPOINT;
  const transferServer = toml.TRANSFER_SERVER_SEP0024;
  const signingKey = toml.SIGNING_KEY;
  if (!webAuth || !transferServer || !signingKey) {
    throw new AppError(
      'UNKNOWN',
      `${homeDomain} does not advertise SEP-24.`,
      'Its stellar.toml is missing WEB_AUTH_ENDPOINT, TRANSFER_SERVER_SEP0024 or SIGNING_KEY.',
    );
  }
  if (toml.NETWORK_PASSPHRASE && toml.NETWORK_PASSPHRASE !== NETWORK_PASSPHRASE) {
    throw new AppError('UNKNOWN', `${homeDomain} runs on a different network.`);
  }

  const assets = await readInfo(transferServer, toml.CURRENCIES ?? []);
  return { homeDomain, webAuth, transferServer, signingKey, assets };
}

/** SEP-24 `/info`: which of the anchor's currencies can actually move each way. */
async function readInfo(
  transferServer: string,
  currencies: StellarToml.Api.Currency[],
): Promise<AnchorAsset[]> {
  const info = (await getJson(`${transferServer}/info`)) as {
    deposit?: Record<string, { enabled?: boolean }>;
    withdraw?: Record<string, { enabled?: boolean }>;
  };
  const issuerOf = new Map(currencies.map((c) => [c.code, c.issuer]));
  const codes = new Set([...Object.keys(info.deposit ?? {}), ...Object.keys(info.withdraw ?? {})]);

  return [...codes].map((code) => ({
    code,
    issuer: code === 'native' ? undefined : issuerOf.get(code),
    deposit: info.deposit?.[code]?.enabled !== false && code in (info.deposit ?? {}),
    withdraw: info.withdraw?.[code]?.enabled !== false && code in (info.withdraw ?? {}),
  }));
}

// ---------------------------------------------------------------- SEP-10

/**
 * Prove to the anchor that the connected wallet controls `address`.
 *
 * The anchor sends a transaction that can never be submitted (sequence 0) but
 * that only the account holder can sign. Before it goes anywhere near the
 * wallet it is checked: signed by the anchor's published key, addressed to
 * this account, for this anchor's domain. A challenge that fails any of those
 * is refused, so a hostile page cannot trick the wallet into signing something
 * that looks like a login and is not.
 */
export async function authenticate(anchor: Anchor, address: string, sign: Signer): Promise<string> {
  const challenge = (await getJson(
    `${anchor.webAuth}?account=${encodeURIComponent(address)}&home_domain=${encodeURIComponent(anchor.homeDomain)}`,
  )) as { transaction: string; network_passphrase?: string };

  const webAuthDomain = new URL(anchor.webAuth).host;
  try {
    WebAuth.readChallengeTx(
      challenge.transaction,
      anchor.signingKey,
      challenge.network_passphrase ?? NETWORK_PASSPHRASE,
      anchor.homeDomain,
      webAuthDomain,
    );
  } catch (error) {
    throw new AppError(
      'UNKNOWN',
      'The anchor sent a login challenge that does not check out.',
      error instanceof Error ? error.message : undefined,
    );
  }

  const signed = await sign(challenge.transaction);

  const res = await fetch(anchor.webAuth, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transaction: signed }),
  });
  const body = (await res.json().catch(() => ({}))) as { token?: string; error?: string };
  if (!res.ok || !body.token) {
    throw new AppError('UNKNOWN', 'The anchor rejected the signed login.', body.error);
  }
  return body.token;
}

// ---------------------------------------------------------------- SEP-24

/**
 * Ask the anchor to open its own page for a deposit or withdrawal. Whatever it
 * needs from the user — identity, bank details, an amount — it collects there;
 * this app never sees any of it.
 */
export async function startInteractive(
  anchor: Anchor,
  token: string,
  direction: Direction,
  assetCode: string,
  account: string,
): Promise<InteractiveSession> {
  const res = await fetch(`${anchor.transferServer}/transactions/${direction}/interactive`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ asset_code: assetCode, account, lang: 'en' }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    type?: string;
    url?: string;
    id?: string;
    error?: string;
  };
  if (!res.ok || body.type !== 'interactive_customer_info_needed' || !body.url || !body.id) {
    throw new AppError('UNKNOWN', `The anchor could not start a ${direction}.`, body.error);
  }
  return { id: body.id, url: body.url };
}

/** One SEP-24 transaction, by id. */
export async function getTransaction(anchor: Anchor, token: string, id: string): Promise<AnchorTransaction> {
  const body = (await getJson(`${anchor.transferServer}/transaction?id=${encodeURIComponent(id)}`, token)) as {
    transaction: Record<string, unknown>;
  };
  return toTransaction(body.transaction);
}

/** The user's recent SEP-24 transactions for one asset, newest first. */
export async function listTransactions(
  anchor: Anchor,
  token: string,
  assetCode: string,
  limit = 10,
): Promise<AnchorTransaction[]> {
  const body = (await getJson(
    `${anchor.transferServer}/transactions?asset_code=${encodeURIComponent(assetCode)}&limit=${limit}`,
    token,
  )) as { transactions: Record<string, unknown>[] };
  return (body.transactions ?? []).map(toTransaction);
}

export function toTransaction(raw: Record<string, unknown>): AnchorTransaction {
  const str = (key: string) => (typeof raw[key] === 'string' ? (raw[key] as string) : undefined);
  const date = (key: string) => {
    const value = str(key);
    return value ? new Date(value) : undefined;
  };
  return {
    id: String(raw.id),
    kind: raw.kind === 'withdrawal' ? 'withdraw' : 'deposit',
    status: str('status') ?? 'unknown',
    amountIn: str('amount_in'),
    amountOut: str('amount_out'),
    amountFee: str('amount_fee'),
    withdrawAnchorAccount: str('withdraw_anchor_account'),
    withdrawMemo: str('withdraw_memo'),
    withdrawMemoType: str('withdraw_memo_type'),
    stellarTransactionId: str('stellar_transaction_id'),
    moreInfoUrl: str('more_info_url'),
    message: str('message'),
    startedAt: date('started_at'),
    completedAt: date('completed_at'),
  };
}

// ------------------------------------------------------ the withdrawal leg

/**
 * A withdrawal has one on-chain step that is the user's to make: once the
 * anchor says `pending_user_transfer_start`, it has told us the account and
 * memo to pay, and the user sends the asset there. The anchor watches for
 * that payment and pays out off-chain.
 *
 * This is a classic payment, not a contract call, so it does not go through
 * `invoke`; it is built, signed by the wallet, and submitted the same way.
 */
export async function sendWithdrawal(
  from: string,
  transaction: AnchorTransaction,
  asset: AnchorAsset,
  amount: string,
  sign: Signer,
  onStage: (progress: TxProgress) => void,
): Promise<string> {
  if (!transaction.withdrawAnchorAccount) {
    throw new AppError('UNKNOWN', 'The anchor has not said where to send the funds yet.');
  }

  onStage({ stage: 'simulating' });
  const account = await server.getAccount(from);
  const builder = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE })
    .addOperation(
      Operation.payment({
        destination: transaction.withdrawAnchorAccount,
        asset: asset.code === 'native' ? Asset.native() : new Asset(asset.code, asset.issuer!),
        amount,
      }),
    )
    .setTimeout(300);

  const memo = withdrawMemo(transaction);
  if (memo) builder.addMemo(memo);
  const tx = builder.build();

  onStage({ stage: 'signing' });
  const signedXdr = await sign(tx.toXDR());
  const signed = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE) as Transaction;

  onStage({ stage: 'submitting' });
  let sent;
  try {
    sent = await server.sendTransaction(signed);
  } catch (error) {
    throw classifyError(error);
  }
  if (sent.status === 'ERROR') {
    throw new AppError('UNKNOWN', 'The network rejected the withdrawal payment.');
  }

  onStage({ stage: 'confirming', hash: sent.hash });
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const result = await server.getTransaction(sent.hash);
    if (result.status === 'SUCCESS') {
      onStage({ stage: 'success', hash: sent.hash });
      return sent.hash;
    }
    if (result.status === 'FAILED') {
      throw new AppError('UNKNOWN', 'The withdrawal payment failed on the ledger.');
    }
    await new Promise((r) => setTimeout(r, 1_000));
  }
  throw new AppError('NETWORK', 'The withdrawal payment did not confirm in time.', sent.hash);
}

/** The memo the anchor asked for, in the type it asked for. */
export function withdrawMemo(transaction: AnchorTransaction): Memo | null {
  const { withdrawMemo: value, withdrawMemoType: type } = transaction;
  if (!value) return null;
  switch (type) {
    case 'id':
      return Memo.id(value);
    case 'hash':
      return Memo.hash(value);
    default:
      return Memo.text(value);
  }
}

// ----------------------------------------------------------------- helpers

async function getJson(url: string, token?: string): Promise<unknown> {
  const res = await fetch(url, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new AppError('NETWORK', `The anchor answered ${res.status}.`, body.error);
  }
  return res.json();
}

/** The asset a session should default to: the circle's own, XLM, if the anchor moves it. */
export function defaultAsset(anchor: Anchor, direction: Direction): AnchorAsset | undefined {
  const usable = anchor.assets.filter((a) => a[direction]);
  return usable.find((a) => a.code === 'native') ?? usable[0];
}
