import { expect,it } from 'vitest';
import { cleanParameters, comparisonConditions, layoutDefaults, projectionArea, shadowFit } from './layout';
const params={...layoutDefaults,modelWall:.5,wallWidth:1,lightX:0,lightY:.746228,lightZ:.3};
it('computes independent projector width, height and lens position',()=>{
 const area=projectionArea({...params,projectorDistance:1.05,projectorRatio:1.5,projectorAspect:16/9,projectorX:.1,projectorY:.05});
 expect(area.width).toBeCloseTo(.7);expect(area.height).toBeCloseTo(.39375);
 expect(area.lens.z).toBeCloseTo(.55);expect(area.bounds.minX).toBeCloseTo(-.25);
 expect(area.bounds.minY).toBeCloseTo(.746228+.05-.39375/2);
});
it('checks height, offsets and wall intersection, not only the shadow width',()=>{
 const area=projectionArea({...params,projectorDistance:.7,projectorRatio:1,wallHeight:.2});
 expect(area.extendsWall).toBe(true);
 expect(shadowFit({minX:-.1,maxX:.1,minY:.64,maxY:.86,unbounded:false},area.usable).fits).toBe(false);
 expect(shadowFit({minX:-.1,maxX:.1,minY:.7,maxY:.8,unbounded:false},area.usable).fits).toBe(true);
 expect(shadowFit({minX:-.1,maxX:.1,minY:.7,maxY:.8,unbounded:true},area.usable).unbounded).toBe(true);
 const offset=projectionArea({...params,projectorX:1});
 expect(shadowFit({minX:-.1,maxX:.1,minY:.7,maxY:.8,unbounded:false},offset.usable).fits).toBe(false);
});
it('offers nine reproducible conditions and validates imported values',()=>{
 const conditions=comparisonConditions();expect(conditions).toHaveLength(9);
 expect(conditions.find(c=>c.modelWall===.5&&c.lightZ===.15)!.approximateWidth).toBeCloseTo(.4333,3);
 const validated=cleanParameters(params,{modelWall:9,projectorRatio:0,lightX:'bad',showProjector:false,lightZ:NaN,unexpected:1});
 expect(validated.modelWall).toBe(1.5);expect(validated.projectorRatio).toBe(.3);expect(validated.lightX).toBe(0);
 expect(validated.showProjector).toBe(false);expect(validated.lightZ).toBe(.3);expect(validated).not.toHaveProperty('unexpected');
});
