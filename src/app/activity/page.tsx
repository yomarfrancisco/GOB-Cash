'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import TopGlassBar from '@/components/TopGlassBar'
import BottomGlassBar from '@/components/BottomGlassBar'
import { useAuthStore } from '@/store/auth'
import { NotificationsList } from '@/components/Notifications/NotificationsList'
import styles from './activity.module.css'

export default function ActivityPage() {
  const router = useRouter()
  const { isAuthed } = useAuthStore()
  
  // Redirect unauthenticated users to home
  useEffect(() => {
    if (!isAuthed) {
      router.replace('/')
    }
  }, [isAuthed, router])

  return (
    <div className="app-shell">
      <div className="mobile-frame">
        <div className="dashboard-container">
          {/* Overlay: Glass bars only */}
          <div className="overlay-glass">
            <div className="overlay-glass-inner">
              <TopGlassBar />
              <BottomGlassBar currentPath="/activity" onDollarClick={() => {}} />
            </div>
          </div>

          {/* Scrollable content */}
          <div className="scroll-content">
            <div className={`content ${styles.activityPage}`} style={{ background: '#fff' }}>
              {/* Header - match Home typography */}
              <div className="card-switch">
                <div className="frame-parent">
                  <div className="wallet-header">
                    <h1 className="wallet-title">Notifications</h1>
                  </div>
                </div>
              </div>

              {/* Activity sections */}
              <NotificationsList />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

