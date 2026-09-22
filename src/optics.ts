export type Point = { x: number; y: number; z: number };
export const MODEL_HEIGHT = 0.052456;
export const TABLE_HEIGHT = 0.72;
export const MODEL_CENTER = { x: 0, y: TABLE_HEIGHT + MODEL_HEIGHT / 2, z: 0 };
export const MODEL_LENGTH = 0.09999419376254082;
export function optics(light: Point, wallDistance: number) {
  if (!Number.isFinite(wallDistance) || wallDistance <= 0 || !Object.values(light).every(Number.isFinite) || light.z < 0) throw new Error('Light must be on the front side; wall distance must be positive.');
  const dAxial = light.z;
  const dTrue = Math.hypot(light.x - MODEL_CENTER.x, light.y - MODEL_CENTER.y, light.z);
  // At Z=0 the reference-plane approximation is singular, not a finite zoom.
  const magnification = dAxial > 0 ? 1 + wallDistance / dAxial : null;
  return { dTrue, dAxial, magnification, approximateWidth: magnification === null ? null : MODEL_LENGTH * magnification,
    centerX: dAxial > 0 ? -wallDistance / dAxial * light.x : null,
    centerY: dAxial > 0 ? MODEL_CENTER.y - wallDistance / dAxial * (light.y - MODEL_CENTER.y) : null };
}
/** Exact ray/plane intersection for point light and wall z=-wallDistance. */
export function projectToWall(point: Point, light: Point, wallDistance: number): Point | null {
  const dz = point.z - light.z;
  if (Math.abs(dz) < 1e-9) return null;
  const t = (-wallDistance - light.z) / dz;
  if (t < 1) return null;
  return {x: light.x + t * (point.x - light.x), y: light.y + t * (point.y - light.y), z: -wallDistance};
}
