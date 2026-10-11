// Turns the character models (GLB) into pictures. The map, the player bubbles and the news desk are
// DOM, so each model is rendered once, off screen, into transparent PNGs (a full-body three-quarter
// view and a face close-up) that those places use like any other image. One shared WebGL context.
import {
  AmbientLight, Box3, DirectionalLight, HemisphereLight, Mesh, Object3D, PerspectiveCamera, Scene, SRGBColorSpace, Vector3, WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export type Framing = 'full' | 'face' | 'bust';

export interface ShotOptions {
  framing: Framing;
  /** Turn of the model in degrees away from facing the camera (0: straight on). */
  yaw?: number;
  width?: number;
  height?: number;
}

let renderer: WebGLRenderer | null = null;
const loader = new GLTFLoader();
const models = new Map<string, Promise<Object3D>>();

function gl() {
  if (!renderer) {
    renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
  }
  return renderer;
}

export function loadModel(url: string): Promise<Object3D> {
  let p = models.get(url);
  if (!p) {
    p = loader.loadAsync(url).then((g) => g.scene);
    models.set(url, p);
  }
  return p;
}

/** One transparent PNG (data URL) of a model. */
export function shoot(model: Object3D, o: ShotOptions): string {
  const width = o.width ?? (o.framing === 'face' ? 192 : o.framing === 'bust' ? 208 : 256);
  const height = o.height ?? (o.framing === 'face' ? 192 : o.framing === 'bust' ? 256 : 320);
  const r = gl();
  r.setSize(width, height, false);

  const scene = new Scene();
  scene.add(new HemisphereLight(0xffffff, 0xbfd9e8, 1.55));
  scene.add(new AmbientLight(0xffffff, 0.35));
  const key = new DirectionalLight(0xfff4e0, 2.1);
  key.position.set(2, 3, 4);
  scene.add(key);
  const rim = new DirectionalLight(0xa8e0ff, 0.9);
  rim.position.set(-3, 2, -2);
  scene.add(rim);

  // The model sits at the origin, turned by yaw; the camera frames it from its box.
  const holder = new Object3D();
  holder.add(model);
  // The models are authored facing away from the camera: half a turn plus the requested angle.
  holder.rotation.y = ((180 + (o.yaw ?? 0)) * Math.PI) / 180;
  scene.add(holder);
  const box = new Box3().setFromObject(holder);
  const size = box.getSize(new Vector3());
  const centre = box.getCenter(new Vector3());

  const cam = new PerspectiveCamera(24, width / height, 0.01, 50);
  if (o.framing === 'full') {
    const dist = (size.y / 2 / Math.tan((cam.fov * Math.PI) / 360)) * 1.18;
    cam.position.set(centre.x, centre.y + size.y * 0.04, centre.z + dist);
    cam.lookAt(centre.x, centre.y, centre.z);
  } else if (o.framing === 'bust') {
    // Head and chest: the top 58% of the figure.
    const span = size.y * 0.58;
    const cy = box.max.y - span / 2;
    const dist = (span / 2 / Math.tan((cam.fov * Math.PI) / 360)) * 1.04;
    cam.position.set(centre.x, cy + span * 0.03, centre.z + dist);
    cam.lookAt(centre.x, cy, centre.z);
  } else {
    // The head, centred on the head itself (an arm raised beside it must not drag the crop sideways).
    const head = headCentre(holder, box.max.y - size.y * 0.25);
    const headY = box.max.y - size.y * 0.165;
    const span = size.y * 0.4;
    const dist = (span / 2 / Math.tan((cam.fov * Math.PI) / 360)) * 1.05;
    cam.position.set(head.x, headY + span * 0.03, head.z + dist);
    cam.lookAt(head.x, headY, head.z);
  }
  r.render(scene, cam);
  const url = r.domElement.toDataURL('image/png');
  scene.remove(holder);
  holder.remove(model);
  return url;
}

/** The middle of the head: the 10th to 90th percentile of the vertices above `floorY`, so a raised arm does not skew it. */
function headCentre(root: Object3D, floorY: number) {
  const xs: number[] = [];
  const zs: number[] = [];
  const v = new Vector3();
  root.updateWorldMatrix(true, true);
  root.traverse((n) => {
    const mesh = n as Mesh;
    const pos = mesh.isMesh ? mesh.geometry.getAttribute('position') : null;
    if (!pos) return;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      if (v.y >= floorY) {
        xs.push(v.x);
        zs.push(v.z);
      }
    }
  });
  const mid = (a: number[]) => {
    if (!a.length) return 0;
    a.sort((p, q) => p - q);
    return (a[Math.floor(a.length * 0.1)]! + a[Math.floor(a.length * 0.9)]!) / 2;
  };
  return { x: mid(xs), z: mid(zs) };
}
