'use client'

import { Mail } from 'lucide-react'
import Image from 'next/image'
import ActionSheet from '../ActionSheet'
import ActionSheetItem from '../ActionSheetItem'
import { useAuthStore } from '@/store/auth'

export default function SignInModal() {
  const { isSignInOpen, closeSignIn, completeFakeSignIn } = useAuthStore()

  return (
    <ActionSheet open={isSignInOpen} onClose={closeSignIn} title="Sign in to continue" size="tall">
      <div style={{ padding: '8px 0' }}>
        <p style={{ 
          fontSize: '15px', 
          color: '#666', 
          marginBottom: '24px',
          lineHeight: '1.5',
          padding: '0 4px'
        }}>
          Create a secure account so we can keep track of your cash-to-crypto transfers.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
          <ActionSheetItem
            icon={<Image src="/assets/WhatsApp_Balck.png" alt="Google" width={24} height={24} style={{ objectFit: 'contain' }} unoptimized />}
            title="Continue with Google"
            caption="Sign in with your Google account"
            onClick={() => {
              // Placeholder for future OAuth
              console.log('Google sign-in clicked (not implemented yet)')
            }}
          />
          <ActionSheetItem
            icon={<Mail size={22} strokeWidth={2} />}
            title="Continue with phone or email"
            caption="Sign in with your phone number or email address"
            onClick={() => {
              // Placeholder for future email/phone auth
              console.log('Email/phone sign-in clicked (not implemented yet)')
            }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingTop: '8px', borderTop: '1px solid rgba(0,0,0,0.1)' }}>
          <button
            onClick={completeFakeSignIn}
            style={{
              width: '100%',
              padding: '16px',
              backgroundColor: '#000',
              color: '#fff',
              border: 'none',
              borderRadius: '12px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'opacity 0.2s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.opacity = '0.8'}
            onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
          >
            Sign in (demo)
          </button>
          <button
            onClick={closeSignIn}
            style={{
              width: '100%',
              padding: '16px',
              backgroundColor: 'transparent',
              color: '#666',
              border: '1px solid rgba(0,0,0,0.1)',
              borderRadius: '12px',
              fontSize: '16px',
              fontWeight: '500',
              cursor: 'pointer',
              transition: 'opacity 0.2s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.opacity = '0.7'}
            onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
          >
            Not now
          </button>
        </div>
      </div>
    </ActionSheet>
  )
}

