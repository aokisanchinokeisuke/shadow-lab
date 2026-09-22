import * as THREE from 'three';

/** A point emitter may approach the +Z-facing surface, but never enter the solid. */
export const CONTACT_GAP = 0.0001; // 0.1 mm numerical stand-off, not a finite emitter radius.
export function approachZ(surfaceZ: number, requestedGap: number) {
  return surfaceZ + Math.max(CONTACT_GAP, requestedGap);
}

/** World-space triangles; used only when the light moves, not on every render. */
export class ModelSurface {
  private triangles: THREE.Triangle[] = [];
  private closest = new THREE.Vector3();
  private ray = new THREE.Raycaster();
  constructor(private body: THREE.Object3D) {
    body.updateMatrixWorld(true);
    body.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const geometry = object.geometry;
      const positions = geometry.attributes.position;
      const count = geometry.index?.count ?? positions.count;
      for (let i = 0; i < count; i += 3) {
        const vertices = [0, 1, 2].map(j => new THREE.Vector3()
          .fromBufferAttribute(positions, geometry.index?.getX(i + j) ?? i + j)
          .applyMatrix4(object.matrixWorld));
        this.triangles.push(new THREE.Triangle(vertices[0], vertices[1], vertices[2]));
      }
    });
  }
  frontAt(x: number, y: number): THREE.Vector3 | null {
    this.ray.set(new THREE.Vector3(x, y, 1), new THREE.Vector3(0, 0, -1));
    return this.ray.intersectObject(this.body, true)[0]?.point.clone() ?? null;
  }
  distanceTo(point: THREE.Vector3): number {
    let squared = Infinity;
    for (const triangle of this.triangles) {
      triangle.closestPointToPoint(point, this.closest);
      squared = Math.min(squared, point.distanceToSquared(this.closest));
    }
    return Math.sqrt(squared);
  }
}
