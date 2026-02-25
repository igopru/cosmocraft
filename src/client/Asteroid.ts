// src/client/Asteroid.ts
import * as THREE from 'three';

export class Asteroid {
    private mesh: THREE.Group;
    private position: THREE.Vector3;
    private rotationSpeed: THREE.Vector3;
    
    constructor(position: THREE.Vector3, type: string = 'metallic') {
        this.position = position.clone();
        this.rotationSpeed = new THREE.Vector3(
            (Math.random() - 0.5) * 0.02,
            (Math.random() - 0.5) * 0.02,
            (Math.random() - 0.5) * 0.02
        );
        
        this.mesh = this.createMesh(type);
        this.mesh.position.copy(position);
    }
    
    private createMesh(type: string): THREE.Group {
        const group = new THREE.Group();
        
        let color: number;
        switch(type) {
            case 'metallic': color = 0x888888; break;
            case 'silicon': color = 0x66aaff; break;
            case 'icy': color = 0xaaddff; break;
            case 'rare': color = 0xffaa44; break;
            default: color = 0x888888;
        }
        
        const size = 5 + Math.random() * 5;
        const voxelSize = 2;
        
        for (let x = -size; x < size; x += voxelSize) {
            for (let y = -size; y < size; y += voxelSize) {
                for (let z = -size; z < size; z += voxelSize) {
                    const pos = new THREE.Vector3(x, y, z);
                    if (pos.length() < size - voxelSize && Math.random() > 0.4) {
                        const voxel = new THREE.Mesh(
                            new THREE.BoxGeometry(voxelSize * 0.9, voxelSize * 0.9, voxelSize * 0.9),
                            new THREE.MeshStandardMaterial({ 
                                color: color,
                                roughness: 0.7,
                                emissive: type === 'rare' ? 0x442200 : 0x000000
                            })
                        );
                        voxel.position.copy(pos);
                        voxel.castShadow = true;
                        voxel.receiveShadow = true;
                        group.add(voxel);
                    }
                }
            }
        }
        
        return group;
    }
    
    public getMesh(): THREE.Group {
        return this.mesh;
    }
    
    public update() {
        this.mesh.rotation.x += this.rotationSpeed.x;
        this.mesh.rotation.y += this.rotationSpeed.y;
        this.mesh.rotation.z += this.rotationSpeed.z;
    }
}
