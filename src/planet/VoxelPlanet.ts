// src/planet/VoxelPlanet.ts
import * as THREE from 'three';
import { Planet, PlanetComposition } from './Planet.js';

const PALETTES: Record<PlanetComposition, { color: number; emissive: number; emissiveIntensity: number; roughness: number; metalness: number }> = {
  rocky:  { color: 0x886644, emissive: 0x221100, emissiveIntensity: 0.02, roughness: 0.8, metalness: 0.15 },
  ice:    { color: 0xccddff, emissive: 0x334466, emissiveIntensity: 0.03, roughness: 0.3, metalness: 0.05 },
  desert: { color: 0xddbb77, emissive: 0x553322, emissiveIntensity: 0.02, roughness: 0.7, metalness: 0.05 },
  gas:    { color: 0xccaa88, emissive: 0x442200, emissiveIntensity: 0.02, roughness: 0.3, metalness: 0.02 },
  lava:   { color: 0xff6622, emissive: 0xff4400, emissiveIntensity: 0.5, roughness: 0.6, metalness: 0.05 },
  ocean:  { color: 0x3366aa, emissive: 0x112233, emissiveIntensity: 0.02, roughness: 0.2, metalness: 0.1 },
};

export class VoxelPlanet {
  readonly group: THREE.Group;
  readonly data: Planet;
  readonly mesh: THREE.Mesh;

  constructor(data: Planet, seed: number) {
    this.data = data;
    this.group = new THREE.Group();

    const p = PALETTES[data.composition];
    const radius = Math.max(4, data.radius);

    const geo = new THREE.SphereGeometry(radius, 32, 24);
    const mat = new THREE.MeshStandardMaterial({
      color: p.color,
      emissive: p.emissive,
      emissiveIntensity: p.emissiveIntensity,
      roughness: p.roughness,
      metalness: p.metalness,
    });

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.userData = { isPlanet: true, planetData: data };

    this.group.add(this.mesh);
  }
}
