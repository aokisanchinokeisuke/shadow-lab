import { describe, expect, it } from 'vitest';
import { MODEL_CENTER, optics, projectToWall } from './optics';
describe('point-source projection geometry', () => {
  it.each([[0.15, 4.3333333333], [0.30, 2.6666666667], [0.45, 2.1111111111]])('distance %s gives expected magnification', (z, expected) => {
    const result = optics({...MODEL_CENTER, z}, 0.5);
    expect(result.dTrue).toBeCloseTo(z, 9);
    expect(result.magnification).toBeCloseTo(expected, 8);
  });
  it('uses axial distance rather than Euclidean distance for an offset light', () => {
    const result = optics({...MODEL_CENTER, x: 0.4, z: 0.3}, 0.5);
    expect(result.dTrue).toBeCloseTo(0.5);
    expect(result.magnification).toBeCloseTo(8/3);
    expect(result.centerX).toBeCloseTo(-2/3);
  });
  it('projects a 100 mm planar object to 433.33 mm at 150 mm', () => {
    const light = {...MODEL_CENTER, z: 0.15};
    const left = projectToWall({...MODEL_CENTER, x: -0.05}, light, 0.5)!;
    const right = projectToWall({...MODEL_CENTER, x: 0.05}, light, 0.5)!;
    expect(right.x-left.x).toBeCloseTo(0.4333333333, 9);
    expect(right.z).toBe(-0.5);
  });
  it('moves the shadow opposite the source, retaining height reference', () => {
    const light = {x: 0.06, y: MODEL_CENTER.y+0.03, z: 0.3};
    expect(projectToWall(MODEL_CENTER, light, 0.5)!.x).toBeCloseTo(-0.1);
    expect(projectToWall(MODEL_CENTER, light, 0.5)!.y).toBeCloseTo(MODEL_CENTER.y-0.05);
  });
  it('rejects degenerate geometry', () => {
    expect(optics({...MODEL_CENTER,z:0},0.5).magnification).toBeNull();
    expect(() => optics({...MODEL_CENTER,z:-.1},0.5)).toThrow();
    expect(() => optics({...MODEL_CENTER,z:0.3},-0.5)).toThrow();
    expect(projectToWall({...MODEL_CENTER,z:0.3},{...MODEL_CENTER,z:0.3},0.5)).toBeNull();
  });
  it('magnifies the nearer surface more without an artificial head zoom', () => {
    const light={x:-.03,y:MODEL_CENTER.y,z:.018};
    const near=projectToWall({x:-.029,y:MODEL_CENTER.y,z:.008},light,.5)!;
    const far=projectToWall({x:-.029,y:MODEL_CENTER.y,z:-.008},light,.5)!;
    expect(near.x-light.x).toBeCloseTo(.0518,8);
    expect(far.x-light.x).toBeCloseTo(.0199230769,8);
    expect(near.x-light.x).toBeGreaterThan(far.x-light.x);
  });
});
