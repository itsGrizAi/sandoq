# Security review — Sandoq contracts

An internal review of the three Soroban contracts before any mainnet deployment, covering
`circle`, `factory` and `feedback`. Level 6 asks for a security review; this is it, written as
findings rather than reassurance.

**Reviewed:** `contracts/circle`, `contracts/factory`, `contracts/feedback` — 2,527 lines.
**Method:** a line-by-line read of every entry point, then a proof-of-concept test for each
suspected issue *before* any fix was written. Every finding below was reproduced first; none are
theoretical.
**Result:** three issues found, all three fixed, each pinned by a regression test.

These contracts hold other people's savings. On testnet a mistake costs nothing; on mainnet it
costs the pot. Everything here is written with the second case in mind.

---

## Findings

### 1 · Defaulting is profitable at low stakes — critical

The rotation does not skip a member who stops paying. Their miss is covered from their stake, and
when their turn comes they still receive a pot. So a member who never contributes forfeits only
their stake and still collects once. Whenever the stake is smaller than a full pot, that trade
pays, and the honest members absorb the difference.

This is not an implementation bug — the code does what it documents. It is a *parameter* trap, and
it was live: every demo circle ran a stake equal to a single contribution.

Reproduced at exactly those settings — three seats, 100 in per round, 100 staked:

| | staked | paid in | received | net |
|---|---|---|---|---|
| Alice — never contributes | 100 | 0 | 300 | **+200** |
| Bob | 100 | 300 | 200 | −200 |
| Carol | 100 | 300 | 200 | −200 |

Alice opens with 10,000, ends with 10,200, and never pays a round.

**Fixed** by making the number impossible to miss rather than by banning it. Low stakes are the
point for a circle of people who already trust each other — that is what Sandoq is *for*, and
forcing full collateral would delete the product. So the exposure is computed and published
instead:

```text
trust_gap = max(0, size × contribution − collateral)
```

- `circle.trust_gap()` — a new on-chain view, readable by anyone, no frontend needed.
- The create form shows it live as the terms are typed, naming the exact amount a defaulter would
  gain and the stake that removes it.
- Every circle card and detail view carries a **trustless** or **needs trust** badge, so nobody
  stakes into a circle without seeing which kind it is.

`the_trust_gap_is_exactly_what_a_freeloader_walks_away_with` runs the whole freeloading rotation
and asserts the realised profit equals `trust_gap` to the token.

### 2 · An unbounded round length strands every stake — high

`period` was validated only as non-zero. Round *n* ends at `start + (n + 1) × period`, and these
contracts build with `overflow-checks = true`, so a period near the clock limit makes that
multiplication panic. Both `contribute` and `settle` compute it, so both fail permanently — and
`reclaim` only pays out once `settle` has reached `Complete`. Collateral is escrowed on join and
can never come back out.

Reproduced: a circle at `period = u64::MAX` accepts all three joins, escrows 300, then rejects
every `contribute` and every `settle` forever.

**Fixed** with `MIN_PERIOD..=MAX_PERIOD` — one hour to 365 days — in both the circle constructor
and `factory.create`, so bad terms fail before anyone pays a deployment fee.

The lower bound matters as much as the upper one. A one-second round expires before anyone can pay,
which would let an organizer take the first seat, settle immediately, and collect every other
member's slashed stake as the round-0 pot.

### 3 · One circle could take the registry down for everyone — high

`factory.stats()` sums `contribution × size × size` across every circle. `create` accepted any
positive contribution, so a single circle carrying an absurd one overflowed the total and panicked.
Since `stats` walks all of them, that one circle broke the read for everybody — and the frontend's
home page opens with `stats()`, so the whole app goes blank.

Cost to the attacker: one `create` call. No funding, no joining, no stake.

Reproduced: one ordinary circle plus one griefing circle, after which `stats()` fails while
`listing()` still works — the asymmetry that made it worth checking both.

