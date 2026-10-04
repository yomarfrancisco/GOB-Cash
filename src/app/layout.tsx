import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import IosKeyboardShim from '@/components/IosKeyboardShim'
import TopNotifications from '@/components/notifications/TopNotifications'
import ActivityEventsListener from '@/components/ActivityEventsListener'
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
import UsernameEditSheet from '@/components/UsernameEditSheet'
import FullNameEditSheet from '@/components/FullNameEditSheet'
import CardDetailsSheet from '@/components/CardDetailsSheet'
import BankingDetailsSheet from '@/components/BankingDetailsSheet'
import UsdtWalletAddressSheet from '@/components/UsdtWalletAddressSheet'
import ProfileDescriptionSheet from '@/components/ProfileDescriptionSheet'
import SupportSheet from '@/components/SupportSheet'
import ShareProfileSheet from '@/components/ShareProfileSheet'
import AuthModal from '@/components/AuthModal'
import AuthEntrySheet from '@/components/AuthEntrySheet'
import PhoneSignupSheet from '@/components/PhoneSignupSheet'
import PaymentDetailsSheetWrapper from '@/components/PaymentDetailsSheetWrapper'
import WhatsAppClaimBootstrap from '@/components/WhatsAppClaimBootstrap'
import ProfilePreviewSheetWrapper from '@/components/ProfilePreviewSheetWrapper'
import FirebaseAuthListener from '@/components/FirebaseAuthListener'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'GoBankless — Global Money Movement in Cash & Stablecoins',
  description:
    'GoBankless helps people and businesses move money globally — in cash or stablecoins via our agent network. Fast, low-cost, compliant.',
  metadataBase: new URL('https://www.gobankless.app'),
  keywords: [
    'GoBankless',
    'money transfer',
    'cash agents',
    'stablecoins',
    'USDT',
    'cross-border payments',
    'remittances',
    'Africa',
    'global payments',
    'fintech',
  ],
  icons: {
    icon: [
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  manifest: '/site.webmanifest',
  openGraph: {
    title: 'GoBankless — Global Money Movement',
    description:
      'Move money globally in cash or stablecoins via our agent network. Fast, low-cost, compliant.',
    url: 'https://www.gobankless.app',
    type: 'website',
    images: ['/assets/core/gobankless-logo.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'GoBankless — Global Money Movement',
    description: 'Move money globally in cash or stablecoins via local cash agents.',
    images: ['/assets/core/gobankless-logo.png'],
  },
  alternates: {
    canonical: 'https://www.gobankless.app',
  },
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
        {/* Preload ActionSheet icons for immediate display */}
        <link rel="preload" href="/assets/Tether.png" as="image" type="image/png" />
        {/* Structured data (JSON-LD) */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'FinancialService',
              name: 'GoBankless',
              description:
                'Move money globally in cash or stablecoins through our agent network.',
              url: 'https://www.gobankless.app',
              logo: 'https://www.gobankless.app/assets/core/gobankless-logo.png',
            }),
          }}
        />
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
        <FirebaseAuthListener />
        <SplashOnceProvider>
            <WalletModeProvider>
              <WalletAllocProvider>
              <TopNotifications />
              <ActivityEventsListener />
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
              {/* Global Username Edit Sheet */}
              <UsernameEditSheet />
              {/* Global Full Name Edit Sheet */}
              <FullNameEditSheet />
              {/* Global Card Details Sheet */}
              <CardDetailsSheet />
              {/* Global Banking Details Sheet */}
              <BankingDetailsSheet />
              {/* Global USDT Wallet Address Sheet */}
              <UsdtWalletAddressSheet />
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
              {/* Global Payment Details Sheet */}
              <PaymentDetailsSheetWrapper />
              <WhatsAppClaimBootstrap />
              {/* Global Profile Preview Sheet */}
              <ProfilePreviewSheetWrapper />
            </WalletAllocProvider>
          </WalletModeProvider>
        </SplashOnceProvider>
        {/* Invisible reCAPTCHA container for Firebase Phone Auth */}
        <div id="recaptcha-container" style={{ display: 'none' }} />
      </body>
    </html>
  )
}

