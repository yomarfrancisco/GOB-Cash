import { redirect } from 'next/navigation'

export default function PayCashRedirectPage({ params }: { params: { handle: string } }) {
  redirect(`/cash/${encodeURIComponent(params.handle)}`)
}
