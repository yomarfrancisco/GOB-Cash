'use client'

import { GoogleOAuthProvider } from '@react-oauth/google'

interface GoogleOAuthProviderClientProps {
  children: React.ReactNode
}

export default function GoogleOAuthProviderClient({ children }: GoogleOAuthProviderClientProps) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID

  // Always wrap with provider, even if client ID is missing
  // This prevents SSR errors. The hook will handle missing client ID gracefully
  // Use a placeholder if client ID is missing to satisfy the provider requirement
  const safeClientId = clientId || 'placeholder-client-id'

  if (!clientId) {
    console.warn('NEXT_PUBLIC_GOOGLE_CLIENT_ID is not set. Google OAuth will not work.')
  }

  return <GoogleOAuthProvider clientId={safeClientId}>{children}</GoogleOAuthProvider>
}

