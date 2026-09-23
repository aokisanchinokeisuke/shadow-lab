import { MODEL_CENTER, MODEL_LENGTH } from './optics';

export const layoutDefaults = {
  wallHeight: .68, projectorDistance: .8, projectorRatio: 1.2,
  projectorAspect: 16 / 9, projectorX: 0, projectorY: 0,
  showProjector: true, projectorClip: true, projectorRays: false,
};
export type LayoutParameters = typeof layoutDefaults & {
  modelWall: number; wallWidth: number; lightX: number; lightY: number; lightZ: number;
};
export type Bounds = { minX:number; maxX:number; minY:number; maxY:number };
export type ShadowBounds = Bounds & { unbounded:boolean };

/** Ideal rectilinear projector, perpendicular to the wall. Distance is lens-to-wall. */
export function projectionArea(p: LayoutParameters) {
  const width = p.projectorDistance / p.projectorRatio;
  const height = width / p.projectorAspect;
  const centerY = MODEL_CENTER.y + p.projectorY;
  const bounds = {minX:p.projectorX-width/2,maxX:p.projectorX+width/2,minY:centerY-height/2,maxY:centerY+height/2};
  const usable = {
    minX:Math.max(bounds.minX,-p.wallWidth/2),maxX:Math.min(bounds.maxX,p.wallWidth/2),
    minY:Math.max(bounds.minY,MODEL_CENTER.y-p.wallHeight/2),maxY:Math.min(bounds.maxY,MODEL_CENTER.y+p.wallHeight/2),
  };
  return {width,height,bounds,usable,lens:{x:p.projectorX,y:centerY,z:-p.modelWall+p.projectorDistance},
    extendsWall:bounds.minX < -p.wallWidth/2 || bounds.maxX > p.wallWidth/2 || bounds.minY < MODEL_CENTER.y-p.wallHeight/2 || bounds.maxY > MODEL_CENTER.y+p.wallHeight/2};
}

export function shadowFit(shadow: ShadowBounds, usable: Bounds) {
  if (shadow.unbounded || !Object.values(shadow).every(v=>typeof v==='boolean'||Number.isFinite(v)))
    return {fits:false,unbounded:true,margin:null};
  const margin=Math.min(shadow.minX-usable.minX,usable.maxX-shadow.maxX,shadow.minY-usable.minY,usable.maxY-shadow.maxY);
  return {fits:margin>=0 && usable.minX<usable.maxX && usable.minY<usable.maxY,unbounded:false,margin};
}

export function comparisonConditions() {
  return [.3,.5,.7].flatMap(modelWall=>[.15,.3,.45].map(lightZ=>({
    modelWall,lightZ,approximateWidth:MODEL_LENGTH*(1+modelWall/lightZ),
  })));
}

export const parameterLimits: Record<string,[number,number]> = {
  modelWall:[.1,1.5],wallWidth:[.3,2.5],wallHeight:[.2,1.5],
  lightX:[-.5,.5],lightY:[.4,1.2],lightZ:[0,1],angle:[20,75],blur:[0,5],fov:[20,80],
  revealDistance:[.15,.45],fadeWidth:[.02,.14],skeletonBrightness:[.3,3],
  projectorDistance:[.1,4],projectorRatio:[.3,2.5],projectorAspect:[1,2.4],
  projectorX:[-1,1],projectorY:[-.5,.5],
};

/** Validate snapshots before applying them. Never merge arbitrary JSON properties. */
export function cleanParameters<T extends object>(base:T, input:unknown):T {
  const result={...base} as Record<string,unknown>;
  if(!input || typeof input!=='object' || Array.isArray(input))return result as T;
  for(const key of Object.keys(base)){
    const value=(input as Record<string,unknown>)[key];
    if(typeof result[key]==='boolean' && typeof value==='boolean')result[key]=value;
    else if(key in parameterLimits && typeof value==='number' && Number.isFinite(value)){
      const [min,max]=parameterLimits[key];result[key]=Math.max(min,Math.min(max,value));
    }
  }
  return result as T;
}
