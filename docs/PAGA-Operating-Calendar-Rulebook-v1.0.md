# PAGA Operating Calendar Rulebook v1.0

**Status:** Canonical reference specification  
**Timezone:** Africa/Johannesburg (SAST)  
**Reference months:** October 2026 (Month 1) and November 2026 (Month 2)  
**Purpose:** Allow another implementation agent to reproduce PAGA's operating-calendar logic, Month 1 reference result, Month 2 continuation, validation gates and carry-forward state.

**Scope split (do not collapse):**

1. **Rules** — what calendars are permitted (this document §§1–7, 11–15).
2. **Fixture** — the exact October / November calendars to reproduce (§§8–10, hashes, books, tie-breaks).
3. **Desk presentation** — how the FX Desk shows a rolling operating-day view and advances conversation UX. Desk sequence, copy and animation are out of scope here; a 14-operating-day desk surface is a view over continuous monthly state, not a capital-cycle reset.

---

## 1. The operating doctrine

PAGA schedules genuine invoice payments gradually, distributes them across legally eligible cards, merchant principals, POS terminals and acquirers, waits for final usable-ZAR evidence, and only increases flow when prior activity supports the increase.

The calendar is not designed to imitate randomness or evade monitoring. It is an internal operating plan for managing concentration, settlement uncertainty, working liquidity and continuity.

Five rules override everything else:

1. No genuine invoice, no payment instruction.
2. Never split an invoice merely to fit a scheduling limit.
3. Capture is not settlement; settlement is not final until ZAR is usable.
4. An unresolved outcome freezes the affected card and forces replanning.
5. A new card, terminal or month does not inherit evidence it has not earned.

---

## 2. Reference network

### 2.1 Cards

| Card ID | Issuer bank | Month 1 status |
|---|---|---|
| `BRICS` | FNB Mozambique | Active |
| `Ginav` | Standard Bank Mozambique | Active |
| `Goblin` | BCI | Active |
| `Kayman` | FNB Mozambique | Active |
| `Vidrotec` | BIM | Active |
| `Wolf` | BCI | Active |

Month 2 adds one configurable card called `NEW_CARD_M2` until its real card ID and issuer are supplied. Renaming this card must not change its cold-start state.

### 2.2 POS terminals and merchant principals

| Terminal ID | Merchant principal | Acquirer | Status |
|---|---|---|---|
| `WolfFNB` | Wolf and Sons | FNB | Live |
| `BricsFNB` | Lemon Economics | FNB | Live |
| `BricsCapitec` | Lemon Economics | Capitec | Live |
| `Imani` | Imani Beauty | FNB | Live |
| `Econometrica` | Econometrica | Capitec | Live |

Important identity rule: `BricsFNB` and `BricsCapitec` are different terminals and acquirers but the same merchant principal, Lemon Economics.

The reference fixture assumes every listed card-terminal combination has a genuine, documented commercial basis. A live implementation must read legal eligibility from the company and merchant register. It must not infer eligibility from this fixture.

### 2.3 Network dimensions

- Month 1: 6 cards, 5 terminals, 4 merchant principals, 2 acquirers.
- Month 2: 7 cards after adding `NEW_CARD_M2`; the same five terminals.
- Econometrica is a live route throughout both months, not a staging or late-period balancing terminal.

---

## 3. Commercial and identity requirements

Every payment instruction must carry:

- `invoiceId`
- `instructionId`
- `economicPaymentId`
- invoice amount and currency
- Mozambique buyer ID
- card ID
- card issuer bank ID
- merchant principal ID
- invoice issuer entity ID
- receivable owner ID
- POS terminal ID
- merchant ID
- acquirer bank ID
- ZAR beneficiary ID
- commercial eligibility reference
- planned SAST attempt time
- current lifecycle state
- root attempt ID and parent attempt ID for a genuine retry

Hard requirements:

- One invoice produces one payment instruction.
- The instruction amount equals the full invoice amount.
- A retry preserves the original invoice and attempt lineage.
- The merchant principal attached to the POS is the default invoice issuer, receivable owner and ZAR beneficiary.
- The planner rejects a card-terminal combination if its commercial eligibility is absent or expired.

---

## 4. Core scheduling limits

These are PAGA internal controls, not published bank or card-network safe harbours.

### 4.1 Payment and network limits

