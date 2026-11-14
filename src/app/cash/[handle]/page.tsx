import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { normalizeCashHandle } from '@/lib/agentCashQr'
import CashPayRedirect from './CashPayRedirect'

type Props = {
  params: { handle: string }
}

export function generateMetadata({ params }: Props): Metadata {
  const handle = normalizeCashHandle(params.handle)
  const titleHandle = handle ? `@${handle}` : 'Cash ID'
  return {
    title: `Pay ${titleHandle} — PAGA`,
    description: `Send cash to ${titleHandle} with PAGA.`,
  }
}

export default function CashPayPage({ params }: Props) {
  const handle = normalizeCashHandle(params.handle)
  if (!handle) redirect('/')
  return <CashPayRedirect handle={handle} />
}
