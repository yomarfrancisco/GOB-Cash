'use client'

import { useEffect } from 'react'
import { setupDevNotificationHelpers } from '@/lib/notifications/devHelpers'

export default function DevNotificationSetup() {
  useEffect(() => {
    setupDevNotificationHelpers()
  }, [])
  return null
}

