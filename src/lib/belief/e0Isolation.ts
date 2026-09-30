export function isE0PreviewPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  return pathname === '/desk/e0' || pathname.startsWith('/desk/e0/')
}
