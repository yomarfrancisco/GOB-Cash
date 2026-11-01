/** Home is the only product surface besides overlay sheets (keypad / desk). */
export const HOME_PATH = '/'

/** Open the routing desk on Home. */
export const HOME_DESK_PATH = '/?desk=1'

/** Remap legacy /profile destinations onto Home. */
export function quarantineProfileHref(href: string | null | undefined): string {
  if (!href) return HOME_PATH
  if (!href.startsWith('/profile')) return href
  try {
    const url = new URL(href, 'https://gobankless.local')
    if (url.searchParams.get('activity') === '1') {
      url.searchParams.delete('activity')
      url.searchParams.set('desk', '1')
    }
    const q = url.searchParams.toString()
    return q ? `${HOME_PATH}?${q}` : HOME_PATH
  } catch {
    return HOME_PATH
  }
}
