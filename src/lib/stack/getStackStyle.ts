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
  height: number;     // 238 - depth * 25
  top: number;        // depth * 50
  left: number;       // depth * 16
  zIndex: number;     // total - depth
};

const BASE_WIDTH_PX = 398;
const WIDTH_STEP_PX = 32;
const BASE_HEIGHT_PX = 238;
const HEIGHT_STEP_PX = 25;
const Y_STEP_PX = 44; // Reduced from 50 to 44 to accommodate 5 cards within viewport
const X_STEP_PX = 16;

export function getStackStyle(depth: number, total: number): StackStyle {
  // Clamp depth to prevent negative values from animation (prevents cards moving above container top)
  const safeDepth = Math.max(depth, 0);
  
  return {
    width: `calc(100% - ${safeDepth * WIDTH_STEP_PX}px)`,
    maxWidth: BASE_WIDTH_PX - WIDTH_STEP_PX * safeDepth,
    height: BASE_HEIGHT_PX - HEIGHT_STEP_PX * safeDepth,
    top: Y_STEP_PX * safeDepth, // Clamped to never be negative
    left: X_STEP_PX * safeDepth,
    zIndex: total - safeDepth,
  };
}

