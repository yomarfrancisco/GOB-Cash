'use client'

import { useEffect, useState } from 'react'
import ActionSheet from './ActionSheet'
import ChatHeader from './Inbox/ChatHeader'
import ChatMessageBubble from './Inbox/ChatMessageBubble'
import ChatInputBar from './Inbox/ChatInputBar'
import TypingBubble from './Inbox/TypingBubble'
import Image from 'next/image'
import chatStyles from './Inbox/FinancialInboxChatSheet.module.css'
import { useWhatsAppClaimStore } from '@/store/useWhatsAppClaim'
import { buildWhatsAppClaimAmaText, downloadWhatsAppClaimProof } from '@/lib/whatsappClaim'

export default function WhatsAppClaimAmaSheet() {
  const { isActive, phase, amountZAR, bank, exitToHome } = useWhatsAppClaimStore()
  const open = isActive && phase === 'ama' && amountZAR !== null && bank !== null
  const [showMessage, setShowMessage] = useState(false)

  useEffect(() => {
    if (!open) {
      setShowMessage(false)
      return
    }
    const id = window.setTimeout(() => setShowMessage(true), 700)
    return () => window.clearTimeout(id)
  }, [open])

  const handleDownload = () => {
    if (amountZAR === null || !bank) return
    downloadWhatsAppClaimProof(amountZAR, bank)
    exitToHome()
  }

  return (
    <ActionSheet open={open} onClose={exitToHome} title="" className="inboxTallSheet">
      <div className={chatStyles.container}>
        <ChatHeader
          avatarSrc="/assets/Brics-girl-blue.png"
          avatarSize={38}
          name="Ama — Investment Manager"
          showBackButton={false}
        />
        <div className={chatStyles.messageArea}>
          {showMessage && amountZAR !== null && bank ? (
            <ChatMessageBubble
              message={{
                id: 'whatsapp-claim-confirm',
                from: 'ai',
                text: buildWhatsAppClaimAmaText(amountZAR, bank),
                buttons: [{ label: 'Download proof', onClick: handleDownload, variant: 'primary' }],
              }}
              avatarSrc="/assets/Brics-girl-blue.png"
              avatarSize={31}
              theme="ama"
            />
          ) : (
            <div className={chatStyles.messageWrapper}>
              <div className={chatStyles.messageAvatar}>
                <Image
                  src="/assets/Brics-girl-blue.png"
                  alt="Ama"
                  width={31}
                  height={31}
                  className={chatStyles.messageAvatarImage}
                  sizes="31px"
                  quality={92}
                />
              </div>
              <div className={chatStyles.bubbleContainer}>
                <TypingBubble />
              </div>
            </div>
          )}
        </div>
        <ChatInputBar
          value=""
          onChange={exitToHome}
          onSend={exitToHome}
          onInputFocus={exitToHome}
          onRequireAuth={exitToHome}
          placeholder="Add a message"
        />
      </div>
    </ActionSheet>
  )
}
