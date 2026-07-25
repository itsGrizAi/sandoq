# Sandoq — demo video script

A full product walkthrough (~2 min) for Level 5. **[SHOW]** is what's on screen,
**[SAY]** is the line to read. Let the Freighter pop-ups appear on camera — the
signatures are the proof of real wallet interactions, so capture the **display**,
not just the browser window; a wallet pop-up is its own window and a window
capture will miss it.

Recording the screen silently and adding a voice-over afterwards? The narration
alone, with per-section timings, is in
[docs/demo-narration.md](docs/demo-narration.md).

Live app: <https://itsgriznft.github.io/sandoq/> · Pitch deck: <https://itsgriznft.github.io/sandoq/pitch.html>

---

## 1 · The problem — 0:00–0:15

**[SHOW]** The Sandoq home page.

**[SAY]**
> "This is Sandoq. All over the world people save in rotating circles — a group puts in a fixed
> amount each round, and the whole pot goes to one member at a time until everyone's been paid.
> It's called esusu, chit fund, tanda — in Iran, sandoq. But they run on trust: the organizer can
> run off with the pot. Sandoq moves that trust into a smart contract on Stellar."

## 2 · The product, live — 0:15–0:30

**[SHOW]** Scroll the home page: stats bar, circle cards, live activity feed.

**[SAY]**
> "Everything here is read live from the blockchain — the stats, every circle, and this activity
> feed. Nobody, not even me, holds the money. The contract escrows every stake and pays every pot."

## 3 · Onboarding — anyone can start — 0:30–0:45

**[SHOW]** Click **New here?** → the four-step guide.

**[SAY]**
> "For someone who's never used a wallet, there's a guided setup: install Freighter, get free
> testnet XLM, connect, and join — four steps, about two minutes. Onboarding is the whole game, so
> we made it frictionless."

## 4 · Connect & join — the circle fills on camera — 0:45–1:15

**[SHOW]** Connect wallet → Freighter → Approve. Open **Office lunch fund** (2/3 seats) → **Join** →
sign in Freighter. The seat lands, the circle hits 3/3 and flips **Filling → Running**, and the
⏰ reminder appears telling you what you owe.

**[SAY]**
> "Let me join one. I connect Freighter, pick an open circle, and press Join — that stakes a small,
> refundable collateral. I sign… and that's a real transaction on Stellar testnet. That was the last
> seat, so the circle just started — and because I'm a member now, it's telling me what I owe this
> round and counting down to the deadline. Users asked for exactly that nudge, so we built it."

**[SHOW]** Optionally press **Contribute 5 XLM** and sign — a second real transaction.

## 5 · A circle mid-rotation — 1:15–1:35

**[SHOW]** Back to circles → open **Neighbors sandoq** (Running, round 2 of 3). Point at the seat
grid: paid / due / next-payout, and the *received* badge on the member already paid out.

**[SAY]**
> "Here's one further along. The seats are the payout order — who's paid, who's due, who's next —
> and this member already received their round's pot on-chain. A missed round is covered from that
> member's own stake before it can ever touch the recipient."

## 6 · On-chain feedback — 1:35–1:50

**[SHOW]** Footer → **Give feedback** → rating + role → sign → it appears in the Community list.

**[SAY]**
> "Feedback is on-chain too. I rate it and sign, and it's a public, verifiable record — the summary
> here is read straight from the contract. Every change we ship traces back to feedback like this."

## 7 · Trust model + close — 1:50–2:05

**[SHOW]** Footer → **Analytics** (on-chain metrics + event stream). Optionally open a transaction
on Stellar Expert.

**[SAY]**
> "There's a built-in analytics and monitoring panel, and everything Sandoq does is a real
> transaction you can trace on the ledger. Sandoq doesn't create trust between strangers — it
> removes the need for a trusted organizer. The savings circle you already know, made unbreakable.
> Thanks for watching."

---

### The state this script expects

Testnet is already staged for it — these circles are live right now:

| Circle | State | Used in |
|---|---|---|
| **Office lunch fund** `CBN7PM4F…IEES` | Filling, **2 of 3 seats**, 5 XLM every 12 hours | §4 — your join takes the last seat, so it starts on camera and the ⏰ reminder is *yours* |
| **Neighbors sandoq** `CBWAYGCU…2RRK` | Running, round 2 of 3, one member already paid out | §5 — seat grid, *received* badge |
| **Pilot circle** · **Community sandoq** | Filling, open seats | §2 — a home page with something on it |
| **Family circle** `CC5XZRGT…UBCR` | 🔒 invite-only, Filling | optional — the lock badge and invite gating |

If **Office lunch fund** is already full by the time you record, make another the same way:

```bash
stellar contract invoke --id CB73QYCRM7BXR52W6FUTNCF6SVLAD26QTLUJCPMOKVKI7A6FPGNBVHRC \
  --source deployer --network testnet -- create \
  --organizer "$(stellar keys address deployer)" --name "Office lunch fund" \
  --contribution 50000000 --period 43200 --size 3 --collateral 50000000 \
  --fill_deadline $(( $(date +%s) + 604800 )) --private false
# then have two identities take seats, leaving one open:
stellar contract invoke --id <new circle> --source alice --network testnet -- join --member "$(stellar keys address alice)"
stellar contract invoke --id <new circle> --source bob   --network testnet -- join --member "$(stellar keys address bob)"
```

### Recording notes

- Freighter must be **unlocked and on Testnet**, with a funded account — grab XLM from
  [friendbot](https://lab.stellar.org/account/fund) if the balance is thin.
- Record a 1600×1000 browser window; that keeps the two-column circle detail on screen without
  scrolling mid-sentence.
- Let the Freighter pop-ups sit on camera for a beat — the signatures are the proof of real wallet
  interaction, and they are what the reviewer is looking for.
- If a step fails, just retry — every action is idempotent from the UI's point of view.
- Under two-and-a-half minutes is ideal. Sections 3–6 are the core; 1–2 and 7 are the frame.
- **Afterwards**, refresh the user record so the new transactions land in the repo:

  ```bash
  node scripts/export-users.mjs && python scripts/build-workbook.py
  ```
