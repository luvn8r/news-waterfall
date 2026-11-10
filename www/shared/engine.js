/*
 * engine.js — the waterfall motion model (no DOM; fully testable).
 *
 * Coordinates: y = distance of an item's TOP edge from the top of the widget, in pixels.
 * Every step ADDS to y, so items can only ever move DOWN. New items are placed just
 * above the top edge (y = -height) and slide into view; an item is removed for good
 * once its top edge passes the bottom edge.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else { root.NW = root.NW || {}; root.NW.engine = mod; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  class WaterfallModel {
    /**
     * @param {object} o
     * @param {number} o.height      widget height in px
     * @param {number} o.gap         empty space between headlines in px
     * @param {number} o.speed       base speed in px/second (comfortable reading pace)
     */
    constructor(o) {
      this.height = o.height;
      this.gap = o.gap;
      this.baseSpeed = o.speed;
      this.speed = o.speed;      // current (eased) speed
      this.items = [];           // ordered top -> bottom; items[0] is the newest
      this.exited = 0;
    }

    setSize(height, gap, speed) {
      this.height = height;
      if (gap != null) this.gap = gap;
      if (speed != null) this.baseSpeed = speed;
    }

    /** True when there is room at the top for a new headline. */
    canSpawn() {
      if (!this.items.length) return true;
      return this.items[0].y >= this.gap;
    }

    /** Insert a new headline just above the top edge. */
    spawn(id, h) {
      const top = this.items.length ? Math.min(this.items[0].y - this.gap, 0) : 0;
      const item = { id, h, y: top - h };
      this.items.unshift(item);
      return item;
    }

    /**
     * Target speed adapts to how many unseen headlines are waiting, so the stream
     * slows down instead of running dry, and eases to a stop only when nothing new exists.
     */
    targetSpeed(buffered) {
      const b = this.baseSpeed;
      if (buffered <= 0) return 0;
      if (buffered < 5) return b * 0.35;
      if (buffered < 20) return b * 0.6;
      if (buffered < 80) return b * 0.85;
      if (buffered < 300) return b;
      return b * 1.2;
    }

    /**
     * Advance time by dt seconds. Returns the ids of items that left through the bottom.
     */
    step(dt, buffered) {
      if (!(dt > 0)) return [];
      dt = Math.min(dt, 0.25);                       // never jump after a stall
      const target = this.targetSpeed(buffered);
      // When nothing is waiting but the top still has a gap to close, keep drifting
      // gently so existing headlines settle rather than freezing mid-gap.
      const t = target === 0 && !this.canSpawn() ? this.baseSpeed * 0.2 : target;
      const k = 1 - Math.exp(-dt / 1.2);             // smooth ~1s easing, no sudden changes
      this.speed += (t - this.speed) * k;
      if (this.speed < 0.01 && t === 0) this.speed = 0;
      const dy = Math.max(0, this.speed * dt);       // dy is never negative => never upward
      const gone = [];
      for (const it of this.items) it.y += dy;
      while (this.items.length && this.items[this.items.length - 1].y >= this.height) {
        gone.push(this.items.pop().id);
        this.exited++;
      }
      return gone;
    }

    /** Change an item's measured height (e.g. after a resize re-wraps the text). */
    resize(id, h) {
      const i = this.items.findIndex(x => x.id === id);
      if (i === -1) return;
      this.items[i].h = h;
      // re-stack items below it so spacing stays even and nothing overlaps
      for (let j = i + 1; j < this.items.length; j++) {
        const above = this.items[j - 1];
        const minY = above.y + above.h + this.gap;
        if (this.items[j].y < minY) this.items[j].y = minY;
      }
    }
  }

  return { WaterfallModel };
});
