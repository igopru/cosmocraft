// src/star/NewCentralStar.ts
import * as THREE from 'three';
import type { Planet } from '../planet/Planet.js';
import { PlanetGenerator } from '../planet/PlanetGenerator.js';
import { VoxelPlanet } from '../planet/VoxelPlanet.js';

interface OrbitingPlanet {
  voxel: VoxelPlanet;
  orbitAngle: number;
  orbitSpeed: number;
  inclination: number;
}

interface CoronaVoxel {
  basePos: THREE.Vector3;
  speed: number;
  phase: number;
}

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

export class NewCentralStar {
  readonly mesh: THREE.Group;
  readonly light: THREE.PointLight;
  readonly glowLight: THREE.PointLight;

  private planets: OrbitingPlanet[] = [];
  private planetGroup: THREE.Group;
  private coreMesh: THREE.InstancedMesh;
  private coronaMesh: THREE.InstancedMesh;
  private coronaData: CoronaVoxel[] = [];
  private particles: THREE.Points;
  private starSeed: number;

  constructor(planetCount: number = 10) {
    this.mesh = new THREE.Group();
    this.mesh.name = 'star';
    this.planetGroup = new THREE.Group();
    this.starSeed = Math.floor(Math.random() * 1000000);

    const random = seededRandom(this.starSeed);

    this.coreMesh = this.createVoxelCore(random);
    this.coronaMesh = this.createVoxelCorona(random);
    this.particles = this.createParticles(random);
    this.light = this.createLight();
    this.glowLight = this.createGlowLight();

    this.mesh.add(this.coreMesh);
    this.mesh.add(this.coronaMesh);
    this.mesh.add(this.particles);
    this.mesh.add(this.planetGroup);

    this.generatePlanets(planetCount);
  }

