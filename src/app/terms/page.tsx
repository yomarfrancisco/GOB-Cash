import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Terms — GoBankless',
  description: 'Terms that apply to GoBankless / PAGA FX services for licensed operators.',
}

export default function TermsPage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        padding: '48px 24px 80px',
        maxWidth: 640,
        margin: '0 auto',
        fontFamily: "'DM Sans', system-ui, sans-serif",
        color: '#18181b',
      }}
    >
      <p style={{ margin: '0 0 24px' }}>
        <Link href="/" style={{ color: '#18181b' }}>
          ← Home
        </Link>
      </p>
      <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.6px', margin: '0 0 16px' }}>
        Terms
      </h1>
      <p style={{ fontSize: 15, lineHeight: 1.5, margin: '0 0 12px', color: '#3a3a40' }}>
        GoBankless / PAGA provides liquidity and settlement services for licensed FX operators
        moving funds across closed-currency corridors. Use of the product is subject to applicable
        law, operator licensing, and our operating policies.
      </p>
      <p style={{ fontSize: 15, lineHeight: 1.5, margin: 0, color: '#3a3a40' }}>
        Authorised FSP 52815 · Co-op bank{' '}
        <a
          href="https://drive.google.com/file/d/1vy3Cr0R4Up3hXC5L1cezYA2PPc1f1LCg/view?usp=sharing"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'inherit' }}
        >
          CFI0024
        </a>
        .
      </p>
    </main>
  )
}
