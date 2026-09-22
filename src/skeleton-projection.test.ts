import { expect, it } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SkeletonReveal } from './reveal';
import { SkeletonProjection, syncProjectionCamera } from './skeleton-projection';
import { MODEL_CENTER, TABLE_HEIGHT, projectToWall } from './optics';

it('fades in when approaching, out when retreating, and disables immediately',()=>{
  const reveal=new SkeletonReveal();
  expect(reveal.update(.45,true,.34,.1,2)).toBe(0);
  expect(reveal.update(.3,true,.34,.1,2)).toBeCloseTo(.352,3);
  expect(reveal.update(.15,true,.34,.1,2)).toBeCloseTo(1,3);
  expect(reveal.update(.45,true,.34,.1,2)).toBe(0);
  reveal.update(.15,true,.34,.1,2);
  expect(reveal.update(.15,false,.34,.1,.016)).toBe(0);
});

it('retains hysteresis state through noise near the boundary',()=>{
  const reveal=new SkeletonReveal();
  reveal.update(.33,true,.34,.1,.1);expect(reveal.active).toBe(false);
  reveal.update(.32,true,.34,.1,.1);expect(reveal.active).toBe(true);
  for(const d of [.339,.341,.338,.35]){
    reveal.update(d,true,.34,.1,.1);expect(reveal.active).toBe(true);
  }
  reveal.update(.36,true,.34,.1,.1);expect(reveal.active).toBe(false);
});

it.each([
  [0,MODEL_CENTER.y,.30,0,MODEL_CENTER.y,0,.5],
  [.08,MODEL_CENTER.y+.045,.15,0,MODEL_CENTER.y,0,.7],
  [-.03,.752,.0183,-.03,.752,.0083,.5],
  [-.03,.752,.0084,-.03,.752,.0083,.2],
])('uses identical projector UV for a 3D bone point and its wall intersection at light (%s,%s,%s)',(x,y,z,tx,ty,tz,wallDistance)=>{
  const light=new THREE.SpotLight();
  light.position.set(x,y,z);light.target.position.set(tx,ty,tz);
  light.shadow.camera.near=.000001;light.shadow.camera.far=3.5;
  const camera=syncProjectionCamera(light);
  expect(camera).toBe(light.shadow.camera);
  for(const point of [new THREE.Vector3(-.03,.752,.003),new THREE.Vector3(.012,.748,-.003)]){
    const wallPoint=projectToWall(point,light.position,wallDistance)!;
    const boneUV=point.clone().applyMatrix4(light.shadow.matrix);
    const wallUV=new THREE.Vector3(wallPoint.x,wallPoint.y,wallPoint.z).applyMatrix4(light.shadow.matrix);
    expect(wallUV.x).toBeCloseTo(boneUV.x,7);
    expect(wallUV.y).toBeCloseTo(boneUV.y,7);
  }
});

it('preserves the actual skeleton registration and shares the shadow matrix by reference',async()=>{
  const bytes=readFileSync(new URL('../public/models/skeleton_td.glb',import.meta.url));
  const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  gltf.scene.rotation.y=-Math.PI/2;gltf.scene.position.y=TABLE_HEIGHT;
  gltf.scene.updateMatrixWorld(true);
  const before=gltf.scene.matrixWorld.clone();
  const light=new THREE.SpotLight();
  const projection=new SkeletonProjection(gltf.scene,light);
  expect(gltf.scene.matrixWorld.equals(before)).toBe(true);
  expect(projection.dimensions[0]).toBeCloseTo(.096074544,7);
  expect(projection.overlay.material.uniforms.projectorMatrix.value).toBe(light.shadow.matrix);
  expect(projection.overlay.position.z).toBe(0);
  expect(projection.scene.children).toContain(gltf.scene);
  expect(projection.overlay.material.depthWrite).toBe(false);
  projection.target.dispose();
});
