import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Terms of Use — Paga',
  description:
    'Terms of Use for Paga settlement services operated by Econometrica (Pty) Ltd (FSP 52815).',
}

const page: React.CSSProperties = {
  minHeight: '100%',
  padding: '48px 24px 96px',
  maxWidth: 720,
  margin: '0 auto',
  fontFamily: "'DM Sans', system-ui, sans-serif",
  color: '#18181b',
  background: '#fff',
}

const muted: React.CSSProperties = {
  fontSize: 14,
  lineHeight: 1.55,
  color: '#52525b',
  margin: '0 0 8px',
}

const body: React.CSSProperties = {
  fontSize: 15,
  lineHeight: 1.6,
  color: '#3a3a40',
  margin: '0 0 14px',
}

const h2: React.CSSProperties = {
  fontSize: 17,
  fontWeight: 700,
  letterSpacing: '-0.3px',
  margin: '28px 0 10px',
  color: '#18181b',
}

const ul: React.CSSProperties = {
  ...body,
  paddingLeft: 22,
  marginBottom: 14,
}

const li: React.CSSProperties = { marginBottom: 6 }

const linkStyle: React.CSSProperties = { color: 'inherit' }

export default function TermsPage() {
  return (
    <main style={page}>
      <p style={{ margin: '0 0 24px' }}>
        <Link href="/" style={linkStyle}>
          ← Home
        </Link>
      </p>

      <h1
        style={{
          fontSize: 28,
          fontWeight: 700,
          letterSpacing: '-0.6px',
          margin: '0 0 8px',
        }}
      >
        Terms of Use
      </h1>
      <p style={muted}>Paga Settlement Services</p>
      <p style={muted}>Effective date: 25 November 2026 · Last updated: 25 November 2026</p>
      <p style={{ ...muted, marginBottom: 28 }}>
        Operated by Econometrica (Pty) Ltd (Registration No. 2026/785154/07), trading as Paga ·
        Authorised FSP 52815
      </p>

      <h2 style={h2}>1. Agreement</h2>
      <p style={body}>
        These Terms of Use (“Terms”) govern access to and use of the Paga / GoBankless websites,
        applications, and related settlement services available at gobankless.app, mozpaga.xyz, and
        affiliated domains (the “Service”).
      </p>
      <p style={body}>
        The Service is operated by <strong>Econometrica (Pty) Ltd</strong> (Registration No.
        2026/785154/07), trading as <strong>Paga</strong> (“we”, “us”, “Paga”, or “Econometrica”),
        with registered office at Unit 875 Polofields Lifestyle Estate, Waterfall City, Midrand,
        Gauteng, 2066, South Africa. Contact: info@mozpaga.xyz · 060 857 8513.
      </p>
      <p style={body}>
        By creating an account, completing phone verification, funding a balance, initiating
        settlement, or continuing to use the Service after notice of these Terms, you agree to these
        Terms and our Privacy Notice. If you use the Service on behalf of a company, you represent
        that you have authority to bind that company. If you do not agree, do not use the Service.
      </p>
      <p style={body}>
        Electronic acceptance — including OTP completion, continued use, or an in-product
        acknowledgement — constitutes acceptance of these Terms for purposes of contract formation
        under the Electronic Communications and Transactions Act 25 of 2002.
      </p>

      <h2 style={h2}>2. Who we are</h2>
      <p style={body}>
        Econometrica (Pty) Ltd trading as Paga provides technology-enabled FX settlement and
        liquidity facilitation under the brands Paga and GoBankless. Econometrica is an authorised
        Financial Services Provider (<strong>FSP 52815</strong>).
      </p>
      <p style={body}>
        Co-operative banking settlement referenced under certificate <strong>CFI0024</strong> is
        made available pursuant to Econometrica’s partnership with{' '}
        <strong>NASASA</strong> and related Co-op arrangements. Econometrica is not itself the
        Co-operative bank. A confirmation relating to CFI0024 is available{' '}
        <a
          href="https://drive.google.com/file/d/1vy3Cr0R4Up3hXC5L1cezYA2PPc1f1LCg/view?usp=sharing"
          target="_blank"
          rel="noopener noreferrer"
          style={linkStyle}
        >
          here
        </a>
        .
      </p>
      <p style={body}>
        We are not the South African Reserve Bank. We do not replace your own FX licences or
        regulatory obligations. Nothing in the Service constitutes investment, tax, or legal advice.
      </p>

      <h2 style={h2}>3. Eligibility</h2>
      <p style={body}>The Service is available only to:</p>
      <ul style={ul}>
        <li style={li}>licensed FX operators; or</li>
        <li style={li}>
          authorised representatives of such operators, acting within the scope of their authority.
        </li>
      </ul>
      <p style={body}>
        The Service is for eligible commercial Clients moving value across closed-currency corridors
        (including Mozambique metical ↔ South African rand). It is not a consumer retail banking
        product for the general public.
      </p>
      <p style={body}>
        If you register or operate an account as a representative, you warrant that the principal is
        a licensed FX operator, that you are authorised to bind that operator to these Terms and to
        give settlement instructions, and that you will produce evidence of authority on request.
        Unauthorised use may result in suspension, reversal of transactions, and reporting to
        competent authorities.
      </p>
      <p style={body}>You may not use the Service if you are:</p>
      <ul style={ul}>
        <li style={li}>not a licensed FX operator or authorised representative thereof;</li>
        <li style={li}>
          subject to sanctions administered by the UN, OFAC, EU, UK, South Africa, Mozambique, or
          other applicable authorities;
        </li>
        <li style={li}>under 18 years of age; or</li>
        <li style={li}>
          using the Service as a substitute for a retail bank account where that use is prohibited.
        </li>
      </ul>
      <p style={body}>
        Licensed FX operators remain solely responsible for their own licences, client disclosures,
        and compliance with rules applicable to their business, including those of the South African
        Reserve Bank, the Bank of Mozambique, and the FSCA. Paga does not assume those obligations by
        providing settlement technology or liquidity.
      </p>
      <p style={body}>
        You must provide accurate identity, contact, licensing, and banking details and keep them
        updated.
      </p>

      <h2 style={h2}>4. The Service</h2>
      <p style={body}>
        The Service enables prefunded conversion and settlement across eligible corridors: we receive
        Client funds (for example MZN), execute settlement paths (including card/POS, EFT, and other
        authorised rails), and deliver usable counterparty currency (for example ZAR), subject to
        liquidity, bank capacity, and these Terms.
      </p>
      <p style={body}>We do not guarantee:</p>
      <ul style={ul}>
        <li style={li}>that any particular bank, card, POS, or corridor path will clear;</li>
        <li style={li}>instantaneous delivery;</li>
        <li style={li}>
          a particular FX rate beyond the rate rules disclosed at the time of quote or conversion; or
        </li>
        <li style={li}>
          uninterrupted availability of SMS, WhatsApp, email, or third-party identity verification.
        </li>
      </ul>
      <p style={body}>
        Where capacity allows, eligible amounts may be delivered in a liquid / same-window slice
        subject to daily caps and reserves. Residual amounts may be queued for later openings. Amounts
        that cannot be delivered within the published SLA enter the refund or return path in Section
        9.
      </p>
      <p style={body}>
        <strong>Published completion / refund SLA:</strong> eighteen (18) hours from acceptance of a
        settlement instruction after cleared funding. Authorisation of a card payment is not the same
        as usable funds or contractual delivery.
      </p>

      <h2 style={h2}>5. Accounts and authentication</h2>
      <p style={body}>
        Accounts may be created using phone-number one-time passwords (OTP) and other methods we
        enable from time to time. You are responsible for custody of your devices and OTPs. Notify us
        promptly of suspected compromise at info@mozpaga.xyz or 060 857 8513.
      </p>
      <p style={body}>
        We may refuse, suspend, or terminate accounts for fraud, money-laundering or sanctions risk,
        abuse of SMS/OTP, or breach of these Terms.
      </p>

      <h2 style={h2}>6. KYC, AML, and sanctions</h2>
      <p style={body}>
        We may require identity verification before withdrawals, larger settlements, or continued use.
        Verification may be performed through our identity partner (including Didit). A verification
        invitation may be sent after your first successful MZN funding (when your balance first
        exceeds zero), including by SMS containing a verification link. Completing verification may
        remain required before certain features unlock.
      </p>
      <p style={body}>
        You must complete verification when requested, provide genuine documents, and must not spoof
        or circumvent checks. We may delay, freeze, reverse, or refuse transactions; retain funds
        pending investigation; file reports with competent authorities; and close the relationship
        where required by law or our risk policy. We are not obliged to disclose full AML logic where
        disclosure would undermine controls.
      </p>

      <h2 style={h2}>7. Funding and balances</h2>
      <p style={body}>
        Settlement generally requires Client prefunding in the source currency to designated accounts
        or payment references we issue. In-app balances are accounting records of obligations and
        holdings under the Service. They do not, by themselves, create a deposit account with a bank
        or entitle you to interest unless we agree otherwise in writing.
      </p>
      <p style={body}>
        Settlement and related banking rails may involve NASASA and/or Co-operative banking
        arrangements under CFI0024. We may reverse erroneous credits and recover overpayments.
      </p>

      <h2 style={h2}>8. Instructions, paths, and bank dependency</h2>
      <p style={body}>
        Instructions you submit — amounts, beneficiaries, and payout accounts — must be accurate. We
        may rely on them without further enquiry beyond our controls.
      </p>
      <p style={body}>
        Corridor capacity at issuers, acquirers, POS terminals, and banks is uncertain and can be
        correlated. Path failures, partial clears, and delays are inherent in this Service. Banks,
        card schemes, POS merchants, and payment processors are independent third parties. Beyond our
        obligations under Section 9, we are not liable for their errors, outages, or policy declines.
      </p>
      <p style={body}>
        Settlement finality for our accounting may require reconciliation against bank records, unique
        references, and evidence policies. An authenticated email alone is not conclusive proof of
        settlement.
      </p>

      <h2 style={h2}>9. Delivery, incomplete settlement, and refunds</h2>
      <p style={body}>
        A settlement is successfully delivered when the contractual delivery condition is met — for
        example, usable ZAR credited to the agreed beneficiary or an equivalent liquid credit — not
        merely when a card authorises.
      </p>
      <p style={body}>
        Where partial settlement is permitted, undelivered residual remains our obligation to deliver
        later or to refund or return under this Section.
      </p>
      <p style={body}>
        If we cannot complete delivery of an undelivered amount within <strong>eighteen (18)
        hours</strong> of acceptance of the settlement instruction after cleared funding, we will
        place that undelivered amount into a refund or return process by the reconciliation deadline,
        subject to:
      </p>
      <ul style={ul}>
        <li style={li}>deduction of disclosed fees or costs already incurred where permitted;</li>
        <li style={li}>FX conversion risk if return requires re-conversion;</li>
        <li style={li}>AML or sanctions holds; and</li>
        <li style={li}>correct refund destination details from you.</li>
      </ul>
      <p style={body}>
        You may not claim both full delivery and full refund of the same amount. If a funding rail
        reverses (including chargeback or recall), we may debit balances, suspend payouts, and seek
        recovery.
      </p>

      <h2 style={h2}>10. Fees, rates, and quotes</h2>
      <p style={body}>
        Fees and spreads are disclosed in-product or on invoices. Displayed rates may be indicative or
        firm for a stated validity window. Corridor markups apply as disclosed at conversion. Final
        economics may reflect bank fills, path mix, and timing. We do not guarantee best execution
        across all possible paths. Taxes are your responsibility unless we are legally required to
        withhold.
      </p>

      <h2 style={h2}>11. Automated systems and desk agents</h2>
      <p style={body}>
        We use software, models, and agent-style interfaces — including routing desk tooling, path
        estimation, liquidity controllers, and LLM-assisted operational communications — to propose
        and execute workflows.
      </p>
      <p style={body}>
        Monetary amounts, beneficiaries, and destinations are authorised by our ledger and
        deterministic compliance rules, not by unconstrained generative AI. Large language models may
        draft or relay communications; they do not decide final payment instructions. Automated
        routing may fail, retry, or choose suboptimal paths under uncertainty.
      </p>
      <p style={body}>
        Automation is provided as available. We do not warrant that models are error-free or optimal.
        To the fullest extent permitted by law, we are not liable for losses arising solely from model
        prediction error, generative text that was not ledger-authorised, or delays caused by
        automated throttling, fraud controls, or messaging providers — except where caused by our
        gross negligence or wilful misconduct, or as non-excludable law requires. We may override
        automation for risk, compliance, or operational reasons.
      </p>

      <h2 style={h2}>12. Communications</h2>
      <p style={body}>
        You consent to receive service messages, including OTPs, KYC links, settlement notices, and
        security alerts, by SMS, email, in-app message, and, where enabled, WhatsApp. Carrier and
        provider delivery is not guaranteed. Failed OTP delivery does not waive your obligation to
        secure the account by other means we offer. Marketing messages are sent only with required
        consent.
      </p>

      <h2 style={h2}>13. Prohibited use</h2>
      <p style={body}>
        You must not use the Service for fraud, money laundering, sanctions evasion, OTP or SMS
        abuse, scraping, reverse engineering beyond what law permits, interference with other
        Clients, unlawful content, misrepresentation of identity, or attempts to double-spend the same
        funds. We may report and cooperate with law enforcement.
      </p>

      <h2 style={h2}>14. Intellectual property</h2>
      <p style={body}>
        The Service, including the Paga and GoBankless trademarks, software, and content, is owned by
        us or our licensors. We grant you a limited, revocable licence to use the Service in
        accordance with these Terms. No licence is granted to model weights, routing logic, or other
        internal intellectual property.
      </p>

      <h2 style={h2}>15. Confidentiality</h2>
      <p style={body}>
        Each party must keep the other’s non-public operational and commercial information
        confidential, except as needed to perform under these Terms, as required by law, or where the
        information is already public through no fault of the receiving party.
      </p>

      <h2 style={h2}>16. Privacy</h2>
      <p style={body}>
        Personal information is processed under our{' '}
        <Link href="/privacy" style={linkStyle}>
          Privacy Notice
        </Link>
        , which forms part of these Terms.
      </p>

      <h2 style={h2}>17. Suspension and termination</h2>
      <p style={body}>
        We may suspend access immediately for risk, AML, sanctions, or security reasons. Either party
        may terminate these Terms on thirty (30) days’ written notice if there are no open settlement
        obligations. On termination we will wind down balances in accordance with Section 9 and
        applicable law. Sections dealing with liability, indemnity, intellectual property,
        confidentiality, privacy, and governing law survive termination.
      </p>

      <h2 style={h2}>18. Disclaimers</h2>
      <p style={body}>
        The Service is provided “as is” and “as available.” To the fullest extent permitted by law, we
        disclaim implied warranties of merchantability and fitness for a particular purpose. Corridor
        banking is inherently unreliable; we disclaim liability for third-party bank, POS, or card
        scheme failures beyond our duties in Section 9.
      </p>

      <h2 style={h2}>19. Limitation of liability</h2>
      <p style={body}>
        Subject to non-excludable law, our aggregate liability arising out of or relating to the
        Service in any twelve (12) month period is limited to the total fees you paid us for the
        Service in that period.
      </p>
      <p style={body}>
        We are not liable for indirect, consequential, incidental, or special damages; lost profits;
        lost opportunity; reputational harm; or FX market moves — except to the extent liability
        cannot be excluded (including fraud, gross negligence, or wilful misconduct, and any
        non-excludable statutory liability).
      </p>
      <p style={body}>
        These limitations are a fundamental allocation of risk reflected in our pricing and
        eligibility rules.
      </p>

      <h2 style={h2}>20. Indemnity</h2>
      <p style={body}>
        You indemnify Econometrica and its officers, employees, and agents against claims, losses,
        and expenses (including reasonable legal fees) arising from your breach of these Terms, your
        unlawful use of the Service, your inaccurate instructions, claims by your own clients against
        you as an operator, or sanctions or AML violations by you.
      </p>

      <h2 style={h2}>21. Force majeure</h2>
      <p style={body}>
        We are not liable for delay or failure caused by circumstances beyond our reasonable control,
        including bank holidays, payment-system outages, war, epidemic, utility failure, messaging
        provider outage, regulatory action, or cyber-attack (provided we maintain reasonable
        safeguards). Obligations are suspended for the duration of the event. Where we hold funds
        pending delivery, we will continue to address refund or return paths in good faith under
        Section 9 once practicable.
      </p>

      <h2 style={h2}>22. Complaints</h2>
      <p style={body}>
        Contact us at info@mozpaga.xyz · 060 857 8513 · Unit 875 Polofields Lifestyle Estate,
        Waterfall City, Midrand, Gauteng, 2066, South Africa. Business hours: Monday to Friday,
        09:00–17:00 SAST (excluding South African public holidays).
      </p>
      <p style={body}>
        We aim to acknowledge complaints within two (2) business days and to provide a substantive
        response within fifteen (15) business days of acknowledgement, or to tell you if more time is
        reasonably required.
      </p>
      <p style={body}>
        If you are a client entitled to escalate a complaint about financial services rendered under
        FSP 52815 and you remain dissatisfied after our process, you may contact the Financial Sector
        Conduct Authority (FSCA) and, where applicable, the FAIS Ombud, using the channels published
        by those bodies from time to time.
      </p>

      <h2 style={h2}>23. Governing law and disputes</h2>
      <p style={body}>
        These Terms are governed by the laws of the Republic of South Africa. Subject to any
        non-excludable rights, the courts of Johannesburg have exclusive jurisdiction over disputes
        arising out of or relating to these Terms. The Service is aimed at licensed FX operators and
        their authorised representatives.
      </p>

      <h2 style={h2}>24. Changes</h2>
      <p style={body}>
        We may update these Terms by posting a revised version on this page and updating the “Last
        updated” date. For material changes we will give notice via the Service, SMS, or email where
        practicable. Continued use after the effective date of a revision constitutes acceptance of
        the updated Terms.
      </p>

      <h2 style={h2}>25. General</h2>
      <p style={body}>
        These Terms, together with the Privacy Notice and any written operator schedule we enter with
        you, are the entire agreement between you and us regarding the Service. If any provision is
        unenforceable, the remainder remains in effect. Failure to enforce a provision is not a
        waiver. We may assign these Terms to an affiliate or successor; you may not assign without our
        prior written consent. Notices may be sent to the contact details above or to the contact
        details on your account. The English language version prevails.
      </p>

      <p style={{ ...muted, marginTop: 36 }}>
        Questions:{' '}
        <a href="mailto:info@mozpaga.xyz" style={linkStyle}>
          info@mozpaga.xyz
        </a>{' '}
        · 060 857 8513
      </p>
      <p style={muted}>
        <Link href="/privacy" style={linkStyle}>
          Privacy Notice
        </Link>
      </p>
    </main>
  )
}
