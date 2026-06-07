// main.ts
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { NewCentralStar } from './star/NewCentralStar';
import { StationManager } from './station/StationManager';
import { AsteroidField } from './asteroids/AsteroidField';

class CosmoCraftGame {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  star: NewCentralStar;
  stationManager: StationManager;
  asteroidFields: AsteroidField[] = [];
  
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 10000);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    
    this.init();
  }
  
  private init() {
    // Настройка рендерера
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(this.renderer.domElement);
    
    // Создание звезды
    this.star = new NewCentralStar(8);
    this.scene.add(this.star.mesh);
    this.scene.add(this.star.light);
    this.scene.add(this.star.glowLight);
    
    // Создание менеджера станций
    this.stationManager = new StationManager(this.scene);
    
    // Создание астероидных полей
    this.createAsteroidFields();
    
    // Настройка камеры
    this.camera.position.set(500, 500, 1000);
    this.controls.target.set(0, 0, 0);
    
    // Добавление туманности
    this.scene.fog = new THREE.FogExp2(0x000000, 0.0005);
    
    // Звездное небо
    this.createStarfield();
    
    // Запуск анимации
    this.animate();
  }
  
  private createAsteroidFields() {
    // Создаем поля на разном расстоянии от звезды
    const distances = [300, 600, 900];
    
    distances.forEach(distance => {
      const field = new AsteroidField(
        this.scene,
        new THREE.Vector3(distance, 0, 0),
        200,
        0.5
      );
      this.asteroidFields.push(field);
    });
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
    
    // Обновление звезды и эффектов
    const starEffects = this.star.update(this.camera.position);
    
    // Обновление UI с предупреждениями
    if (starEffects.warning) {
      this.showWarning(starEffects.warning);
    }
    
    // Вращение астероидов
    this.asteroidFields.forEach(field => {
      field.asteroids.forEach(asteroid => {
        asteroid.mesh.rotation.x += 0.001;
        asteroid.mesh.rotation.y += 0.002;
      });
    });
    
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
  
  private showWarning(text: string) {
    // Показываем предупреждение на экране
    const warningEl = document.getElementById('warning') || document.createElement('div');
    warningEl.id = 'warning';
    warningEl.textContent = text;
    warningEl.style.position = 'absolute';
    warningEl.style.top = '10px';
    warningEl.style.left = '50%';
    warningEl.style.transform = 'translateX(-50%)';
    warningEl.style.color = 'red';
    warningEl.style.fontSize = '24px';
    warningEl.style.fontWeight = 'bold';
    warningEl.style.textShadow = '2px 2px 2px black';
    document.body.appendChild(warningEl);
  }
}

// Запуск игры
window.onload = () => {
  new CosmoCraftGame();
};
