export const FORMULATION = {
  title: "Expected-value formulation",
  summary:
    "EV mode charges expected interruption cost without skipping days. Monte Carlo realises downtime. Lookahead (default on) chooses today’s core and organic activity by a rolling L-day policy rollout: today’s myopic EV plus the continuation the production policy would actually follow. Organic revenue and expense are genuine exogenous activity, not created by the optimiser.",
  equations: [
    {
      name: "Gross profit",
      latex: "G_t = (V^{\\mathrm{core}}_t + R^{\\mathrm{org}}_t)\\, m",
      note: "m is gross margin. Organic expense is genuine spend and is not subtracted from strategy P&L; it only contributes observed activity and history. Core volume is capped by that day’s genuine available demand D_t; there is no volume-margin curve.",
    },
    {
      name: "Genuine available demand",
      latex: "D_t = \\sum_{k=1}^{N_t} s_{t,k},\\quad N_t\\sim\\mathrm{Poisson}(\\lambda)\\ \\text{on Mon–Fri},\\quad N_t=0\\ \\text{on Sat–Sun}",
      note: "Ticket sizes s are drawn in the configured range (expected days use the average ticket). The policy sees today’s realized D_t; lookahead continuation uses E[D] so it is not omniscient about later days. Seeded streams keep paths reproducible.",
    },
    {
      name: "Feasible core action",
      latex: "0 \\le V_t \\le \\min(K_t, D_t),\\quad V_t = \\sum_{k\\in S_t} s_{t,k}",
      note: "S_t is a subset of whole tickets. R0 is a valid day. Tickets are not split to manufacture equal card/POS shares. Operating hours 09:00–17:00 are the arrival window; times are exogenous, not a randomized schedule.",
    },
    {
      name: "Bank operating rules / feasibility layer (hard issuer constraints)",
      latex: "\\mathcal A^{\\mathrm{bank}}_t=\\{a\\in\\mathcal A_t:\\ \\forall\\,\\text{tx}\\in\\mathrm{pack}(a)\\ \\ \\mathrm{uses}_t(\\mathrm{card})\\le 1,\\ \\text{one tx per economic payment},\\ \\neg\\mathrm{declined}(\\mathrm{card},\\mathrm{pay}),\\ \\mathrm{invoice}\\ \\text{on file},\\ \\mathrm{PIN}\\wedge\\mathrm{cardPresent}\\},\\quad a^\\star_t=\\arg\\max_{a\\in\\mathcal A^{\\mathrm{bank}}_t}Q",
      note: "Runs on the realized packed plan (whole genuine tickets, actual cards / POS / amounts / times) before Q_base, Thompson ranking, rolling-Q or MPC. Bank wording encoded as hard rules: no split economic payment; one eligible purchase per card per day across core + organic; no same-card retry of a declined payment (broader duration is a labelled option); supporting invoice required; PIN-present / card-present flow. A repeated identical genuine amount is flagged / deferred, never modified. Infeasible plans get no economic, continuity, VOI or Thompson credit; the rules never enter Δ_G, θ*_econ, the posterior or VOI. Amounts are never split, padded or randomised.",
    },
    {
      name: "Banker-identified continuity features and model hypotheses",
      latex: "\\mathrm{HV}=\\mathbb 1[s>10{,}000],\\quad F_{\\mathrm{HV}}=1+c_{\\mathrm{HV}}\\,\\mathrm{HVshare}_{1d},\\quad F_{\\mathrm{loc}}=1+c_{\\mathrm{loc}}(1-\\mathrm{localShare}_{14d})",
      note: "Banker-identified (not bans): payments above R10,000 are high value; zero local-card activity is a flag; repeat use of the same card is a flag. Tracked on the ledger over 1d / 7d / 14d. c_HV and c_loc default to 0 (diagnostics in the hazard decomposition until calibrated). Local volume is never manufactured to improve the mix. Existing coefficients (p0, γ, maturity, durations, profile fit) are unchanged.",
    },
    {
      name: "Rolling persistence / repeat (model hypothesis; card level and pair level kept separate)",
      latex: "e_c=\\frac{w_1\\,\\mathbb 1[\\text{card used prev. op. day}]+w_7\\,\\mathrm{activeShare}^{c}_{7d}+w_{14}\\,\\mathrm{activeShare}^{c}_{14d}}{w_1+w_7+w_{14}},\\quad e_{cp}=\\frac{p_1\\,\\mathbb 1[\\text{pair used prev. op. day}]+p_7\\,\\mathrm{activeShare}^{cp}_{7d}+p_{14}\\,\\mathrm{activeShare}^{cp}_{14d}}{p_1+p_7+p_{14}},\\quad F_{\\mathrm{card\\,rep}}=1+c_{\\mathrm{card}}\\textstyle\\sum_c s_c e_c,\\ F_{\\mathrm{pair\\,rep}}=1+c_{\\mathrm{pair}}\\sum_{cp} s_{cp} e_{cp}",
      note: "Same-day repeat stays a hard rule (rule 5). Nearby-day repetition is a continuity cost, not a ban: the optimizer pays F_card_repeat and F_pair_repeat and decides whether reuse is still worth it. Active shares divide by operating weekdays in the prior 7d / 14d window; s are today's volume shares. Same card × same POS carries the stronger signal (c_pair > c_card). w1 > w7 > w14, p1 > p7 > p14 and both coefficients are illustrative / uncalibrated model hypotheses — the banker named the flag, not the windows or weights. They appear as their own rows in the hazard decomposition and are never merged into the concentration coefficient; they never enter Δ_G.",
    },
    {
      name: "Observed activity",
      latex: "A_t = V^{\\mathrm{core}}_t + R^{\\mathrm{org}}_t + E^{\\mathrm{org}}_t",
      note: "Hazard uses observed activity on the modelled rails. Unallocated organic budget is not a fake transaction.",
    },
    {
      name: "Base hazard (illustrative)",
      latex: "P_{\\mathrm{base},t} = p_0 (A_t / V_{\\mathrm{ref}})^{\\gamma}",
      note: "p0, Vref and γ are scenario inputs, not estimated from bank data. A=0 ⇒ hazard 0.",
    },
    {
      name: "Continuity factors",
      latex: "P_{\\mathrm{raw}} = P_{\\mathrm{base}} \\prod_i F_i",
      note: "Each Fi is visible. Fi=1 is neutral. States (e.g. merchantMaturity=0.35) are separate from coefficients (merchantMaturitySensitivity).",
    },
    {
      name: "Saturating probability",
      latex: "h(V) = h_{\\max} P_{\\mathrm{raw}} / (h_{\\max} + P_{\\mathrm{raw}})",
      note: "Stops multiplicative factors from producing probabilities above 1. Optional cliff: h=1 for V > V_cliff.",
    },
    {
      name: "Expected duration",
      latex: "\\mathbb{E}[D] = (1-q)\\,\\mathbb{E}[D_{\\mathrm{short}}] + q\\,\\mathbb{E}[D_{\\mathrm{long}}]",
      note: "Short and long ranges are uniform on their [min, max]. q is illustrative.",
    },
    {
      name: "Capacity lost if a review hits",
      latex: "f = p_{\\mathrm{sys}} + p_{\\mathrm{card}} f_{\\mathrm{card}} + p_{\\mathrm{pos}} f_{\\mathrm{pos}}",
      note: "f_card = cardFailureCorrelation + (1-ρ_card)·HHI_cards, and likewise for POS. ρ is a scenario input: five cards are not five independent failure domains. Diversification changes f from the actual shares, not by scaling a one-card result.",
    },
    {
      name: "Frozen capital (switch, default on)",
      latex: "K_{\\mathrm{lock}} = f K,\\quad V_{\\mathrm{operable}} = \\min(V,\\, C_{\\mathrm{remain}},\\, K - K_{\\mathrm{lock}})",
      note: "Lost turnover is (V − V_operable)·m. Extra liquidity cost is K_lock · ρ per down day. ρ is illustrative.",
    },
    {
      name: "Myopic EV",
      latex: "\\mathrm{EV}_{\\mathrm{myopic}}(a) = G(a) - h(A)\\,\\mathbb{E}[D]\\, L(a)",
      note: "L(a) is loss per down day on profitable activity. Used as the 180-day CA identity (sum along the path) and as the one-day score when lookahead is off.",
    },
    {
      name: "Lookahead EV (rolling L-day rollout)",
      latex: "Q(s,a_0)=\\mathrm{EV}_{m}(s,a_0)+(1-h)W(s^{\\mathrm{clean}},L-1)+h W(s^{\\mathrm{hit}},L-1)",
      note: "W follows the production continuation: myopic core once transaction evidence exists; while fully cold, core stays 0 and organic revenue is 0-vs-today’s offer. The first-action ranking always uses the receding L-day horizon when lookahead is on — evidence does not collapse L to 1. Never multiply one future daily π by L. Ranking score, not today’s cash.",
    },
    {
      name: "Organic revenue envelope",
      latex: "R^{\\mathrm{avail}}_{t}=R^{\\mathrm{rem}}_{\\mathrm{month}} / d^{\\mathrm{left}}_{\\mathrm{month}}",
      note: "Monthly budget (default R40,000) is offered evenly across remaining days of a 30-day month. Unused remainder rolls within the month and expires at month end. Revenue is a flow.",
    },
    {
      name: "Organic expense (entitlement stock + bring-forward)",
      latex: "B_{t}=\\max(S^{\\pi}_{t},S^{w}_{t}),\\quad E_{t}=E^{\\mathrm{sched}}_{t}+\\Delta^{\\mathrm{bf}}_{t},\\quad 0\\le E_{t}\\le B_{t}",
      note: "Expense is a stock. 25% of day-t GP becomes entitlement from t+1. Weekly floor accrues at R5,000/7 as a minimum (max, not sum). Cadence (threshold / distributed / mixed) sets E^sched. A separate L-day Q probe may bring forward already-accrued stock if that improves the rolling objective; it never creates spend beyond B_t. If Q does not improve: do not accelerate additional expenditure today.",
    },
    {
      name: "Rolling concentration vs persistence",
      latex: "x_{B}=0.50\\,f_{1}+0.30\\,f_{7}+0.20\\,f_{14},\\quad F_{\\mathrm{conc}}=1+c_{\\mathrm{conc}} x,\\quad F_{\\mathrm{persist}}=1+c_{\\mathrm{p}} f^{\\mathrm{days}}",
      note: "Volume f is HHI of Rands (Models A/B/C). Persistence f^days is the same capacity-lost structure on active-day counts, independent of volume. POS1 used 30/30 days at the same 30-day volume as 12/30 days is identical in volume f and different in persistence. F_persist is diagnostic (≡1) unless includePersistenceInHazard is on. consecutiveActiveDays is reported, not stacked on f^days. p0, γ, maturity, durations, and profile fit are unchanged.",
    },
    {
      name: "Pair cover selection",
      latex: "\\max_a\\ \\Big(\\textstyle\\sum_{t<H}\\big[Q^{\\mathrm{base}}_t(a)+\\Delta_G(a\\,|\\,\\tilde\\theta)\\big]-K(a)\\Big)",
      note: "Production: pack whole tickets onto each candidate cover, hold it for H days, score under the sampled model. With the learner off the Δ term is 0 (structural pack-then-score, optionally + VOI). The Cover Mix (2/3/4 cards from V, no next-day pair repeat, card rest) is a benchmark set A, not production policy. p0, γ, maturity, durations, and profile fit are unchanged; nothing here enters h(V) or 180-day CA.",
    },
    {
      name: "Economic residual learner Δ_G (Thompson)",
      latex: "y^{G}_t=G(a_t)+\\Delta_G(s_t,a_t)+\\varepsilon_t,\\quad \\Delta_G=G(a)\\,[z(a)^\\top\\beta+\\textstyle\\sum_i s_i u_i+\\sum_j s_j w_j],\\quad \\tilde\\theta_t\\sim\\mathcal N(\\mu_t,\\Sigma_t),\\quad a^\\star_t=\\arg\\max_a Q(s_t,a\\,|\\,\\tilde\\theta_t)",
      note: "Gross-economic residual only: r_t = y^G − G updates (μ,Σ) by the conjugate rank-1 rule with σ_ε = c_ε·G. z(a) = intercept, log V/Vref, tickets, cards, POS, extra pairs, largest card / POS share, idle run-up (dimensionless); u_i, w_j are share-weighted card / POS effects with independent priors, so an unseen card carries full prior σ. One draw per realized day; every candidate packed action (including R0) and every continuation day is scored under that draw, so exploration is whatever the posterior makes competitive. No rotation, bonus, or target counts. Δ_G never enters h(V), the continuity cost, or the recorded continuity-adjusted EV.",
    },
    {
      name: "Continuity calibration layer (separate posterior)",
      latex: "h_{\\mathrm{true}}=m\\,h_{\\mathrm{struct}},\\quad m\\sim\\Gamma(\\alpha_0,\\alpha_0),\\quad m\\,|\\,K,E\\sim\\Gamma(\\alpha_0+K,\\ \\alpha_0+E),\\quad E=\\textstyle\\sum_t h_{\\mathrm{struct}}(s_t,a_t)",
      note: "Updated only from genuine observed interruption / review outcomes (K hits over exposure E). v1: h_struct is the production risk function and this posterior is diagnostic; usePosteriorContinuityCalibration switches production to h_post = m̂·h_struct. No active probing of thresholds; with α0 = 20 sparse data cannot recalibrate. The economic residual does not compensate for continuity errors because interruption outcomes never enter r_t.",
    },
    {
      name: "Hidden world (offline test only)",
      latex: "\\theta^\\star_{\\mathrm{econ}}\\sim\\text{prior}\\ (\\text{matched}),\\qquad \\log m^\\star(V)=c_0+c_1\\log(V/V_{\\mathrm{ref}}),\\qquad \\mathrm{regret}_t=[Q+\\Delta^\\star](a^{\\mathrm{oracle}}_t)-[Q+\\Delta^\\star](a_t)",
      note: "Two independent hidden components so economic recovery and continuity recovery are tested separately. θ*_econ is drawn from the agent’s pre-registered prior (matched) or with terms the agent cannot express (misspecified). θ*_cont scales the structural hazard; interruption draws are Bernoulli(h_true) and are logged, not applied to the EV path. The agent only sees realized residuals and hits through the observation log; production replaces the hidden world with the real ledger without changing the architecture.",
    },
    {
      name: "Value of information (kernel evidence)",
      latex: "N(z)=\\sum_t k(z,z_t),\\quad k=e^{-\\frac12\\sum (\\Delta_m/\\ell_m)^2},\\quad \\kappa=N/(N+N^\\star),\\quad u=1-\\kappa",
      note: "Continuous posterior, not confirmed-after-one-day. Resource N_i only sums days when i received packed volume. Configuration z is counts/shares/V/idle/time — not card names. Length scales, N*, and prior σ are provisional scenario inputs, not calibrated. Observation log is source-agnostic (simulation or production adapters). T=min(L,8)−1. Λ_res from independent-capacity Δf; Λ_cfg = σ·Pr(flip)·stake. ρ=1 ⇒ resource IV=0. Ranking only: not in h(V) or 180-day CA.",
    },
    {
      name: "N−1 continuity (experiment; not a production default)",
      latex: "\\mathbb{P}(\\mathrm{CRITICAL}\\mid \\text{first POS hit})\\le\\alpha,\\quad J_\\lambda=\\mathbb{E}[\\mathrm{CA}]-\\lambda\\,\\mathbb{E}[D^{\\mathrm{crit}}],\\quad J_\\gamma=(1-\\gamma)\\mathbb{E}[\\mathrm{CA}]+\\gamma\\,\\mathrm{CVaR}_{0.8}(\\mathrm{CA})",
      note: "CRITICAL = exactly one viable POS with genuine demand (forced concentration, typically with material trapped capital). It is a continuity failure, not only COLLAPSED. No lump-sum collapse penalty. F_persist stays 1 in production. Optional experiment factor F_critPersist = 1 + κ min(1, consecutive surviving-POS days / 5) applies only while already one-POS CRITICAL. POS 3 is an N−1 resource: after loss of any one POS the book must remain diversified. p0, γ, concentrationSensitivity, and includePersistenceInHazard are unchanged.",
    },
    {
      name: "N−1 concentration resilience (experiment)",
      latex: "s^{\\min}_t=\\min_{\\pi\\in\\Pi_t}\\max_{p\\in\\mathrm{POS}^{\\uparrow}_t}\\frac{\\sum_{i:\\pi(i)=p}s_i}{\\sum_i s_i},\\quad \\mathrm{CRITICAL}_\\beta\\iff \\text{degraded}\\wedge s^{\\min}_t>\\beta",
      note: "Π_t = POS re-assignments of the day's executed tickets over surviving terminals with cards fixed (one purchase per card per day untouched), pair reviews and per-POS capacity respected. Distinguishes 'optimizer chose a concentrated plan' (actual share > β ≥ s_min) from 'no less concentrated feasible plan existed' (s_min > β). β ∈ {0.60, 0.70, 0.80, 0.90} is a sensitivity axis, not a production threshold. Single-ticket days have s_min = 1 by construction and are reported separately.",
    },
    {
      name: "Exposure-weighted POS severity (experiment flag; posExposureLockScale, default null)",
      latex: "\\mathrm{share}_j=\\frac{\\sum_{t\\in W}V_{j,t}}{\\sum_{t\\in W}\\sum_k V_{k,t}},\\qquad \\mathrm{lock}_j=\\min\\big(C,\\ \\max(\\mathrm{inFlight}_j,\\ s\\cdot\\mathrm{share}_j\\cdot C)\\big)",
      note: "Severity side only. A review of terminal j traps the working capital economically exposed to j: its share of ledger volume over the last W days (default 7) times the working book C, scaled by s. In-flight (unsettled) volume through j is a subset of that exposure and is taken with max, not added, so it is not double counted. Calibration anchor from operations: a 50/50 two-POS book traps ≈ 50% on one review ⇒ s = 1; a 90/10 book then traps 90% on the big terminal and 34/33/33 traps 34%. Nothing assumes 1/N. null = legacy flat posCapitalLockFraction × C. Hazard, γ, persistence and bank coefficients unchanged.",
    },
    {
      name: "β-aware degraded-state packer (experiment flag; degradedMaxPosShare, default null)",
      latex: "\\pi^\\star_t=\\arg\\max_{\\pi\\in\\Pi^{\\mathrm{bank}}_t:\\ s_{\\max}(\\pi)\\le\\beta} Q_0(\\pi);\\qquad \\Pi^{\\mathrm{bank}}_t\\cap\\{s_{\\max}\\le\\beta\\}=\\emptyset\\Rightarrow \\mathrm{CRITICAL}_\\beta,\\ \\pi^\\star_t=\\arg\\min_{\\pi\\in\\Pi^{\\mathrm{bank}}_t} s_{\\max}(\\pi)",
      note: "Active only while a POS review is open and ≥ 2 POS survive. Π^bank_t = POS assignments of the baseline packer's whole tickets over surviving terminals, cards fixed, every hard bank rule and capacity re-checked per assignment (an assignment that blocks a ticket is infeasible). Q_0 = day-0 structural Q as the cover search scores it (myopic EV − hot-POS cost − complexity cost, + Δ_G when the learner is on). Tickets are never split, created, deferred or modified to meet β; amounts, p0, γ, concentrationSensitivity, persistence and loss coefficients are untouched. Diagnostics per day: routings enumerated / feasible / compliant, min achievable s_max, baseline vs chosen s_max, HHI and Q.",
    },
    {
      name: "N−1 planner constraint (experiment; nMinusOneRetentionMin / nMinusOneMaxPosShareLimit, default null)",
      latex: "r^{N-1}_t=\\min_j\\frac{V^{\\mathrm{exec}}(t\\mid \\neg j)}{V_t},\\quad s^{N-1}_t=\\max_j s^{\\min}_t(\\neg j),\\quad a^\\star_t=\\arg\\max_{a:\\ r^{N-1}\\ge r_{\\min},\\ s^{N-1}\\le\\beta}Q",
      note: "Post-failure continuity of the candidate plan, not ordinary-day equalisation. For each active POS j: take j down, lock the capital economically exposed to j, recompute surviving executable capacity and the min achievable max POS share of the same whole tickets on the survivors. If no positive-throughput candidate meets (r_min, β), mark the day resilience-infeasible and fall back to the unconstrained Q-best bank-feasible plan. Idle does not count as satisfying. Tickets are never split, created or mutated. r_min and β are sensitivity axes, not production defaults. frozenCapitalDailyRate is unchanged.",
    },
    {
      name: "Break-even hazard (switch, default on)",
      latex: "h_{\\mathrm{BE}}(V) = Vm / (\\mathbb{E}[D]\\, L(V))",
      note: "Hazard at which this V has myopic EV = 0. Compared with model h(V) as a safety ratio. Not a statement about banks.",
    },
    {
      name: "Operating band (switch, default on)",
      latex: "\\{ V : \\mathrm{EV}(V) \\ge (1-\\tau)\\,\\mathrm{EV}(V^\\star),\\; \\mathrm{EV}(V)\\ge 0 \\}",
      note: "Default τ=8%. The point estimate is the maximiser; the band is the honest recommendation under illustrative parameters.",
    },
  ],
  modes: [
    "EV simulation: no random downtime; each day adds G and charges expected continuity cost; maturity evolves as if operations stayed clean.",
    "Monte Carlo: samples interruptions, takes hit resources offline, optionally freezes capital. Inner policy is myopic for speed. Seed is an input.",
  ],
  limitations: [
    "The L-day rollout uses a one-shock tree at the first action, then a clean-path continuation. Inner continuation is myopic once any transaction evidence exists, and core-idle plus optional organic revenue while still cold. The production first action keeps the receding L-day horizon after the first operating day. That is not a full dynamic programme over all future shocks.",
    "Allocation packs whole tickets onto a cover, then scores that packed plan (held-cover EV under the sampled model, or plus optional VOI when the learner is off). Equal splits are not a target. Δ_G and IV rank only and are omitted from the 180-day CA.",
    "The economic residual is linear in a small feature set with independent priors; a 30-day horizon identifies the shared intercept and the strongest card effects first and leaves weakly excited directions near their prior. Regret is reported against the hidden θ* only in offline worlds. Thompson sampling with a fixed noise scale can be over-confident if c_ε is set too small.",
    "EV mode overstates overlapping-review cost relative to Monte Carlo because it never goes down and therefore keeps taking hazard every calendar day.",
    "Frozen capital is first-order when a second resource could still operate; on a one-card cold start it mainly adds the liquidity term ρ.",
    "Card and POS failure correlation default conservatively: extra cards/POS reduce expected capacity lost only on the independent share (1−ρ).",
    "p0, γ, q, durations, and ρ are illustrative. Outputs are scenario results under the current assumptions.",
  ],
};
