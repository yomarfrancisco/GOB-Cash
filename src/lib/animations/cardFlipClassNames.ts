/**
 * Card Flip Animation Class Names
 * 
 * This centralizes the CSS class names used for the card flip-up animation.
 * These classes are defined in src/styles/card-flip.css
 * 
 * To disable animation: Modify the transition in card-flip.css
 */

export const CARD_FLIP_CLASSES = {
  /** Base card class with transition */
  card: 'card',
  
  /** Stack container */
  stack: 'stack',
  
  /** Top card position */
  posTop: 'pos-top',
  
  /** Middle card position */
  posMid: 'pos-mid',
  
  /** Back card position */
  posBack: 'pos-back',
  
  /** Exit animation class (slides up and fades) */
  cyclingOut: 'cycling-out',
  
  /** Disables hover interaction */
  noHover: 'no-hover',
} as const

