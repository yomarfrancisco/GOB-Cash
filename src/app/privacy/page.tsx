import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Privacy Notice — Paga',
  description:
    'Privacy Notice for Paga / GoBankless services operated by Econometrica (Pty) Ltd.',
}

const page: React.CSSProperties = {
  minHeight: '100vh',
  padding: '48px 24px 96px',
  maxWidth: 720,
  margin: '0 auto',
  fontFamily: "'DM Sans', system-ui, sans-serif",
  color: '#18181b',
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

export default function PrivacyPage() {
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
        Privacy Notice
      </h1>
      <p style={muted}>Paga / GoBankless</p>
      <p style={muted}>Effective date: 25 November 2026 · Last updated: 25 November 2026</p>
      <p style={{ ...muted, marginBottom: 28 }}>
        Responsible Party: Econometrica (Pty) Ltd (Registration No. 2026/785154/07), trading as Paga
      </p>

      <h2 style={h2}>1. Scope</h2>
      <p style={body}>
        This Privacy Notice explains how we process personal information when you use Paga /
        GoBankless websites, apps, APIs, SMS or WhatsApp messages, identity verification, and
        settlement services. It applies alongside our{' '}
        <Link href="/terms" style={linkStyle}>
          Terms of Use
        </Link>
        .
      </p>

      <h2 style={h2}>2. Who we are</h2>
      <p style={body}>
        <strong>Econometrica (Pty) Ltd</strong> (Registration No. 2026/785154/07), trading as{' '}
        <strong>Paga</strong>, with registered office at Unit 875 Polofields Lifestyle Estate,
        Waterfall City, Midrand, Gauteng, 2066, South Africa, is the Responsible Party for personal
        information collected via the Service under the Protection of Personal Information Act 4 of
        2013 (“POPIA”).
      </p>
      <p style={body}>
        <strong>Information Officer:</strong> Bruno Manjate, Licensed Auditor ·
        bmanjare@vt-ranus.com · +258 87 422 2609
      </p>
      <p style={body}>General contact: info@mozpaga.xyz · 060 857 8513</p>

      <h2 style={h2}>3. Personal information we collect</h2>
      <p style={body}>Depending on how you use the Service, we may process:</p>
      <ul style={ul}>
        <li style={li}>
          <strong>Identity and contact:</strong> name, phone number, email, and related handles;
        </li>
        <li style={li}>
          <strong>Authentication:</strong> OTP events, session tokens, and device or security
          signals;
        </li>
        <li style={li}>
          <strong>KYC / CDD:</strong> identity documents, liveness or face-match results, screening
          outputs, and related verification metadata from our identity partner;
        </li>
        <li style={li}>
          <strong>Financial and transactional:</strong> funding references, balances, conversion
          amounts, payout bank details, and settlement status;
        </li>
        <li style={li}>
          <strong>Bank evidence:</strong> transactional emails, attachments, parsed fields, and
          delivery authentication metadata used for reconciliation;
        </li>
        <li style={li}>
          <strong>Support:</strong> messages to our desk or support channels; and
        </li>
        <li style={li}>
          <strong>Technical:</strong> IP address, logs, and diagnostics needed to operate and secure
          the Service.
        </li>
      </ul>
      <p style={body}>
        Special personal information (including biometric-related data used for identity
        verification) is processed only as permitted by POPIA and for the purposes described below.
      </p>

      <h2 style={h2}>4. Purposes</h2>
      <p style={body}>We process personal information to:</p>
      <ul style={ul}>
        <li style={li}>create and secure accounts, including OTP and fraud prevention;</li>
        <li style={li}>perform settlement contracts (fund, convert, pay out, refund);</li>
        <li style={li}>conduct KYC, AML, and sanctions compliance;</li>
        <li style={li}>send service messages (OTP, KYC links, payout status, security alerts);</li>
        <li style={li}>improve routing reliability and prevent abuse, including with automated systems;</li>
        <li style={li}>comply with legal and regulatory requests; and</li>
        <li style={li}>defend legal claims.</li>
      </ul>
      <p style={body}>
        Marketing communications are sent only with required consent. You may withdraw marketing
        consent without affecting essential service messages.
      </p>

      <h2 style={h2}>5. KYC after funding</h2>
      <p style={body}>
        After your MZN balance first becomes positive, we may SMS a verification link so you can
        complete identity checks required for withdrawals and higher-risk activity. We process KYC
        data to meet AML obligations and risk policy — not for unrelated profiling or marketing.
      </p>

      <h2 style={h2}>6. SMS, WhatsApp, and phone numbers</h2>
      <p style={body}>
        Phone numbers are used for authentication and service alerts. OTP and KYC links may be sent
        by our messaging providers. Message and data rates may apply. Opting out of marketing SMS
        does not opt you out of security or transactional messages.
      </p>

      <h2 style={h2}>7. Automated processing</h2>
      <p style={body}>
        We use automated systems to estimate settlement path reliability, allocate liquidity, detect
        abuse, and draft operational communications. Significant decisions with legal or similarly
        significant effects (for example refusing service for AML reasons) are subject to our
        compliance policies and, where required, human review. Generative AI does not independently
        dispose of Client funds; payment amounts and destinations are ledger-authorised.
      </p>

      <h2 style={h2}>8. Sharing</h2>
      <p style={body}>We share personal information with operators and partners as needed to run the Service, including:</p>
      <ul style={ul}>
        <li style={li}>cloud hosting, authentication, and database providers;</li>
        <li style={li}>SMS / Verify / messaging providers;</li>
        <li style={li}>identity verification providers (including Didit);</li>
        <li style={li}>
          NASASA, Co-operative banking arrangements under CFI0024, banks, and payment partners for
          settlement and evidence;
        </li>
        <li style={li}>email infrastructure used for bank evidence ingestion;</li>
        <li style={li}>professional advisers and auditors under confidentiality; and</li>
        <li style={li}>regulators or law enforcement where legally required.</li>
      </ul>
      <p style={body}>
        We require processors to implement appropriate security and to process personal information
        on our instructions.
      </p>

      <h2 style={h2}>9. Cross-border transfers</h2>
      <p style={body}>
        Personal information may be processed in South Africa and in countries where our processors
        operate. Where POPIA requires, we rely on appropriate transfer mechanisms, including
        contractual safeguards with operators.
      </p>

      <h2 style={h2}>10. Retention</h2>
      <p style={body}>
        We retain personal information only as long as needed for the purposes above and for legal,
        regulatory, and dispute purposes. As a guide: account and KYC records and transaction /
        settlement evidence are typically retained for the duration of the relationship plus five to
        seven years; operational OTP and SMS logs for a shorter operational period unless a dispute
        requires longer retention; and support records for approximately two to three years. We delete
        or de-identify information when no longer needed, subject to legal holds.
      </p>

      <h2 style={h2}>11. Security</h2>
      <p style={body}>
        We apply technical and organisational measures appropriate to the risk, including encryption
        in transit, access control, secret management, least privilege, and monitoring. No method is
        completely secure. Please notify info@mozpaga.xyz or the Information Officer of suspected
        breaches affecting you. We will notify the Information Regulator and affected data subjects
        where POPIA requires.
      </p>

      <h2 style={h2}>12. Your rights</h2>
      <p style={body}>
        Subject to POPIA, you may request access to, correction of, or deletion of your personal
        information; object to or request restriction of certain processing; and withdraw consent
        where processing is consent-based. You may also lodge a complaint with the Information
        Regulator (South Africa).
      </p>
      <p style={body}>
        Contact: info@mozpaga.xyz or Information Officer Bruno Manjate
        (bmanjare@vt-ranus.com · +258 87 422 2609).
      </p>

      <h2 style={h2}>13. Children</h2>
      <p style={body}>
        The Service is not directed at children under 18. We do not knowingly collect their personal
        information. If we discover that we have, we will delete it.
      </p>

      <h2 style={h2}>14. Cookies</h2>
      <p style={body}>
        We use essential cookies and similar technologies for authentication and security. Analytics
        cookies, if used, are disclosed and collected with required consent.
      </p>

      <h2 style={h2}>15. Changes</h2>
      <p style={body}>
        We may update this Notice by posting a revised version on this page and updating the “Last
        updated” date. Material changes will be notified reasonably via the Service or contact
        details on file.
      </p>

      <h2 style={h2}>16. Contact</h2>
      <p style={body}>
        Privacy / general: info@mozpaga.xyz · 060 857 8513
        <br />
        Information Officer: Bruno Manjate, Licensed Auditor · bmanjare@vt-ranus.com · +258 87 422
        2609
        <br />
        Postal: Unit 875 Polofields Lifestyle Estate, Waterfall City, Midrand, Gauteng, 2066, South
        Africa
      </p>

      <p style={{ ...muted, marginTop: 36 }}>
        <Link href="/terms" style={linkStyle}>
          Terms of Use
        </Link>
      </p>
    </main>
  )
}