  private createVoxelCore(random: () => number): THREE.InstancedMesh {
    const coreSize = 28;
    const voxelSize = 5;
    const shellCount = 3;
    const colors = [0xffaa33, 0xff8833, 0xff6633, 0xff4433, 0xff3333];

    const positions: { x: number; y: number; z: number; scale: number; color: number; intensity: number }[] = [];

    for (let layer = 0; layer < shellCount; layer++) {
      const t = layer / shellCount;
      const radius = coreSize - t * coreSize * 0.6;
      const count = Math.max(30, Math.floor(60 - t * 20));

      for (let i = 0; i < count; i++) {
        const theta = random() * Math.PI;
        const phi = random() * Math.PI * 2;
        const r = radius + (random() - 0.5) * voxelSize * 0.8;
        const x = r * Math.sin(theta) * Math.cos(phi);
        const y = r * Math.sin(theta) * Math.sin(phi);
        const z = r * Math.cos(theta);
        const depth = r / coreSize;
        const colorIndex = Math.min(Math.floor(depth * colors.length), colors.length - 1);
        const scale = 0.8 + random() * 0.6;
        positions.push({ x, y, z, scale, color: colors[colorIndex], intensity: 2.0 - depth });
      }
    }

    const count = positions.length;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xff8833,
      emissiveIntensity: 1.5,
      transparent: true,
      opacity: 0.85,
      vertexColors: true,
    });

    const mesh = new THREE.InstancedMesh(geo, mat, count);
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const p = positions[i];
      dummy.position.set(p.x, p.y, p.z);
      dummy.scale.setScalar(p.scale * voxelSize);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, col.setHex(p.color));
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor!.needsUpdate = true;

    (mesh as any).userData = { isStarCore: true };
    return mesh;
  }

  private createVoxelCorona(random: () => number): THREE.InstancedMesh {
    const coronaSize = 50;
    const count = 80;

    const geo = new THREE.BoxGeometry(5, 5, 5);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffaa33,
      emissive: 0xff4400,
      transparent: true,
      opacity: 0.15,
      blending: THREE.AdditiveBlending,
    });

    const mesh = new THREE.InstancedMesh(geo, mat, count);
    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      const theta = random() * Math.PI * 2;
      const phi = random() * Math.PI * 2;
      const radius = coronaSize + random() * 20;
      const x = radius * Math.sin(theta) * Math.cos(phi);
      const y = radius * Math.sin(theta) * Math.sin(phi);
      const z = radius * Math.cos(theta);

      dummy.position.set(x, y, z);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      this.coronaData.push({
        basePos: new THREE.Vector3(x, y, z),
        speed: 0.2 + random() * 0.3,
        phase: random() * Math.PI * 2,
      });
    }

    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }

  private createParticles(random: () => number): THREE.Points {
    const particleCount = 1500;
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      const radius = 80 + random() * 60;
      const theta = random() * Math.PI * 2;
      const phi = random() * Math.PI * 2;
      positions[i * 3] = radius * Math.sin(theta) * Math.cos(phi);
      positions[i * 3 + 1] = radius * Math.sin(theta) * Math.sin(phi);
      positions[i * 3 + 2] = radius * Math.cos(theta);
      colors[i * 3] = 1.0;
      colors[i * 3 + 1] = 0.5 + random() * 0.5;
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
      depthWrite: false,
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

  private generatePlanets(count: number): void {
    const planetData = PlanetGenerator.generate(count);
    const minOrb = planetData.length > 0 ? planetData[0].orbitalDistance : 3500;

    for (let i = 0; i < planetData.length; i++) {
      const data = planetData[i];
      const voxel = new VoxelPlanet(data, this.starSeed + i + 1);

      const angleRad = (data.startAngle * Math.PI) / 180;
      const inclination = (Math.random() - 0.5) * 0.15;

      const y = data.orbitalDistance * Math.sin(angleRad) * Math.sin(inclination);
      const x = data.orbitalDistance * Math.cos(angleRad);
      const z = data.orbitalDistance * Math.sin(angleRad) * Math.cos(inclination);
      voxel.group.position.set(x, y, z);

      const keplerFactor = Math.pow(minOrb / data.orbitalDistance, 1.5);
      const orbitSpeed = 0.08 * keplerFactor * (0.9 + Math.random() * 0.2);

      voxel.group.userData = { isPlanet: true, planetData: data };
      this.planetGroup.add(voxel.group);
      this.planets.push({ voxel, orbitAngle: angleRad, orbitSpeed, inclination });
    }
  }

  getPlanets() {
    return this.planets.map(p => p.voxel.data);
  }

  getPlanetPositions(): { position: THREE.Vector3; data: Planet; dangerRadius: number }[] {
    return this.planets.map(p => ({
      position: p.voxel.group.position,
      data: p.voxel.data,
      dangerRadius: p.voxel.data.dangerRadius,
    }));
  }

  update(deltaTime: number): void {
    const time = Date.now() * 0.001;

    const coreMat = this.coreMesh.material as THREE.MeshStandardMaterial;
    coreMat.emissiveIntensity = 1.5 * (0.8 + 0.2 * Math.sin(time * 1.2));

    const dummy = new THREE.Object3D();
    for (let i = 0; i < this.coronaData.length; i++) {
      const cd = this.coronaData[i];
      const x = cd.basePos.x + Math.sin(time * cd.speed + cd.phase) * 4;
      const y = cd.basePos.y + Math.cos(time * cd.speed + cd.phase) * 4;
      const z = cd.basePos.z + Math.sin(time * cd.speed + cd.phase * 2) * 4;
      dummy.position.set(x, y, z);
      dummy.updateMatrix();
      this.coronaMesh.setMatrixAt(i, dummy.matrix);
    }
    this.coronaMesh.instanceMatrix.needsUpdate = true;

    this.particles.rotation.y += 0.0002;

    for (const planet of this.planets) {
      planet.orbitAngle += planet.orbitSpeed * deltaTime;
      const a = planet.voxel.data.orbitalDistance;
      const inc = planet.inclination;
      const x = a * Math.cos(planet.orbitAngle);
      const y = a * Math.sin(planet.orbitAngle) * Math.sin(inc);
      const z = a * Math.sin(planet.orbitAngle) * Math.cos(inc);
      planet.voxel.group.position.set(x, y, z);
    }
  }

  checkDanger(position: THREE.Vector3) {
    const distance = position.length();
    let temperature = Math.max(0, 5778 / (distance * distance / 10000));
    let radiation = Math.max(0, 1000 - distance / 2);

    let isDangerous = false;
    let message = '';
    let nearestPlanet: Planet | null = null;
    let planetDistance = Infinity;

    for (const planet of this.planets) {
      const ppos = planet.voxel.group.position;
      const d = position.distanceTo(ppos);
      if (d < planetDistance) {
        planetDistance = d;
        nearestPlanet = planet.voxel.data;
      }
    }

    if (nearestPlanet && planetDistance < nearestPlanet.dangerRadius) {
      isDangerous = true;
      temperature = nearestPlanet.temperature;
      message = `ОПАСНО: Приближение к ${nearestPlanet.name}! T=${nearestPlanet.temperature}K`;
    } else if (distance < 200) {
      isDangerous = true;
      message = 'ОПАСНО: Критическая температура и радиация!';
    } else if (distance < 400) {
      isDangerous = true;
      message = 'Предупреждение: Повышенная радиация';
    } else if (nearestPlanet && planetDistance < nearestPlanet.dangerRadius * 2) {
      message = `Внимание: Рядом ${nearestPlanet.name} (${nearestPlanet.composition})`;
    } else if (distance < 600) {
      message = 'Внимание: Высокая температура';
    }

    return { isDangerous, temperature, radiation, message, nearestPlanet };
  }
}
