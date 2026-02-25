// src/star/CentralStar.ts
import * as THREE from 'three';

export interface DangerInfo {
  isDangerous: boolean;
  temperature: number;
  radiation: number;
  message: string;
}

export class CentralStar {
  mesh: THREE.Group;
  corona: THREE.Mesh;
  core: THREE.Mesh;
  particles: THREE.Points;
  light: THREE.PointLight;
  glowLight: THREE.PointLight;
  private temperature: number = 5778;
  private radiation: number = 1000;
  
  constructor() {
    this.mesh = new THREE.Group();
    this.core = this.createCore();
    this.corona = this.createCorona();
    this.particles = this.createParticles();
    this.light = this.createLight();
    this.glowLight = this.createGlowLight();
    
    this.mesh.add(this.core);
    this.mesh.add(this.corona);
    this.mesh.add(this.particles);
  }
  
  private createCore(): THREE.Mesh {
    const coreGeo = new THREE.SphereGeometry(50, 64, 64);
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0xffaa33,
      emissive: 0xff5500,
      roughness: 0.1,
      emissiveIntensity: 2.0
    });
    
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.castShadow = false;
    core.receiveShadow = false;
    
    // Внутреннее свечение
    const innerGlowGeo = new THREE.SphereGeometry(55, 64, 64);
    const innerGlowMat = new THREE.MeshBasicMaterial({
      color: 0xffaa33,
      transparent: true,
      opacity: 0.3,
      side: THREE.BackSide
    });
    
    const innerGlow = new THREE.Mesh(innerGlowGeo, innerGlowMat);
    core.add(innerGlow);
    
    return core;
  }
  
  private createCorona(): THREE.Mesh {
    const coronaGeo = new THREE.SphereGeometry(80, 64, 64);
    const coronaMat = new THREE.MeshStandardMaterial({
      color: 0xff8833,
      emissive: 0xff4400,
      transparent: true,
      opacity: 0.2,
      side: THREE.BackSide
    });
    
    return new THREE.Mesh(coronaGeo, coronaMat);
  }
  
  private createParticles(): THREE.Points {
    const particleCount = 2000;
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    
    for (let i = 0; i < particleCount; i++) {
      const radius = 120 + Math.random() * 80;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 2;
      
      positions[i * 3] = radius * Math.sin(theta) * Math.cos(phi);
      positions[i * 3 + 1] = radius * Math.sin(theta) * Math.sin(phi);
      positions[i * 3 + 2] = radius * Math.cos(theta);
      
      colors[i * 3] = 1.0;
      colors[i * 3 + 1] = 0.5 + Math.random() * 0.5;
      colors[i * 3 + 2] = 0.0;
    }
    
    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    
    const particleMat = new THREE.PointsMaterial({
      size: 2,
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    
    return new THREE.Points(particleGeo, particleMat);
  }
  
  private createLight(): THREE.PointLight {
    const light = new THREE.PointLight(0xffaa66, 2, 0, 0);
    light.position.set(0, 0, 0);
    light.castShadow = true;
    if (light.shadow) {
      light.shadow.mapSize.width = 2048;
      light.shadow.mapSize.height = 2048;
    }
    return light;
  }
  
  private createGlowLight(): THREE.PointLight {
    const light = new THREE.PointLight(0xff6600, 1, 500);
    light.position.set(0, 0, 0);
    return light;
  }
  
  getTemperatureAtDistance(distance: number): number {
    return Math.max(0, 5778 / (distance * distance / 10000));
  }
  
  getRadiationAtDistance(distance: number): number {
    return Math.max(0, 1000 - distance / 2);
  }
  
  checkDanger(position: THREE.Vector3): DangerInfo {
    const distance = position.length();
    const temperature = this.getTemperatureAtDistance(distance);
    const radiation = this.getRadiationAtDistance(distance);
    
    let isDangerous = false;
    let message = '';
    
    if (distance < 200) {
      isDangerous = true;
      message = 'ОПАСНО: Критическая температура и радиация!';
    } else if (distance < 400) {
      isDangerous = true;
      message = 'Предупреждение: Повышенная радиация';
    } else if (distance < 600) {
      message = 'Внимание: Высокая температура';
    }
    
    return {
      isDangerous,
      temperature,
      radiation,
      message
    };
  }
  
  update(deltaTime: number) {
    // Анимация короны
    const scale = 1 + Math.sin(Date.now() * 0.001) * 0.05;
    this.corona.scale.set(scale, scale, scale);
    
    // Вращение частиц
    this.particles.rotation.y += 0.0005;
  }
  
  toJSON() {
    return {
      temperature: this.temperature,
      radiation: this.radiation,
      position: this.mesh.position
    };
  }
  
  load(data: any) {
    if (data.temperature) this.temperature = data.temperature;
    if (data.radiation) this.radiation = data.radiation;
    if (data.position) this.mesh.position.copy(data.position);
  }
}
