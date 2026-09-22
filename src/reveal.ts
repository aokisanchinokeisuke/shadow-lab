/** Distance is from the emitter to the body's fixed bounding-box center, in m. */
export class SkeletonReveal {
  active = false;
  opacity = 0;
  target = 0;
  readonly hysteresis = 0.015;

  update(distance: number, enabled: boolean, start: number, fadeWidth: number, dt: number) {
    if (!enabled || !Number.isFinite(distance)) {
      this.active = false;
      this.target = this.opacity = 0;
      return this.opacity;
    }
    if (distance <= start - this.hysteresis) this.active = true;
    else if (distance >= start + this.hysteresis) this.active = false;
    const t = Math.max(0, Math.min(1, (start - distance) / fadeWidth));
    this.target = this.active ? t * t * (3 - 2 * t) : 0;
    // Time smoothing avoids an abrupt jump at the Schmitt trigger boundary.
    this.opacity += (this.target - this.opacity) * (1 - Math.exp(-dt / 0.16));
    if (Math.abs(this.target - this.opacity) < 0.0001) this.opacity = this.target;
    return this.opacity;
  }
}
