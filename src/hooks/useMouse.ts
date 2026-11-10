import { useEffect, useState, useCallback } from "react";

export interface MouseEvent {
  x: number;
  y: number;
  button: number; // 0 = left, 1 = middle, 2 = right
  action: "press" | "release" | "drag";
}

/**
 * Hook to handle mouse events in terminal
 * Parses ANSI escape sequences for mouse tracking
 */
export function useMouse() {
  const [mouseEvents, setMouseEvents] = useState<MouseEvent[]>([]);

  useEffect(() => {
    // This will be set up by the parent component with proper stdin
    return () => {};
  }, []);

  return { mouseEvents };
}

/**
 * Parse SGR mouse escape sequence
 * Format: \x1b[<button;x;yM or \x1b[<button;x;ym
 */
export function parseSGRMouseEvent(data: string): MouseEvent | null {
  // SGR extended mouse mode: ESC [ < button ; x ; y M/m
  const match = data.match(/\x1b\[<(\d+);(\d+);(\d+)([Mm])/);
  if (!match) return null;

  const [, button, x, y, actionChar] = match;
  return {
    x: parseInt(x ?? "0", 10),
    y: parseInt(y ?? "0", 10),
    button: parseInt(button ?? "0", 10) & 3, // Only use lower 2 bits for button number
    action: (actionChar ?? "M") === "M" ? "press" : "release",
  };
}

/**
 * Check if a click is within a bounding box
 */
export function isClickInBounds(
  click: MouseEvent,
  bounds: { x: number; y: number; width: number; height: number }
): boolean {
  return (
    click.x >= bounds.x &&
    click.x < bounds.x + bounds.width &&
    click.y >= bounds.y &&
    click.y < bounds.y + bounds.height
  );
}
