'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import TopGlassBar from '@/components/TopGlassBar'
import BottomGlassBar from '@/components/BottomGlassBar'
import { useAuthStore } from '@/store/auth'
import { NotificationsList } from '@/components/notifications/NotificationsList'
import styles from './activity.module.css'

export default function ActivityPage() {
  const router = useRouter()
  const { isAuthed } = useAuthStore()
  const [searchQuery, setSearchQuery] = useState('')
  
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
            <div className={`content ${styles.activityPage}`}>
              {/* Header - match Home typography */}
              <div className="card-switch">
                <div className="frame-parent">
                  <div className="wallet-header">
                    <h1 className="wallet-title">Activity</h1>
                  </div>
                </div>
              </div>

              <div className={styles.searchBar}>
                <svg
                  className={styles.searchIcon}
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2" />
                  <path d="m21 21-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search payment activity"
                  className={styles.searchInput}
                  aria-label="Search payment activity"
                />
              </div>

              {/* Activity sections */}
              <NotificationsList searchQuery={searchQuery} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

