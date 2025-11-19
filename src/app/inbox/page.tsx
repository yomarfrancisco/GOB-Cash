'use client'

import { useEffect } from 'react'
import { useFinancialInboxStore } from '@/state/financialInbox'
import Inbox from '@/components/Inbox/Inbox'

export default function InboxPage() {
  const { openInbox } = useFinancialInboxStore()

  // Auto-open inbox on page load
  useEffect(() => {
    openInbox()
  }, [openInbox])

  return <Inbox />
}

