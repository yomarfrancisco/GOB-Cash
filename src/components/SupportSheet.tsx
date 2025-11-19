'use client'

import { Mail, PhoneForwarded } from 'lucide-react'
import Image from 'next/image'
import ActionSheet from './ActionSheet'
import ActionSheetItem from './ActionSheetItem'
import { useSupportSheet } from '@/store/useSupportSheet'

export default function SupportSheet() {
  const { isOpen, close } = useSupportSheet()

  const handleEmail = () => {
    if (typeof window !== 'undefined') {
      const email = 'info@brics.ninja'
      window.location.href = `mailto:${email}?subject=${encodeURIComponent('GoBankless support')}`
    }
  }

  const handleWhatsApp = () => {
    if (typeof window !== 'undefined') {
      const whatsappNumber = '27823306256' // no + or spaces for wa.me
      window.location.href = `https://wa.me/${whatsappNumber}`
    }
  }

  const handlePhone = () => {
    if (typeof window !== 'undefined') {
      const phone = '+27608578513'
      window.location.href = `tel:${phone}`
    }
  }

  return (
    <ActionSheet open={isOpen} onClose={close} title="Help & Support">
      <ActionSheetItem
        icon={<Mail size={22} strokeWidth={2} style={{ color: '#111' }} />}
        title="Email"
        caption="Send us an email for non-urgent questions."
        onClick={handleEmail}
      />
      <ActionSheetItem
        icon={
          <Image
            src="/assets/WhatsApp_Balck.png"
            alt="WhatsApp"
            width={22}
            height={22}
            style={{ objectFit: 'contain' }}
          />
        }
        title="WhatsApp"
        caption="Chat with us on WhatsApp for quick help."
        onClick={handleWhatsApp}
      />
      <ActionSheetItem
        icon={<PhoneForwarded size={22} strokeWidth={2} style={{ color: '#111' }} />}
        title="Phone"
        caption="Call our support line directly."
        onClick={handlePhone}
      />
    </ActionSheet>
  )
}

