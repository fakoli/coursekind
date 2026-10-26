import { useEffect, useRef, useCallback } from 'react';

/** Count visible, focused time only after interaction; pause after 60s idle.
 * Time is saved with explicit study actions, never with page loads or draft saves.
 */
export function useActiveStudyTime() {
  const seconds = useRef(0);
  const lastInteraction = useRef(-Infinity);
  useEffect(() => {
    const interact = () => { lastInteraction.current = performance.now(); };
    const events = ['pointerdown', 'keydown', 'scroll', 'input'] as const;
    events.forEach(event => window.addEventListener(event, interact, { passive: true }));
    let previous = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      if (document.visibilityState === 'visible' && document.hasFocus() && now - lastInteraction.current <= 60000) {
        seconds.current += Math.min((now - previous) / 1000, 1);
      }
      previous = now;
    }, 1000);
    return () => { clearInterval(timer); events.forEach(event => window.removeEventListener(event, interact)); };
  }, []);
  return useCallback(() => {
    const elapsed = Math.min(1800, seconds.current);
    seconds.current = 0;
    return elapsed;
  }, []);
}
