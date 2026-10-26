// Decides when a stream of two-finger scroll deltas is a deliberate horizontal swipe.
// Pure and clock-injected so it can be tested without a trackpad.
function createSwipeDetector({ threshold = 220, dominance = 2.5, quietMs = 140, cooldownMs = 700 } = {}) {
  let sumX = 0;
  let sumY = 0;
  let lastAt = -Infinity;
  let blockedUntil = -Infinity;
  let armed = true; // false after a swipe until the scroll stream has gone quiet, so the momentum tail cannot re-fire

  // Returns 'left' or 'right' (the sign of horizontal movement, left = negative x) once per gesture, else null.
  function feed(dx, dy, at) {
    if (!armed) {
      const quiet = at - lastAt > quietMs;
      lastAt = at;
      if (at < blockedUntil || !quiet) return null;
      armed = true;
      sumX = 0;
      sumY = 0;
    }
    if (at - lastAt > quietMs) {
      sumX = 0;
      sumY = 0;
    }
    lastAt = at;
    sumX += dx;
    sumY += dy;
    if (Math.abs(sumX) >= threshold && Math.abs(sumX) >= dominance * Math.abs(sumY)) {
      const direction = sumX < 0 ? 'left' : 'right';
      armed = false;
      blockedUntil = at + cooldownMs;
      return direction;
    }
    return null;
  }

  return { feed };
}

module.exports = { createSwipeDetector };
