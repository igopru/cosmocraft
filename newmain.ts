// newmain.ts — тестовый entry point
// Компиляция: npx tsc newmain.ts --outDir public/dist --moduleResolution bundler --module ES2020 --target ES2020 --lib ES2020,DOM --skipLibCheck --allowSyntheticDefaultImports true || tsc
// Затем в public/index.html заменить "/dist/client/main.js" на "/dist/newmain.js"

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { NewCentralStar } from './src/star/NewCentralStar';

class CosmoCraftGame {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  star: NewCentralStar;
  clock: THREE.Clock;

  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 10000);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.clock = new THREE.Clock();
    this.init();
  }

  private init() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(this.renderer.domElement);

    // Освещение
    const ambient = new THREE.AmbientLight(0x404060, 0.5);
    this.scene.add(ambient);

    this.star = new NewCentralStar(8);
    this.scene.add(this.star.mesh);
    this.scene.add(this.star.light);
    this.scene.add(this.star.glowLight);

    console.log('Планет создано:', this.star.getPlanets().length);
    console.log('Планеты:', this.star.getPlanets().map(p => `${p.name} r=${p.radius} orb=${p.orbitalDistance}`));

    this.camera.position.set(0, 800, 1200);
    this.controls.target.set(0, 0, 0);

    this.scene.fog = new THREE.FogExp2(0x000000, 0.0005);
    this.createStarfield();
    this.animate();
  }

  private createStarfield() {
    const starsGeo = new THREE.BufferGeometry();
    const starsCount = 5000;
    const positions = new Float32Array(starsCount * 3);
    for (let i = 0; i < starsCount * 3; i += 3) {
      positions[i] = (Math.random() - 0.5) * 10000;
      positions[i+1] = (Math.random() - 0.5) * 10000;
      positions[i+2] = (Math.random() - 0.5) * 10000;
    }
    starsGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const starsMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.5 });
    const stars = new THREE.Points(starsGeo, starsMat);
    this.scene.add(stars);
  }

  private animate() {
    requestAnimationFrame(() => this.animate());
    const deltaTime = this.clock.getDelta();
    this.star.update(deltaTime);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

window.onload = () => {
  new CosmoCraftGame();
};
