import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CONTACT_GAP, ModelSurface, approachZ } from './surface';
import { readFileSync } from 'node:fs';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

describe('near-field contact and geometry',()=>{
  const body=new THREE.Mesh(new THREE.BoxGeometry(.1,.05,.03),new THREE.MeshBasicMaterial());
  body.position.y=.745;
  const surface=new ModelSurface(body);
  it('finds the first real surface, rather than the model center',()=>{
    expect(surface.frontAt(0,.745)!.z).toBeCloseTo(.015,7);
    expect(surface.frontAt(.1,.745)).toBeNull();
  });
  it('keeps a finite gap at the zero-distance setting',()=>{
    const front=surface.frontAt(0,.745)!;
    const z=approachZ(front.z,0);
    expect(z-front.z).toBeCloseTo(CONTACT_GAP,9);
    expect(surface.distanceTo(new THREE.Vector3(0,.745,z))).toBeCloseTo(CONTACT_GAP,9);
  });
  it('measures distance to triangle interiors, not only vertices',()=>{
    expect(surface.distanceTo(new THREE.Vector3(0,.745,.025))).toBeCloseTo(.01,7);
    expect(approachZ(.015,.05)).toBeCloseTo(.065,9);
  });
});

it('approaches the actual gen04 head surface without entering it',async()=>{
  const bytes=readFileSync(new URL('../public/models/body_td.glb',import.meta.url));
  const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  gltf.scene.rotation.y=-Math.PI/2;gltf.scene.position.y=.72;
  const surface=new ModelSurface(gltf.scene);
  const head=surface.frontAt(-.03,.752)!;
  const body=surface.frontAt(.012,.748)!;
  expect(head.z).toBeCloseTo(.008305744,7);
  expect(body.z).toBeCloseTo(.012819939,7);
  for(const gap of [.05,.01,.001,0]){
    const lamp=new THREE.Vector3(head.x,head.y,approachZ(head.z,gap));
    const distance=surface.distanceTo(lamp);
    expect(distance).toBeGreaterThan(0);
    expect(distance).toBeLessThanOrEqual(Math.max(CONTACT_GAP,gap)+1e-9);
    expect(lamp.z).toBeGreaterThan(head.z);
  }
});
