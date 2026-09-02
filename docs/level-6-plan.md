# Level 6 (Black Belt) — what it needs and in what order

The official requirement, from the program page:

> Your project should have a **Twitter profile** with posts related to the project, onboard at least
> **30+ new users**, and include **more advanced features** compared to your previous Level 5
> submission. Launch your application on **Stellar Mainnet**, onboard real mainnet users
> (**at least 20**), complete **security reviews or audits**, and grow real ecosystem adoption.

The task page itself is more specific than that summary. Its checklist, against where Sandoq stands
(Level 5 was **approved** in the July period; this is a September-period submission):

| Required | Status |
|---|---|
| Public GitHub repository | ✅ |
| 30+ meaningful commits | ✅ well past it |
| Live **mainnet** application | ⬜ testnet only |
| Mainnet contract addresses | ⬜ |
| Proof of 20+ **mainnet** users, with transaction activity | ⬜ |
| Audit **or** security review *approved by mentors/team* | 🔶 [review written](security-review.md); needs the team's sign-off |
| Twitter/X launch post link | ⬜ drafts below; the account is Milad's to create |
| Demo video link | ✅ [screenshots/demo.mp4](../screenshots/demo.mp4) |
| Technical documentation | ✅ README + docs/ |
| User guide | ✅ [ONBOARDING.md](../ONBOARDING.md) |
| Community contribution link — blog, tutorial, workshop, OSS, or session | ⬜ |
| Google Form + Excel export linked in README | ✅ carried from Level 5 |

**And one advanced feature, mandatory — pick at least one.** ✅ **SEP-24 is built** (see the README's *Cash in, cash out* section): discovery, wallet-signed login, deposit and withdrawal sessions, status polling and the withdrawal payment, verified against SDF's test anchor. The table below is what was weighed:

| Option | Fit for Sandoq |
|---|---|
| Fee sponsorship — gasless transactions via fee bump | Strong. New users arrive with no XLM; a sponsor paying their fees removes the last onboarding wall, which is exactly the problem behind "20 mainnet users". Needs a small relay that holds the sponsor key. |
| Cross-border flows — SEP-24 / SEP-31 anchor | Strongest story. It was in the approved idea essay (diaspora, on/off-ramp) and matches the program's stated priorities. Frontend-only against SDF's test anchor; on mainnet, a real anchor. |
| Multi-signature logic | Weak fit — there is no organizer action worth multi-party approval by design. |
| Account abstraction — smart wallet | Heavy, and orthogonal to the product. |

Recommendation: **SEP-24 first**, because it is the feature the idea was approved on and it makes the
product true to its pitch; fee sponsorship second, because it is what actually gets strangers to
their first transaction. Both count. Doing both is the difference between passing and winning.

The page also says, in so many words: *Level 6 never ends* — finish the requirements, then keep
onboarding and keep improving. It is a monthly cycle, not a gate.

---

## Do not redeploy the factory yet

The single most important constraint, and it is easy to trip over.

Level 5's evidence — `docs/user-activity.csv`, the workbook, the demo video, every contract address
in the README — all points at factory `CB73QYCRM7BXR52W6FUTNCF6SVLAD26QTLUJCPMOKVKI7A6FPGNBVHRC`
and the circles it deployed. Any change to the circle *constructor* or to `factory.create`'s
signature forces a new factory at a new address, and the Level 5 submission's links start
describing something that no longer exists. That already happened once, when invite-only circles
changed the constructor.

So until Level 5 is submitted and judged:

- **Safe:** anything that does not change a signature — new view functions, tighter validation,
  frontend work, `set_circle_wasm` pointing at a rebuilt circle.
- **Not safe:** per-circle token selection, changed constructor arguments, a new factory.

The stablecoin work in step 2 below needs `create` to take a token argument. It is the right next
feature and it is deliberately sequenced *after* the Level 5 verdict.

## Sequence

**1 · Activate the hardened wasm** ✅ *done*

The factory now deploys the reviewed build ([`WasmSet` tx](https://stellar.expert/explorer/testnet/tx/2a8dddbf9a7cf592fa4460712f8debecb0cdcdc8605dcde8a629ffc7e4a35fd6)). Checked live afterwards: a
1-second round is refused, and a new fully-staked circle — "Trustless circle",
`CDWOG5JH6Q3E5CYKCEXJR363WAY3SL7B53MN67ZFLUX4YBKECMU5Y5HA` — reports `trust_gap() = 0` and wears
the badge on the home page next to the eight that need trust. Nothing Level 5 points at changed.

**2 · Stablecoin settlement** *(after the Level 5 verdict)*

Two of the ten survey responses asked for it unprompted, and it is the feature that makes the
product make sense: a savings circle denominated in something that does not move. It also sits
squarely in the program's stated priorities — payments, stablecoins, anchors.

Shape: `factory.create` takes a `token` argument instead of reading one from config; the factory
keeps an allowlist of settlement assets so a circle cannot be pointed at a hostile token; the
create form offers XLM or USDC. Needs a new factory, hence the sequencing.

**3 · Twitter** *(anytime — needs Milad)*

An account for the project, not the person. Drafts below.

**4 · Mainnet** *(gated)*

Work through [the review's "Before mainnet" checklist](security-review.md#before-mainnet) first.
The storage-lifetime question has to be settled, and the settlement asset chosen deliberately.
Mainnet means real money in the escrow, so nothing here should be rushed to hit a belt deadline.

**5 · Users**

30+ new, and 20+ of them on mainnet. The lesson from Level 5's ten responses applies: ask people to
copy their address out of the app's wallet bar rather than typing one, or the record will again
show interest that cannot be verified on chain. See
[docs/user-onboarding.md](user-onboarding.md).

---

## Twitter drafts

Written to be posted as-is. The tone is the same as the README's: explain the thing, do not sell it.

**Pinned / intro**

> Sandoq is a savings circle on Stellar. A group agrees on an amount, everyone pays in each round,
> and the whole pot goes to one member at a time until everyone has been paid.
>
> Billions of people already save this way — esusu, chit fund, tanda, sandoq. The part that breaks
> is the organizer holding the money. So we took the organizer out.
>
> Testnet: itsgriznft.github.io/sandoq

**The demo**

> Three minutes, live on testnet: connect a wallet, take the last seat in a circle so it starts on
> camera, contribute, and read a circle mid-rotation. Every pop-up in it is a real transaction.
>
> [demo video]

**The security review** *(the most interesting thing to post)*

> Reviewed our own contracts before going near mainnet, and found that defaulting was profitable at
> the settings our own demo circles ran.
>
> The rotation doesn't skip a defaulter. So someone who never pays forfeits only their stake and
> still collects one pot. Stake < pot means walking away pays.
>
> Fix wasn't to ban low stakes — that's the whole point for a circle of people who trust each
> other. It was to make the number impossible to miss: trust_gap() is on-chain, the create form
> names it as you type, and every circle carries a trustless / needs-trust badge.
>
> Write-up: [link to docs/security-review.md]

**The honest-numbers post**

> Ten people filled our survey. Nine had real funded testnet accounts. Exactly one had actually
> transacted with our contracts.
>
> Most had typed a wallet address different from the one they connected with. We recorded the gap
> rather than the bigger number, because "users" that can't be verified on chain aren't users.

**On what it's for**

> Sandoq isn't a way to make strangers trustworthy. It removes the need for a trusted organizer —
> which is the layer that actually fails in real savings circles.
>
> Everything else is a dial: stake nothing among family, stake a whole pot among strangers. The
> app now shows you which one you're joining before you commit.
