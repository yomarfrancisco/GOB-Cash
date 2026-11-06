import type { ConversionStory } from '@/lib/animations/conversionStory'

type Listener = (story: ConversionStory) => void

let listener: Listener | null = null
let suppressUntilMs = 0

/** CardStack registers the player; submit paths emit stories. */
export function setConversionStoryPlayer(next: Listener | null): void {
  listener = next
}

/** Ignore wallet-inferred clear stories briefly after an explicit conversion story. */
export function suppressInferredStoriesFor(ms: number): void {
  suppressUntilMs = Math.max(suppressUntilMs, Date.now() + Math.max(0, ms))
}

export function inferredStoriesSuppressed(): boolean {
  return Date.now() < suppressUntilMs
}

export function requestConversionStory(story: ConversionStory | null | undefined): void {
  if (!story || !listener) return
  suppressInferredStoriesFor(8_000)
  listener(story)
}
