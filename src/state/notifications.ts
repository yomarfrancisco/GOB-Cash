import { create } from 'zustand'

type NotificationsState = {
  isNotificationsOpen: boolean
  isOperatingCalendarOpen: boolean
  /** When true, closing the calendar brings the desk sheet back. */
  reopenDeskAfterCalendar: boolean
  openNotifications: () => void
  closeNotifications: () => void
  openOperatingCalendarFromDesk: () => void
  closeOperatingCalendar: () => void
}

let calendarOpenTimer: ReturnType<typeof setTimeout> | null = null

export const useNotificationsStore = create<NotificationsState>((set) => ({
  isNotificationsOpen: false,
  isOperatingCalendarOpen: false,
  reopenDeskAfterCalendar: false,
  openNotifications: () => set({ isNotificationsOpen: true }),
  closeNotifications: () => set({ isNotificationsOpen: false }),
  openOperatingCalendarFromDesk: () => {
    if (calendarOpenTimer) {
      clearTimeout(calendarOpenTimer)
      calendarOpenTimer = null
    }
    // Dismiss the desk first so the calendar is the only sheet on screen.
    set({
      isNotificationsOpen: false,
      isOperatingCalendarOpen: false,
      reopenDeskAfterCalendar: true,
    })
    calendarOpenTimer = setTimeout(() => {
      calendarOpenTimer = null
      set({ isOperatingCalendarOpen: true })
    }, 280)
  },
  closeOperatingCalendar: () => {
    if (calendarOpenTimer) {
      clearTimeout(calendarOpenTimer)
      calendarOpenTimer = null
    }
    set((state) => ({
      isOperatingCalendarOpen: false,
      isNotificationsOpen: state.reopenDeskAfterCalendar ? true : state.isNotificationsOpen,
      reopenDeskAfterCalendar: false,
    }))
  },
}))
