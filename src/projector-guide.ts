import * as THREE from 'three';
import { projectionArea, type LayoutParameters } from './layout';

export class ProjectorGuide {
  readonly group=new THREE.Group();
  private wallView=false;
  private showRays=false;
  private frame=new THREE.LineLoop(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:'#d68727'}));
  private rays=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:'#d68727',transparent:true,opacity:.4}));
  private lens=new THREE.Mesh(new THREE.BoxGeometry(.055,.028,.04),new THREE.MeshBasicMaterial({color:'#a9681c'}));
  constructor(){this.group.add(this.frame,this.rays,this.lens);}
  setWallView(enabled:boolean){
    this.wallView=enabled;
    // Wall inspection must not be obscured by the illustrative lens or rays.
    this.rays.visible=this.lens.visible=this.showRays&&!enabled;
  }
  update(p:LayoutParameters){
    const area=projectionArea(p),b=area.bounds;
    const z=-p.modelWall+.0006;
    const corners=[new THREE.Vector3(b.minX,b.minY,z),new THREE.Vector3(b.maxX,b.minY,z),new THREE.Vector3(b.maxX,b.maxY,z),new THREE.Vector3(b.minX,b.maxY,z)];
    this.frame.geometry.dispose();this.frame.geometry=new THREE.BufferGeometry().setFromPoints(corners);
    this.lens.position.set(area.lens.x,area.lens.y,area.lens.z);
    const segments=corners.flatMap(c=>[this.lens.position.clone(),c]);
    this.rays.geometry.dispose();this.rays.geometry=new THREE.BufferGeometry().setFromPoints(segments);
    this.group.visible=p.showProjector;
    this.showRays=p.projectorRays;this.setWallView(this.wallView);
  }
}
