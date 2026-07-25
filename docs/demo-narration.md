# Demo narration — voice-over script

The spoken half of [VIDEO_SCRIPT.md](../VIDEO_SCRIPT.md), with the stage directions stripped out so
it can be pasted straight into a text-to-speech tool. Record the screen silently, generate the
voice-over from this, and lay it over the footage.

**Total: 330 words, about 2 minutes 15 seconds** at an unhurried 150 words per minute.

| # | Section | Words | Hold the shot for |
|---|---|---|---|
| 1 | The problem — home page, still | 68 | ~27s |
| 2 | The product — scroll the home page | 32 | ~13s |
| 3 | Onboarding — the four-step guide | 35 | ~14s |
| 4 | Connect, join, the circle starts | 70 | ~28s |
| 5 | A circle mid-rotation | 43 | ~17s |
| 6 | On-chain feedback | 35 | ~14s |
| 7 | Analytics and close | 47 | ~19s |

Generate one clip per section rather than one long take — each clip then drops onto its own shot and
a retake costs one section instead of the whole thing.

---

## 1 · The problem

This is Sandoq. All over the world people save in rotating circles — a group puts in a fixed amount
each round, and the whole pot goes to one member at a time until everyone's been paid. It's called
esusu, chit fund, tanda — in Iran, sandoq. But they run on trust: the organizer can run off with the
pot. Sandoq moves that trust into a smart contract on Stellar.

## 2 · The product, live

Everything here is read live from the blockchain — the stats, every circle, and this activity feed.
Nobody, not even me, holds the money. The contract escrows every stake and pays every pot.

## 3 · Onboarding

For someone who's never used a wallet, there's a guided setup: install Freighter, get free testnet
XLM, connect, and join — four steps, about two minutes. Onboarding is the whole game, so we made it
frictionless.

## 4 · Connect and join

Let me join one. I connect Freighter, pick an open circle, and press Join — that stakes a small,
refundable collateral. I sign… and that's a real transaction on Stellar testnet. That was the last
seat, so the circle just started — and because I'm a member now, it's telling me what I owe this
round and counting down to the deadline. Users asked for exactly that nudge, so we built it.

## 5 · A circle mid-rotation

Here's one further along. The seats are the payout order — who's paid, who's due, who's next — and
this member already received their round's pot on-chain. A missed round is covered from that
member's own stake before it can ever touch the recipient.

## 6 · On-chain feedback

Feedback is on-chain too. I rate it and sign, and it's a public, verifiable record — the summary
here is read straight from the contract. Every change we ship traces back to feedback like this.

## 7 · Analytics and close

There's a built-in analytics and monitoring panel, and everything Sandoq does is a real transaction
you can trace on the ledger. Sandoq doesn't create trust between strangers — it removes the need for
a trusted organizer. The savings circle you already know, made unbreakable. Thanks for watching.

---

## Notes for the voice generator

**Pronunciation.** English text-to-speech will not guess these. The audio is all that matters, so
respell them in the input if the first take sounds wrong:

| Written | Say it as |
|---|---|
| sandoq | san-**doog** |
| esusu | eh-**soo**-soo |
| tanda | **tahn**-dah |
| XLM | ex-el-em |
| Freighter | **fray**-ter |

**Pacing.** The punctuation is already doing the work: em dashes and colons read as short beats, and
the ellipsis in section 4 is the pause where the wallet pop-up appears. Don't add markup — plain
text tracks the written script, so the two stay in sync.

**Tone.** Explaining something you built to one interested person. Not an advertisement — the
product's claim is that it removes a failure mode, and overselling undercuts that.
