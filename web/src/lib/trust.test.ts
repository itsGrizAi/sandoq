import { describe, expect, it } from 'vitest';

import { STROOPS_PER_XLM, trustGap } from '../config';

const xlm = (amount: number) => BigInt(amount) * STROOPS_PER_XLM;

describe('trustGap', () => {
  it('is what a member gains by taking their pot and never paying in', () => {
    // Three seats at 100 each: the pot is 300, the stake covers 100 of it.
    expect(trustGap(xlm(100), xlm(100), 3)).toBe(xlm(200));
  });

  it('is zero once the stake covers a whole pot', () => {
    expect(trustGap(xlm(100), xlm(300), 3)).toBe(0n);
  });

  it('does not go negative when the stake is more than the pot', () => {
    expect(trustGap(xlm(100), xlm(900), 3)).toBe(0n);
  });

  it('grows with the circle, since a bigger circle is a bigger pot', () => {
    expect(trustGap(xlm(10), xlm(10), 5)).toBe(xlm(40));
    expect(trustGap(xlm(10), xlm(10), 20)).toBe(xlm(190));
  });
});