| Rule | Limit |
|---|---:|
| Maximum payment | R15,000 |
| Cold-network daily value, Days 1-3 | R25,000 |
| Established-network daily value | R30,000 |
| Network attempts per operating day | 5 |
| Sunday new intake | 0 |

Days 1-3 apply to a genuinely cold network, not automatically to the first three dates of every calendar month.

**Prospective modeled books (planning only).** When PAGA generates a synthetic invoice book for desk planning, mature established-route invoices are drawn from a deterministic triangular distribution with minimum R8,000, mode R11,500 and maximum R15,000 (target mean about R11,000–R11,500). Cold cards, POSs and routes still use stage A (≤R5,000) and stage B (≤R6,500) before the mature band. Actual live invoices are never enlarged, merged, split or rewritten — modeled invoices stay separate from receivables. Payment counts are not a target; whole invoices are packed under the daily ceilings (typically about two payments per day).

### 4.2 Card limits

| Rule | Limit |
|---|---:|
| Attempts/card/day on cold-network Days 1-3 | 1 |
| Attempts/card/day thereafter | 2 |
| Value/card/day | R15,000 |
| Attempts/card/rolling 7 calendar days | 6 |
| Same-card spacing across all merchants | At least 120 minutes |

### 4.3 Card-principal limits

| Rule | Limit |
|---|---:|
| Same card and merchant principal/day | 1 |
| Same card and merchant principal/rolling 7 days | 3 |

Because both Lemon terminals share one principal, using the same card on Lemon FNB and Lemon Capitec on the same day violates the card-principal rule.

### 4.4 POS limits

| Rule | Limit |
|---|---:|
| Attempts/POS/day during first seven network days | 2 |
| Attempts/POS/day after sufficient clean evidence | 3 |
| Value/POS/day | R15,000 |
| Same-POS spacing | At least 120 minutes |
| Maximum POS share of count | 35% |
| Maximum POS share of value | 35% |

**Measurement windows for POS share:** evaluate both (a) the trailing rolling **7 calendar days** and (b) the **calendar month** to date / full month in reference fixtures. A calendar fails if either window exceeds 35% by count or by value for any single POS.

### 4.5 Acquirer limits

Concentration is **not** a uniform 35% cap on every acquirer. With only FNB and Capitec live, capping both at 35% can cover only 70% and is mathematically impossible.

| Domain | Rule |
|---|---|
| Individual POS | Maximum 35% by count and value over the POS measurement windows in §4.4 |
| Capitec aggregate (`BricsCapitec` + `Econometrica`) | Reference target **25–35%** of the month by count and by value; hard maximum **35%** while Capitec is the minority acquirer |
| FNB aggregate | Expected residual **65–75%** with the current two-acquirer network; **no** contradictory 35% cap on FNB |
| Future network | Revisit acquirer caps when a third acquirer becomes live |

In live operation, the 35% Capitec ceiling remains the hard guardrail. The 25% Capitec lower bound is a reference-fixture balancing condition and must not force traffic onto a degraded route.

### 4.6 Route continuity

An established card should have clean usable-ZAR outcomes through at least:

- 3 terminals;
- 2 merchant principals;
- 2 acquirers.

The clean Month 1 reference fixture deliberately produces stronger coverage:

- all 5 terminals;
- all 4 merchant principals;
- both acquirers;
- at least 2 payments/card/terminal during the month;
- no single terminal exceeds 50% of a card's monthly history.

Sparse resilience is the operational objective. The planner must not force full-mesh activity when a route is commercially invalid, delayed, under review or otherwise unsafe.

### 4.7 Time distribution

- All attempt times are in SAST.
- The same card and the same POS each require at least 120 minutes between attempts.
- No fixed daily time grid may be copied unchanged across the month.
- No 30-minute time bucket may contain more than 20% of monthly planned value.
- A delay, review, decline or reversal invalidates future timing recommendations that depend on the affected route.

---

## 5. Evidence and interruption rules

### 5.1 Lifecycle

Use this order:

`planned -> authorised -> captured -> settlement_credited -> zar_available`

Possible interruption events:

- `declined`
- `delayed`
- `under_review`
- `reversed`
- `recovered`

Rules:

