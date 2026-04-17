// src/client/BaseStation.ts
/**
 * Базовая станция — орбитальная станция вокруг звезды
 * Загружает воксели из blueprint JSON, автоматически вычисляет размер
 * и размещается на орбите = 4 * максимальный размер станции
 * Поддерживает коллизии, клик мышкой и взаимодействие
 */
import * as THREE from 'three';

const VOXEL_COLORS: Record<string, number> = {
  hull_reinforced: 0x888888,
  hull: 0x666666,
  solar_panel: 0x2244aa,
  battery: 0x44aa44,
  habitat: 0x44aaff,
  antenna: 0xffaa44,
  radiator: 0xff4444,
  engine: 0xff6600,
  storage: 0xaa8844,
  lab: 0x8844ff,
  docking_port: 0x00ffaa,
  connector: 0x555555,
};

export class BaseStation {
  private station: THREE.Group;
  private orbitAngle: number = 0;
  private orbitRadius: number = 0;
  private orbitSpeed: number = 0.015;
  private selfRotationSpeed: number = 0.5;
  private size: number = 0;
  private collisionRadius: number = 0;
  public readonly name: string = 'Базовая станция звезды';

  // Для следования за станцией
  private isFollowing: boolean = false;

  constructor(scene: THREE.Scene) {
    this.station = new THREE.Group();
    this.station.name = 'baseStation';
    this.station.userData.isStation = true;
    this.station.userData.stationName = this.name;
    scene.add(this.station);
    this.loadBlueprint();
  }

  private async loadBlueprint() {
    try {
      const resp = await fetch('/station/SolarWheel_Pro.blueprint.json');
      if (!resp.ok) throw new Error(`Blueprint HTTP ${resp.status}`);
      const bp = await resp.json();
      const voxels = bp.voxels;

      let minX = Infinity, minY = Infinity, minZ = Infinity;
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

      for (const v of voxels) {
        if (v.x < minX) minX = v.x;
        if (v.y < minY) minY = v.y;
        if (v.z < minZ) minZ = v.z;
        if (v.x > maxX) maxX = v.x;
        if (v.y > maxY) maxY = v.y;
        if (v.z > maxZ) maxZ = v.z;
      }

      const gridSize = bp.gridSize || 64;
      const voxelSize = 6;

      const dx = (maxX - minX + 1) * voxelSize;
      const dy = (maxY - minY + 1) * voxelSize;
      const dz = (maxZ - minZ + 1) * voxelSize;
      this.size = Math.max(dx, dy, dz);
      this.collisionRadius = this.size * 0.55; // Коллизия чуть меньше полного размера

      // Орбита = 4 * размер станции
      this.orbitRadius = this.size * 4;

      console.log(`📦 Station: ${dx.toFixed(0)}x${dy.toFixed(0)}x${dz.toFixed(0)}, orbit=${this.orbitRadius}, collision=${this.collisionRadius}`);

      this.buildMesh(voxels, gridSize, minX, minY, minZ);
    } catch (e) {
      console.error('❌ BaseStation: failed to load blueprint:', e);
      this.createPlaceholder();
    }
  }

  private buildMesh(voxels: any[], gridSize: number, minX: number, minY: number, minZ: number) {
    const voxelSize = 6;
    const halfGrid = gridSize / 2;
    const centerX = (minX + halfGrid) * voxelSize;
    const centerY = (minY + halfGrid) * voxelSize;
    const centerZ = (minZ + halfGrid) * voxelSize;

    const byType: Record<string, THREE.Vector3[]> = {};

    for (const v of voxels) {
      const type = v.type || 'hull';
      if (!byType[type]) byType[type] = [];
      byType[type].push(
        new THREE.Vector3(
          (v.x - halfGrid) * voxelSize - centerX,
          (v.y - halfGrid) * voxelSize - centerY,
          (v.z - halfGrid) * voxelSize - centerZ
        )
      );
    }

    const boxGeo = new THREE.BoxGeometry(voxelSize, voxelSize, voxelSize);

    for (const [type, positions] of Object.entries(byType)) {
      const color = VOXEL_COLORS[type] || 0x888888;
      const material = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.7,
        metalness: 0.3,
      });

      const instanced = new THREE.InstancedMesh(boxGeo, material, positions.length);
      const matrix = new THREE.Matrix4();
      positions.forEach((pos, i) => {
        matrix.setPosition(pos.x, pos.y, pos.z);
        instanced.setMatrixAt(i, matrix);
      });
      instanced.instanceMatrix.needsUpdate = true;
      instanced.userData.isStation = true;
      instanced.userData.stationName = this.name;
      this.station.add(instanced);
    }
  }

  private createPlaceholder() {
    this.orbitRadius = 1200;
    this.size = 300;
    this.collisionRadius = 150;

    const ringGeo = new THREE.TorusGeometry(this.size * 0.4, this.size * 0.08, 8, 32);
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x4488ff, roughness: 0.5, metalness: 0.8 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.userData.isStation = true;
    ring.userData.stationName = this.name;
    this.station.add(ring);

    console.log('⚠️ BaseStation: using placeholder, orbit R=' + this.orbitRadius);
  }

  update(dt: number) {
    if (this.orbitRadius === 0) return;

    this.orbitAngle += this.orbitSpeed * dt;

    this.station.position.x = Math.cos(this.orbitAngle) * this.orbitRadius;
    this.station.position.y = Math.sin(this.orbitAngle) * this.orbitRadius;
    this.station.position.z = 0;

    // Вращение станции вокруг оси Z для "гравитации"
    this.station.rotation.z += this.selfRotationSpeed * dt;
  }

  /** Проверка коллизии с кораблём */
  checkShipCollision(shipPos: THREE.Vector3): boolean {
    const dist = shipPos.distanceTo(this.station.position);
    return dist < this.collisionRadius;
  }

  /** Получить позицию рядом со станцией для причаливания */
  getDockingPosition(): THREE.Vector3 {
    return this.station.position.clone().add(new THREE.Vector3(this.collisionRadius + 20, 0, 0));
  }

  /** Получить скорость станции (для выравнивания) */
  getStationVelocity(): THREE.Vector3 {
    // Тангенциальная скорость орбиты
    const tangent = new THREE.Vector3(
      -Math.sin(this.orbitAngle),
      Math.cos(this.orbitAngle),
      0
    ).multiplyScalar(this.orbitRadius * this.orbitSpeed);
    return tangent;
  }

  /** Переключить следование за станцией */
  toggleFollowing(): boolean {
    this.isFollowing = !this.isFollowing;
    return this.isFollowing;
  }

  isShipFollowing(): boolean {
    return this.isFollowing;
  }

  getOrbitRadius(): number { return this.orbitRadius; }
  getMinAsteroidDistance(): number { return this.orbitRadius + this.size; }
  getStationPosition(): THREE.Vector3 { return this.station.position.clone(); }
  getStationGroup(): THREE.Group { return this.station; }

  dispose() {
    this.station.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.InstancedMesh) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    });
    this.station.clear();
  }
}
