/**
 * Card Stack Style Calculator
 * 
 * Centralizes the math for computing card positions, sizes, and z-index
 * based on depth (0 = top card, increasing for cards behind).
 * 
 * Uses the audited step sizes:
 * - WIDTH_STEP = 32px per depth
 * - HEIGHT_STEP = 25px per depth
 * - TOP_STEP = 50px per depth
 * - LEFT_STEP = 16px per depth
 */

export type StackStyle = {
  width: string;      // calc(100% - (depth * 32px))
  maxWidth: number;   // 398 - depth * 32
  // height removed: card height is now determined by .card-canvas aspect-ratio (86/54)
  top: number;        // depth * 50
  left: number;       // depth * 16
  zIndex: number;     // total - depth
};

const BASE_WIDTH_PX = 398;
const WIDTH_STEP_PX = 32;
// BASE_HEIGHT_PX removed: card height is now determined by .card-canvas aspect-ratio (86/54)
// HEIGHT_STEP_PX removed: no longer needed since height is content-driven
const Y_STEP_PX = 44; // Reduced from 50 to 44 to accommodate 5 cards within viewport
const X_STEP_PX = 16;

export function getStackStyle(depth: number, total: number): StackStyle {
  // Clamp depth to prevent negative values from animation (prevents cards moving above container top)
  const safeDepth = Math.max(depth, 0);
  
  return {
    width: `calc(100% - ${safeDepth * WIDTH_STEP_PX}px)`,
    maxWidth: BASE_WIDTH_PX - WIDTH_STEP_PX * safeDepth,
    // height removed: card height is now determined by .card-canvas aspect-ratio (86/54)
    top: Y_STEP_PX * safeDepth, // Clamped to never be negative
    left: X_STEP_PX * safeDepth,
    zIndex: total - safeDepth,
  };
}