- Authorisation does not imply capture.
- Capture does not imply settlement.
- Settlement credit does not imply usable ZAR unless the funds are final and usable.
- Silence is not success.
- Evidence is append-only.
- A reversal is a compensating event; it does not erase history.

### 5.2 Freeze and replan

If a card has a delayed, under-review, declined, reversed or unresolved payment:

1. Freeze that card.
2. Cancel every later unissued recommendation that depends on that card.
3. Recalculate the remaining day and future calendar.
4. Preserve already-issued instructions and their lineage.
5. Resume the card only after explicit recovery evidence or final usable ZAR.

---

## 6. Working-liquidity rule

Monthly gross movement is not the working-liquidity requirement.

Calculate:

```text
requiredWorkingLiquidity =
  maximumConcurrentUnsettledExposure
  + operatingBuffer
```

For each instant in the schedule:

```text
unsettledExposure(t) =
  sum(issued payment amounts not yet final and usable at t)
```

The operating buffer is an explicit input. The reference explanation uses 15%, but the calendar generator must report the unbuffered exposure and buffer separately.

The planner must output:

- peak unsettled exposure;
- date/time of that peak;
- assumed or observed settlement latency;
- operating buffer percentage and amount;
- required working liquidity;
- usable liquidity remaining;
- effect of a delayed or reversed payment.

---

## 6A. Corridor economics accounting

Quoted corridor rates (units: MZN per ZAR) may be expressed as:

```text
COST = MID × 1.05
SELL = COST × 1.10
```

Those formulas are internally coherent for **quoted** MZN/ZAR. They are not a substitute for realised books.

For every economic payment (and for any month-end / growth decision), record separately:

| Ledger line | Meaning |
|---|---|
| Quoted MZN due | Invoice / cover obligation at the quoted SELL (or applicable quote) |
| Actual MZN received | MZN that actually landed and is reserved / cleared |
| Actual ZAR credited as usable | Amount that reached lifecycle state `zar_available` |
| ZAR paid out | Amount released onward after usable credit (if any) |
| Realised spread | Economics after usable credit, fees and reversals — not merely quoted SELL − COST |
| Fees and reversals | Explicit compensating lines; never erase history |

Do **not** describe the next planning target as “authorised ZAR plus spread.” Growth and reopen capacity are derived only from **realised, usable and reconciled** amounts under the available-liquidity constraint (§6 and §11). Authorised-but-unexecuted or unsettled authority is not earned capital.

---

## 7. Deterministic calendar construction

### 7.1 Operating days

An operating day is Monday through Saturday. Sunday accepts no new invoices but may process settlement evidence.

### 7.2 Payment-book construction

For each operating day:

1. Read that day's target value.
2. Use the required payment count.
3. Select the day's weight pattern.
4. Rotate the pattern by the operating-day index modulo the payment count.
5. Round the first `n - 1` amounts to the nearest R100.
6. Make the final amount the exact residual required to reach the daily target.
7. Reject the book if any payment is above R15,000 or is not backed by a genuine invoice in live mode.

Month 1 weight patterns:

```yaml
four_payment_patterns:
  - [0.31, 0.27, 0.23, 0.19]
  - [0.29, 0.26, 0.24, 0.21]
  - [0.33, 0.25, 0.23, 0.19]

five_payment_patterns:
  - [0.25, 0.22, 0.20, 0.18, 0.15]
  - [0.27, 0.23, 0.19, 0.17, 0.14]
  - [0.24, 0.21, 0.20, 0.19, 0.16]
  - [0.26, 0.21, 0.19, 0.18, 0.16]
  - [0.23, 0.22, 0.21, 0.19, 0.15]
```

Month 2 uses five payments per operating day and patterns whose largest weight is no more than 0.26:

```yaml
five_payment_patterns:
  - [0.25, 0.22, 0.20, 0.18, 0.15]
  - [0.26, 0.23, 0.19, 0.17, 0.15]
  - [0.24, 0.22, 0.20, 0.19, 0.15]
  - [0.25, 0.21, 0.20, 0.18, 0.16]
  - [0.23, 0.22, 0.21, 0.19, 0.15]
```

### 7.3 Time generation

Base times:

```yaml
four_payments_odd_day:  [09:16, 11:10, 13:19, 15:25]
four_payments_even_day: [09:43, 11:43, 13:48, 15:58]
five_payments_odd_day:  [09:10, 10:45, 12:20, 13:55, 15:30]
five_payments_even_day: [09:39, 11:14, 12:49, 14:24, 15:59]
```

