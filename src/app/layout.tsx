import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import IosKeyboardShim from '@/components/IosKeyboardShim'
import TopNotifications from '@/components/notifications/TopNotifications'
import DevNotificationSetup from '@/components/notifications/DevNotificationSetup'
import { WalletModeProvider } from '@/state/walletMode'
import { WalletAllocProvider } from '@/state/walletAlloc'
import SplashOnceProvider from '@/providers/SplashOnceProvider'
import TransactionSheet from '@/components/TransactionSheet'
import ProfileEditSheet from '@/components/ProfileEditSheet'
import AvatarEditSheet from '@/components/AvatarEditSheet'
import ProfileNameHandleSheet from '@/components/ProfileNameHandleSheet'
import SocialLinksSheet from '@/components/SocialLinksSheet'
import EmailEditSheet from '@/components/EmailEditSheet'
import InstagramEditSheet from '@/components/InstagramEditSheet'
import LinkedInEditSheet from '@/components/LinkedInEditSheet'
import WhatsAppEditSheet from '@/components/WhatsAppEditSheet'
import ProfileDescriptionSheet from '@/components/ProfileDescriptionSheet'
import SupportSheet from '@/components/SupportSheet'
import ShareProfileSheet from '@/components/ShareProfileSheet'
import AuthModal from '@/components/AuthModal'
import AuthEntrySheet from '@/components/AuthEntrySheet'
import PhoneSignupSheet from '@/components/PhoneSignupSheet'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'GoBankless',
  description: 'GoBankless cash-card UI',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        {/* Disable iOS Safari phone number auto-detection to avoid blue/underlined flashes */}
        <meta name="format-detection" content="telephone=no" />
      </head>
      <body className={inter.className}>
        <script
          dangerouslySetInnerHTML={{
            __html: `
(function(){
  try {
    var m = localStorage.getItem('gb.walletMode') || 'manual';
    document.documentElement.dataset.walletMode = m;
  } catch(_) { 
    document.documentElement.dataset.walletMode = 'manual'; 
  }
})();`,
          }}
        />
        <IosKeyboardShim />
        <SplashOnceProvider>
          <WalletModeProvider>
            <WalletAllocProvider>
              <TopNotifications />
              <DevNotificationSetup />
              {children}
              {/* Global Transact Sheet */}
              <TransactionSheet />
              {/* Global Profile Edit Sheet */}
              <ProfileEditSheet />
              {/* Global Avatar Edit Sheet */}
              <AvatarEditSheet />
              {/* Global Name & Handle Sheet */}
              <ProfileNameHandleSheet />
              {/* Global Social Links Sheet */}
              <SocialLinksSheet />
              {/* Global Email Edit Sheet */}
              <EmailEditSheet />
              {/* Global Instagram Edit Sheet */}
              <InstagramEditSheet />
              {/* Global LinkedIn Edit Sheet */}
              <LinkedInEditSheet />
              {/* Global WhatsApp Edit Sheet */}
              <WhatsAppEditSheet />
              {/* Global Profile Description Sheet */}
              <ProfileDescriptionSheet />
              {/* Global Support Sheet */}
              <SupportSheet />
              {/* Global Share Profile Sheet */}
              <ShareProfileSheet />
              {/* Global Auth Entry Sheet */}
              <AuthEntrySheet />
              {/* Global Auth Modal */}
              <AuthModal />
              {/* Global Phone Sign-up Sheet */}
              <PhoneSignupSheet />
            </WalletAllocProvider>
          </WalletModeProvider>
        </SplashOnceProvider>
      </body>
    </html>
  )
}

