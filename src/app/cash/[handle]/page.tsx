import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { normalizeCashHandle } from '@/lib/agentCashQr'

type Props = {
  params: { handle: string }
}

export function generateMetadata({ params }: Props): Metadata {
  const handle = normalizeCashHandle(params.handle)
  const titleHandle = handle ? `@${handle}` : 'Cash ID'
  return {
    title: `Pay ${titleHandle} — GoBankless`,
    description: `Send cash to ${titleHandle} with GoBankless.`,
  }
}

export default function CashPayPage({ params }: Props) {
  const handle = normalizeCashHandle(params.handle)
  if (!handle) redirect('/')
  redirect(`/?cash=${encodeURIComponent(handle)}`)
}