For slot index `i`, apply deterministic minute jitter:

```text
jitter = ((dayOfMonth * 7 + i * 11) mod 9) - 4
attemptTime = baseTime + jitter minutes
```

The card/POS allocator must still enforce the 120-minute rule. Adjacent time slots must therefore use different cards and different terminals whenever adjacent slots are less than 120 minutes apart.

### 7.4 Route allocation

Create a binary decision variable for every payment and every legally eligible `(card, terminal)` pair.

Require exactly one pair per payment, then apply every hard constraint in Sections 3-5.

For the clean reference simulation, also require:

- every terminal appears in every calendar segment;
- each terminal has at least 14% of monthly value;
- each terminal has at least 18 Month 1 payments;
- combined Capitec count and value are between 25% and 35%;
- every card uses every terminal at least twice in Month 1;
- each card has between 19 and 24 Month 1 payments.

Reference calendar segments:

1. Days 1-7
2. Days 8-14
3. Days 15-21
4. Days 22-28
5. Days 29-month end

Minimum terminal use by segment in Month 1:

```yaml
days_1_7: 3
days_8_14: 3
days_15_21: 3
days_22_28: 3
days_29_31: 2
```

When several allocations satisfy every rule, choose the solution in this order:

1. Lowest maximum POS rolling value share.
2. Lowest maximum card-terminal route share.
3. Smallest deviation from equal terminal value distribution.
4. Smallest deviation from equal card payment counts.
5. Highest existing evidence score.
6. Lexicographic `(invoiceId, cardId, terminalId)` tie-break.

The tie-break must be deterministic. Do not use system time or an unrecorded random seed.

---

## 8. Month 1 reference fixture: October 2026

### 8.1 Month-level identity

```yaml
month: 2026-10
network_state: cold_start
cards: 6
terminals: 5
merchant_principals: 4
acquirers: 2
operating_days: 27
payments: 95
planned_value_zar: 660000
arithmetic_ceiling_zar: 795000
reference_ledger_sha256: 0d7c1e06653a013491305f320353cb35d53c9c69db2efbfca8320189b5914102
```

### 8.2 Daily targets and payment counts

Under the R15,000 whole-invoice ceiling, early operating days keep denser books so Econometrica can graduate through the R5,000 / R6,500 stages; later days use fewer payments for the same daily targets. Payment counts are not a target — they follow genuine invoice sizes under the ceiling.

| Date | Target | Payments |
|---|---:|---:|
| 2026-10-01 | R20,400 | 5 |
| 2026-10-02 | R19,700 | 5 |
| 2026-10-03 | R22,200 | 5 |
| 2026-10-05 | R24,600 | 5 |
| 2026-10-06 | R25,300 | 5 |
| 2026-10-07 | R23,900 | 5 |
| 2026-10-08 | R26,700 | 5 |
| 2026-10-09 | R24,800 | 3 |
| 2026-10-10 | R25,900 | 3 |
| 2026-10-12 | R23,100 | 3 |
| 2026-10-13 | R26,400 | 3 |
| 2026-10-14 | R24,600 | 3 |
| 2026-10-15 | R25,200 | 3 |
| 2026-10-16 | R25,500 | 3 |
| 2026-10-17 | R23,800 | 3 |
| 2026-10-19 | R25,700 | 3 |
| 2026-10-20 | R24,100 | 3 |
| 2026-10-21 | R25,900 | 3 |
| 2026-10-22 | R24,700 | 3 |
| 2026-10-23 | R25,800 | 3 |
| 2026-10-24 | R23,600 | 3 |
| 2026-10-26 | R26,100 | 3 |
| 2026-10-27 | R24,900 | 3 |
| 2026-10-28 | R25,200 | 3 |
| 2026-10-29 | R23,300 | 3 |
| 2026-10-30 | R25,800 | 3 |
| 2026-10-31 | R22,800 | 3 |

### 8.3 Reference output gates

The Month 1 reproduction passes only if:

- total value is exactly R660,000;
- payment count is exactly 95;
- operating-day count is exactly 27;
- all Sundays have zero new intake;
- daily values equal the table above;
- every payment is no more than R15,000;
- every invoice and instruction ID is unique;
- every card uses all five terminals, four principals and two acquirers;
- Econometrica appears in all five calendar segments;
- all rolling, daily, spacing and concentration gates pass;
- the canonical reference allocator produces the stated ledger hash.

