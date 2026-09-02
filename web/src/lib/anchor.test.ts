import { Memo } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';

import {
  defaultAsset,
  STATUS_LABELS,
  TERMINAL_STATUSES,
  toTransaction,
  withdrawMemo,
  type Anchor,
} from './anchor';

const anchor: Anchor = {
  homeDomain: 'testanchor.stellar.org',
  webAuth: 'https://testanchor.stellar.org/auth',
  transferServer: 'https://testanchor.stellar.org/sep24',
  signingKey: 'GCHLHDBOKG2JWMJQBTLSL5XG6NO7ESXI2TAQKZXCXWXB5WI2X6W233PR',
  assets: [
    { code: 'SRT', issuer: 'GCDN…', deposit: true, withdraw: true },
    { code: 'native', deposit: true, withdraw: false },
    { code: 'USDC', issuer: 'GBBD…', deposit: false, withdraw: true },
  ],
};

describe('toTransaction', () => {
  it('maps the anchor record to what the panel shows', () => {
    const t = toTransaction({
      id: 'abc',
      kind: 'withdrawal',
      status: 'pending_user_transfer_start',
      amount_in: '25.0',
      amount_out: '24.5',
      amount_fee: '0.5',
      withdraw_anchor_account: 'GANCHOR',
      withdraw_memo: '12345',
      withdraw_memo_type: 'id',
      started_at: '2026-09-02T10:00:00Z',
    });
    expect(t.kind).toBe('withdraw');
    expect(t.status).toBe('pending_user_transfer_start');
    expect(t.amountIn).toBe('25.0');
    expect(t.withdrawAnchorAccount).toBe('GANCHOR');
    expect(t.startedAt?.toISOString()).toBe('2026-09-02T10:00:00.000Z');
    expect(t.completedAt).toBeUndefined();
  });

  it('treats anything that is not a withdrawal as a deposit', () => {
    expect(toTransaction({ id: '1', kind: 'deposit', status: 'completed' }).kind).toBe('deposit');
  });
});

describe('withdrawMemo', () => {
  it('uses the memo type the anchor asked for', () => {
    const base = { id: '1', kind: 'withdraw' as const, status: 'x' };
    expect(withdrawMemo({ ...base, withdrawMemo: '42', withdrawMemoType: 'id' })).toEqual(Memo.id('42'));
    expect(withdrawMemo({ ...base, withdrawMemo: 'ref', withdrawMemoType: 'text' })).toEqual(Memo.text('ref'));
    expect(withdrawMemo({ ...base, withdrawMemo: 'ref' })).toEqual(Memo.text('ref'));
  });

  it('is empty when the anchor asked for none', () => {
    expect(withdrawMemo({ id: '1', kind: 'withdraw', status: 'x' })).toBeNull();
  });
});

describe('defaultAsset', () => {
  it('prefers XLM, the asset every circle settles in, when the anchor moves it', () => {
    expect(defaultAsset(anchor, 'deposit')?.code).toBe('native');
  });

  it('falls back to the first asset that can move in that direction', () => {
    // XLM cannot be withdrawn at this anchor, so the first withdrawable wins.
    expect(defaultAsset(anchor, 'withdraw')?.code).toBe('SRT');
  });

  it('is undefined when nothing moves that way', () => {
    expect(defaultAsset({ ...anchor, assets: [] }, 'deposit')).toBeUndefined();
  });
});

describe('status vocabulary', () => {
  it('has a label for every terminal status, so the panel never shows a raw code at the end', () => {
    for (const status of TERMINAL_STATUSES) {
      expect(STATUS_LABELS[status], status).toBeDefined();
    }
  });
});