**Fixed** on both sides. `create` caps amounts at `i64::MAX`, which no Stellar asset can exceed in
its own units, so nothing real is refused. And `stats` now sums with saturating arithmetic, because
bounds added today cannot reach circles deployed yesterday.

---

## Checked and found sound

- **Custody.** No path lets the organizer, the factory or the admin move member funds. `settle` is
  a permissionless crank, `reclaim` pays only its caller, and the factory stores a wasm hash and
  never holds a balance.
- **The money invariant.** The contract's balance always equals outstanding collateral plus the
  unsettled round's contributions, asserted after every state change across the lifecycle tests.
- **Double payment and replay.** `Paid(round, member)` is per round and per member; `contribute`
  rejects a second payment, a closed round, and a non-member.
- **Reentrancy.** Soroban forbids reentrant calls at the host level, so the token transfers inside
  `settle`'s loop cannot re-enter it.
- **Rounding.** Pots are integer sums with no division; a rotation neither loses nor mints a unit.
- **Access control.** `allow` needs the organizer, `set_circle_wasm` needs the admin, and `join`,
  `leave`, `contribute` and `reclaim` each need the subject's own signature.
- **Private circles.** A non-invited address is refused on-chain, not merely hidden in the UI.
- **Deployment addresses.** The salt combines organizer and index, so two circles cannot collide.

## Known limits, not defects

- **The token is trusted.** A circle is only as sound as the asset it settles in. On mainnet, use
  the canonical SAC for XLM or a real issuer's USDC — a hostile token can freeze a circle, and no
  contract-side check prevents that.
- **Storage lifetime versus round length.** A round's `Paid` entries and each `MemberState` are
  extended 30 days on write and read again at the next settle. Rounds longer than that window could
  archive an entry before it is read, but this was not reproducible in the test harness, which does
  not evict — so it is flagged, not claimed. `MAX_PERIOD` still allows a 365-day round; before
  offering one on mainnet, either derive entry TTLs from the circle's own period or bring the cap
  nearer the 30-day window.
- **Catch-up settles.** A circle left unsettled across several periods can be advanced round by
  round by anyone, slashing an absent member once per round in quick succession. That is the
  intended crank, but going offline for two rounds costs two rounds of collateral.
- **Aggregate caps.** `listing` and `stats` visit at most 50 circles, `Summary` at most 200
  entries. Past that the totals are a documented lower bound rather than a wrong answer.

## Before mainnet

1. **Point the factory at the hardened wasm.** Uploaded to testnet as
   `464c9433bf0e94ab38a0da05c6b12f7f3ff873f87b0c17d679c05f3a701fe212`, but not yet activated:

   ```bash
   stellar contract invoke --id CB73QYCRM7BXR52W6FUTNCF6SVLAD26QTLUJCPMOKVKI7A6FPGNBVHRC \
     --source deployer --network testnet -- \
     set_circle_wasm --wasm 464c9433bf0e94ab38a0da05c6b12f7f3ff873f87b0c17d679c05f3a701fe212
   ```

   Circles already deployed keep running the code they were created with, so the existing testnet
   circles still carry the unbounded-period and unbounded-amount versions. Only new ones are fixed.
2. Settle the storage-lifetime question above if long rounds are to be offered at all.
3. Choose the settlement asset deliberately and pin it in `web/src/config.ts`.
4. Get an external audit. This review was written by the same party that wrote the code, which is
   worth exactly what that is worth.

## Test coverage

60 contract tests — 36 circle, 14 factory, 10 feedback — and 53 frontend tests, all green. The
findings above are pinned by:

| Test | Finding |
|---|---|
| `the_trust_gap_is_exactly_what_a_freeloader_walks_away_with` | 1 |
| `trust_gap_is_zero_only_when_the_stake_covers_a_whole_pot` | 1 |
| `a_period_near_the_clock_limit_is_refused` | 2 |
| `an_instant_round_is_refused` | 2 |
| `create_refuses_terms_that_would_strand_or_grief` | 2, 3 |
| `stats_saturates_rather_than_overflowing` | 3 |