---

## 9. Month-end carry-forward

Calendar month-end is a reporting boundary, not a state reset.

Persist and carry into Month 2:

- every payment and evidence event from the trailing seven calendar days;
- trailing 30-day card, terminal, merchant and acquirer concentration;
- per-route usable-ZAR success history;
- settlement-latency observations;
- pending exposure;
- open delays, reviews and reversals;
- frozen-card status;
- available usable liquidity;
- working-liquidity requirement;
- invoice backlog;
- terminal and card maturity;
- current network ceiling;
- current rulebook version.

Expire only:

- rolling-window events after they move beyond their window;
- time-limited commercial eligibility after its recorded expiry;
- temporary holds after explicit resolution.

Never expire historical settlement evidence merely because a month ended.

---

## 10. Month 2 continuation fixture: November 2026

### 10.1 Growth calculation

Month 2 is an established-network reference fixture with all Month 1 payments modeled as final usable ZAR and growth explicitly authorised.

```text
evidenceSupportedTarget = Month1 usable value * 1.10
                        = R660,000 * 1.10
                        = R726,000

November arithmetic ceiling = 25 operating days * R30,000
                             = R750,000

Month2 target = min(R726,000, R750,000)
              = R726,000
```

The 10% is an authorised upper growth allowance for this reference fixture, not an automatic live rule.

### 10.2 Month-level identity

```yaml
month: 2026-11
network_state: established
existing_cards: 6
new_cards: 1
new_card_id: NEW_CARD_M2
terminals: 5
merchant_principals: 4
acquirers: 2
operating_days: 25
payments: 95
planned_value_zar: 726000
arithmetic_ceiling_zar: 750000
```

### 10.3 Daily targets

Early Month 2 days keep denser books for `NEW_CARD_M2` stage A/B; later days use fewer whole-invoice payments under the R15,000 ceiling.

| Date | Target | Payments |
|---|---:|---:|
| 2026-11-02 | R28,340 | 5 |
| 2026-11-03 | R29,340 | 5 |
| 2026-11-04 | R29,640 | 5 |
| 2026-11-05 | R28,640 | 5 |
| 2026-11-06 | R29,840 | 5 |
| 2026-11-07 | R28,840 | 5 |
| 2026-11-09 | R29,440 | 5 |
| 2026-11-10 | R28,540 | 5 |
| 2026-11-11 | R29,740 | 5 |
| 2026-11-12 | R28,740 | 5 |
| 2026-11-13 | R29,540 | 3 |
| 2026-11-14 | R28,440 | 3 |
| 2026-11-16 | R29,240 | 3 |
| 2026-11-17 | R28,240 | 3 |
| 2026-11-18 | R29,940 | 3 |
| 2026-11-19 | R28,940 | 3 |
| 2026-11-20 | R29,390 | 3 |
| 2026-11-21 | R28,590 | 3 |
| 2026-11-23 | R29,690 | 3 |
| 2026-11-24 | R28,790 | 3 |
| 2026-11-25 | R29,790 | 3 |
| 2026-11-26 | R28,490 | 3 |
| 2026-11-27 | R29,140 | 3 |
| 2026-11-28 | R28,140 | 3 |
| 2026-11-30 | R28,540 | 3 |

### 10.4 New-card ramp

`NEW_CARD_M2` is cold even though the network is established.

Stage A, before three clean usable-ZAR outcomes:

- maximum one attempt/day;
- maximum R5,000/attempt;
- no second attempt until the prior outcome is usable ZAR;
- begin with commercially valid routes across more than one principal where possible.

Stage B, after three but before seven clean usable-ZAR outcomes:

- maximum two attempts/day;
- at least 120 minutes apart;
- maximum R6,500/attempt;
- maximum R12,000/day;
- no increase while any outcome is unresolved.

Stage C, after at least seven clean outcomes across at least two principals and two acquirers:

- standard card limits may apply;
- the card remains subject to rolling seven-day limits and all concentration gates.

The new card initially reduces load on existing cards. It does not itself authorise a higher network ceiling.

### 10.5 Month 2 reproduction gates

