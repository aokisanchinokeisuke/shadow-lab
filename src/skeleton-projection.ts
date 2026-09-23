import * as THREE from 'three';
import type { Bounds } from './layout';

/** Uses the *same camera and matrix* as the existing physical shadow. */
export function syncProjectionCamera(light: THREE.SpotLight) {
  light.updateWorldMatrix(true, false);
  light.target.updateWorldMatrix(true, false);
  light.shadow.camera.updateProjectionMatrix();
  light.shadow.updateMatrices(light);
  return light.shadow.camera;
}

const vertexShader = /* glsl */`
  uniform mat4 projectorMatrix;
  varying vec4 vProjected;
  varying vec3 vWorldPosition;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPosition = world.xyz;
    vProjected = projectorMatrix * world;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */`
  #include <packing>
  uniform sampler2D skeletonMap;
  uniform sampler2D bodyShadowMap;
  uniform float hasShadowMap;
  uniform float reveal;
  uniform float brightness;
  uniform float shadowRadius;
  uniform vec2 shadowTexel;
  uniform vec3 sourcePosition;
  uniform vec3 sourceDirection;
  uniform float coneCos;
  uniform float penumbraCos;
  uniform float clipProjection;
  uniform vec4 projectionBounds;
  varying vec4 vProjected;
  varying vec3 vWorldPosition;

  float blocked(vec2 uv, float wallDepth) {
    return 1.0 - step(wallDepth, unpackRGBAToDepth(texture2D(bodyShadowMap, uv)));
  }
  // The same 17 PCF sample positions as Three.js r180 getShadow(). This reads
  // the actual body shadow, not a second independently fitted silhouette.
  float bodyMask(vec3 p) {
    vec2 d = shadowTexel * shadowRadius;
    float s = blocked(p.xy, p.z);
    s += blocked(p.xy + vec2(-d.x,-d.y),p.z);
    s += blocked(p.xy + vec2(0.0,-d.y),p.z);
    s += blocked(p.xy + vec2(d.x,-d.y),p.z);
    s += blocked(p.xy + vec2(-d.x*0.5,-d.y*0.5),p.z);
    s += blocked(p.xy + vec2(0.0,-d.y*0.5),p.z);
    s += blocked(p.xy + vec2(d.x*0.5,-d.y*0.5),p.z);
    s += blocked(p.xy + vec2(-d.x,0.0),p.z);
    s += blocked(p.xy + vec2(-d.x*0.5,0.0),p.z);
    s += blocked(p.xy + vec2(d.x*0.5,0.0),p.z);
    s += blocked(p.xy + vec2(d.x,0.0),p.z);
    s += blocked(p.xy + vec2(-d.x*0.5,d.y*0.5),p.z);
    s += blocked(p.xy + vec2(0.0,d.y*0.5),p.z);
    s += blocked(p.xy + vec2(d.x*0.5,d.y*0.5),p.z);
    s += blocked(p.xy + vec2(-d.x,d.y),p.z);
    s += blocked(p.xy + vec2(0.0,d.y),p.z);
    s += blocked(p.xy + vec2(d.x,d.y),p.z);
    return s / 17.0;
  }
  void main() {
    if (reveal <= 0.0001 || hasShadowMap < 0.5 || vProjected.w <= 0.0) discard;
    if (clipProjection > 0.5 && (vWorldPosition.x < projectionBounds.x || vWorldPosition.x > projectionBounds.y || vWorldPosition.y < projectionBounds.z || vWorldPosition.y > projectionBounds.w)) discard;
    vec3 p = vProjected.xyz / vProjected.w;
    if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z < 0.0 || p.z > 1.0) discard;
    float cone = smoothstep(coneCos, penumbraCos,
      dot(normalize(vWorldPosition-sourcePosition), sourceDirection));
    vec4 bone = texture2D(skeletonMap, p.xy);
    float alpha = bone.a * bodyMask(p) * cone * reveal;
    if (alpha <= 0.001) discard;
    // RGB is coverage-weighted by linear texture filtering against clear black.
    gl_FragColor = vec4(bone.rgb / max(bone.a,0.001) * brightness, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class SkeletonProjection {
  readonly scene = new THREE.Scene();
  readonly target = new THREE.WebGLRenderTarget(2048, 2048, {
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    depthBuffer: true, generateMipmaps: false,
  });
  readonly overlay: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  readonly dimensions: number[];
  private key = new THREE.DirectionalLight('#fff8e9', 2.4);
  private previousClear = new THREE.Color();
  private previousViewport = new THREE.Vector4();
  private previousScissor = new THREE.Vector4();
  private pending = true;

  constructor(skeleton: THREE.Object3D, private light: THREE.SpotLight) {
    // Caller applies the exact body transform. Never center/resize this model.
    skeleton.traverse(object => {
      object.layers.set(0);
      if (object instanceof THREE.Mesh) {
        object.castShadow = object.receiveShadow = false;
        object.material = new THREE.MeshStandardMaterial({
          color: '#fff3db', roughness: 0.9, side: THREE.DoubleSide,
        });
      }
    });
    this.scene.add(skeleton, new THREE.HemisphereLight('#eefaff', '#3b4740', 0.9), this.key, this.key.target);
    this.dimensions = new THREE.Box3().setFromObject(skeleton).getSize(new THREE.Vector3()).toArray();
    const material = new THREE.ShaderMaterial({
      vertexShader, fragmentShader, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
      uniforms: {
        projectorMatrix: {value: light.shadow.matrix},
        skeletonMap: {value: this.target.texture},
        bodyShadowMap: {value: null}, hasShadowMap: {value: 0},
        reveal: {value: 0}, brightness: {value: 1.4},
        shadowRadius: {value: 0}, shadowTexel: {value: new THREE.Vector2(1/2048,1/2048)},
        sourcePosition: {value: new THREE.Vector3()}, sourceDirection: {value: new THREE.Vector3()},
        coneCos: {value: 0}, penumbraCos: {value: 0},
        clipProjection: {value: 0}, projectionBounds: {value: new THREE.Vector4()},
      },
    });
    this.overlay = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.68), material);
    this.overlay.renderOrder = 2;
    // Three generates the current frame's shadow map before drawing the wall.
    // Binding here also handles the first frame, when map was previously null.
    this.overlay.onBeforeRender = () => {
      material.uniforms.bodyShadowMap.value = light.shadow.map?.texture ?? null;
      material.uniforms.hasShadowMap.value = light.shadow.map ? 1 : 0;
      material.uniformsNeedUpdate = true;
    };
  }

  invalidate() { this.pending = true; }

  setProjectionBounds(bounds:Bounds,enabled:boolean){
    this.overlay.material.uniforms.clipProjection.value=enabled?1:0;
    this.overlay.material.uniforms.projectionBounds.value.set(bounds.minX,bounds.maxX,bounds.minY,bounds.maxY);
  }

  update(renderer: THREE.WebGLRenderer, wall: THREE.Mesh, opacity: number, brightness: number) {
    const {light, overlay} = this;
    overlay.position.copy(wall.position);
    overlay.quaternion.copy(wall.quaternion);
    overlay.scale.copy(wall.scale);
    overlay.visible = opacity > 0.0001;
    overlay.material.uniforms.reveal.value = opacity;
    overlay.material.uniforms.brightness.value = brightness;
    if (!overlay.visible || !this.pending) return;

    const camera = syncProjectionCamera(light);
    const u = overlay.material.uniforms;
    u.sourcePosition.value.copy(light.position);
    u.sourceDirection.value.subVectors(light.target.position,light.position).normalize();
    u.coneCos.value = Math.cos(light.angle);
    u.penumbraCos.value = Math.cos(light.angle*(1-light.penumbra));
    u.shadowRadius.value = light.shadow.radius;
    u.shadowTexel.value.set(1/light.shadow.mapSize.x,1/light.shadow.mapSize.y);
    this.key.position.copy(light.position).add(new THREE.Vector3(-.12,.2,.1));
    this.key.target.position.copy(light.target.position);

    const previousTarget = renderer.getRenderTarget();
    const previousAlpha = renderer.getClearAlpha();
    const previousScissorTest = renderer.getScissorTest();
    renderer.getClearColor(this.previousClear);
    renderer.getViewport(this.previousViewport);
    renderer.getScissor(this.previousScissor);
    try {
      renderer.setScissorTest(false);
      renderer.setRenderTarget(this.target);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      renderer.render(this.scene,camera);
      this.pending = false;
    } finally {
      renderer.setRenderTarget(previousTarget);
      renderer.setViewport(this.previousViewport);
      renderer.setScissor(this.previousScissor);
      renderer.setScissorTest(previousScissorTest);
      renderer.setClearColor(this.previousClear,previousAlpha);
    }
  }
}
