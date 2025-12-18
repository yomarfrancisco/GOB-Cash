/**
 * Shared Resend email helper
 * Reused for deposit notifications and withdrawal treasury shortfall alerts
 */

import * as functions from 'firebase-functions'

const CORE_AGENT_EMAIL = 'ygor.francisco@gmail.com'

/**
 * Get CoreAgent email address
 * Falls back to functions config if available
 */
export function getCoreAgentEmail(): string {
  const configEmail = functions.config().email?.to
  return configEmail || CORE_AGENT_EMAIL
}

/**
 * Send email using Resend API
 */
export async function sendEmailViaResend(
  to: string,
  subject: string,
  html: string
): Promise<void> {
  const apiKey = functions.config().resend?.api_key
  if (!apiKey) {
    console.error('[ResendEmail] RESEND_API_KEY not configured')
    throw new Error('Email service not configured')
  }

  const emailFrom = functions.config().email?.from || 'noreply@gobankless.com'

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: emailFrom,
      to: [to],
      subject,
      html,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('[ResendEmail] Resend API error:', {
      status: response.status,
      statusText: response.statusText,
      error: errorText,
    })
    throw new Error(`Resend API error: ${response.status} ${response.statusText}`)
  }

  const result = await response.json()
  console.log('[ResendEmail] Email sent successfully:', result.id)
}

/**
 * Generate treasury shortfall email HTML
 */
export function generateTreasuryShortfallEmail(
  withdrawalId: string,
  userId: string,
  userHandle: string | null,
  userEmail: string | null,
  toAddress: string,
  requestedAmountUSDT: number,
  sentAmountUSDT: number,
  treasuryBalanceUSDT: number,
  shortfallUSDT: number,
  txId: string | null,
  timestamp: any
): string {
  const dateStr = timestamp?.toDate?.()?.toISOString() || new Date().toISOString()
  
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #f4f4f4; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
          .alert { background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; }
          .info { background-color: #e7f3ff; padding: 15px; margin: 20px 0; border-radius: 5px; }
          .detail { margin: 10px 0; }
          .label { font-weight: bold; display: inline-block; width: 200px; }
          .value { color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>⚠️ Treasury Shortfall Alert</h1>
            <p>Withdrawal partially filled or failed due to insufficient treasury balance</p>
          </div>
          
          <div class="alert">
            <strong>Status:</strong> ${sentAmountUSDT === 0 ? 'FAILED - Zero Treasury' : 'PARTIAL FILL'}
          </div>
          
          <div class="info">
            <h2>Withdrawal Details</h2>
            <div class="detail">
              <span class="label">Withdrawal ID:</span>
              <span class="value">${withdrawalId}</span>
            </div>
            ${txId ? `<div class="detail"><span class="label">Transaction ID:</span><span class="value">${txId}</span></div>` : ''}
            <div class="detail">
              <span class="label">Requested Amount:</span>
              <span class="value">${requestedAmountUSDT.toFixed(6)} USDT</span>
            </div>
            <div class="detail">
              <span class="label">Amount Sent:</span>
              <span class="value">${sentAmountUSDT.toFixed(6)} USDT</span>
            </div>
            <div class="detail">
              <span class="label">Treasury Balance (at attempt):</span>
              <span class="value">${treasuryBalanceUSDT.toFixed(6)} USDT</span>
            </div>
            <div class="detail">
              <span class="label">Shortfall:</span>
              <span class="value">${shortfallUSDT.toFixed(6)} USDT</span>
            </div>
          </div>
          
          <div class="info">
            <h2>User Information</h2>
            <div class="detail">
              <span class="label">User ID:</span>
              <span class="value">${userId}</span>
            </div>
            ${userHandle ? `<div class="detail"><span class="label">Handle:</span><span class="value">@${userHandle}</span></div>` : ''}
            ${userEmail ? `<div class="detail"><span class="label">Email:</span><span class="value">${userEmail}</span></div>` : ''}
            <div class="detail">
              <span class="label">Recipient Address:</span>
              <span class="value">${toAddress}</span>
            </div>
          </div>
          
          <div class="info">
            <p><strong>Timestamp:</strong> ${dateStr}</p>
          </div>
        </div>
      </body>
    </html>
  `
}