The Month 2 reproduction passes only if:

- Month 1 trailing state is loaded before 2 November planning;
- total value is exactly R726,000;
- payment count is exactly 95;
- daily values equal the table above;
- every Sunday has zero new intake;
- the network does not repeat cold-network Days 1-3;
- `NEW_CARD_M2` follows its individual ramp;
- existing cards retain their Month 1 evidence;
- Econometrica participates throughout the month;
- combined Capitec concentration remains no more than 35%;
- every interruption rule remains active;
- all daily, rolling, spacing, legal and accounting gates pass.

---

## 11. Growth after Month 2

For any later month:

```text
priorMonthFinalUsableValue =
  sum(ZAR that reached zar_available and remains reconciled after fees/reversals)

candidateTarget = priorMonthFinalUsableValue * (1 + authorisedGrowthRate)

monthTarget = min(
  candidateTarget,
  genuineInvoiceDemand,
  liquiditySupportedCapacity,
  cardCapacity,
  eligibleRouteCapacity,
  POSCapacity,
  acquirerConcentrationCapacity,
  networkDailyCeiling * operatingDays
)
```

Rules:

- `authorisedGrowthRate` defaults to zero.
- It may be set as high as 10% only after an explicit review or configured authority.
- Base growth only on realised, reconciled settlement and realised margin (§6A). Do not add unsettled authority or merely quoted spread.
- A new card or POS adds redundancy first, not automatic volume.
- A deteriorating route, unresolved exposure or reduced liquidity holds or lowers the target.
- When the R30,000 daily network ceiling binds, additional cards improve resilience but do not increase gross movement.
- Before treating a month (or planning window) as closed for growth, every issued instruction must be final (`zar_available`) or explicitly resolved, and the books must reconcile.

---

## 12. Required outputs

Every calendar generation must return:

1. Full payment ledger.
2. Daily operating calendar.
3. Card volumes, counts and route coverage.
4. POS volumes, counts and concentration.
5. Acquirer concentration.
6. Rolling seven-day snapshots.
7. Thirty-minute time-bucket distribution.
8. Evidence and interruption state.
9. Peak unsettled exposure and required working liquidity.
10. Month-end carry-forward snapshot.
11. Validation report with every hard gate.
12. Deterministic input and output hashes.

Required payment-ledger fields:

```yaml
- date
- timeSast
- invoiceId
- instructionId
- economicPaymentId
- amountZar
- cardId
- issuerBankId
- merchantPrincipalId
- terminalId
- merchantId
- acquirerBankId
- legalEligibilityRef
- lifecycleState
- outcome
- rootAttemptId
- parentAttemptId
```

---

## 13. Validation order

Run validation in this order and stop on any failure:

1. Commercial identity and legal eligibility.
2. One invoice, one full-value instruction.
3. Date, operating-day and Sunday rules.
4. Payment and daily network limits.
5. Card daily and rolling limits.
6. Card-principal daily and rolling limits.
7. POS daily and rolling limits.
8. Acquirer concentration.
9. Time spacing and time-bucket concentration.
10. Route-continuity requirements.
11. Lifecycle and interruption consistency.
12. Working-liquidity reconciliation.
13. Month total and payment count.
14. Month-end carry-forward completeness.
15. Deterministic replay hash.

No report may display `PASS` when an earlier validation stage failed.

---

## 14. Agent handoff instruction

Give the following instruction with this rulebook:

> Implement the calendar exactly from PAGA Operating Calendar Rulebook v1.0. Treat October 2026 as the cold-start reference month and November 2026 as its continuous successor. Preserve the five live terminals, including Econometrica throughout both months. Generate genuine whole-invoice payment books, apply all legal, velocity, spacing, concentration, evidence, interruption and liquidity rules, and carry state across the month boundary. Do not reset network learning on 1 November. Add one individually cold card in Month 2. Return the full ledgers, calendars, validation reports, carry-forward snapshot and deterministic hashes. If the production code cannot satisfy a rule, report the exact conflict rather than weakening the rule or silently changing the target.

---

## 15. Interpretation boundary

Passing this rulebook means that a modeled calendar satisfies PAGA's internal operating constraints. It does not establish that a bank, acquirer or card network has approved the activity, and it does not replace contractual, regulatory, merchant-category, invoice, tax or source-of-funds requirements.

