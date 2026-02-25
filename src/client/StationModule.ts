// src/client/StationModule.ts
import * as THREE from 'three';

export class StationModule {
    private mesh: THREE.Group;
    private type: string;
    
    constructor(type: string, position: THREE.Vector3) {
        this.type = type;
        this.mesh = this.createMesh();
        this.mesh.position.copy(position);
    }
    
    private createMesh(): THREE.Group {
        const group = new THREE.Group();
        
        const colors: Record<string, number> = {
            habitat: 0x44aa88,
            production: 0xaa8844,
            storage: 0x888888,
            solar: 0x44aaff,
            turret: 0xaa4444
        };
        
        const color = colors[this.type] || 0xffffff;
        
        const mainGeo = new THREE.BoxGeometry(8, 8, 8);
        const mainMat = new THREE.MeshStandardMaterial({ color, emissive: 0x222222 });
        const main = new THREE.Mesh(mainGeo, mainMat);
        main.castShadow = true;
        main.receiveShadow = true;
        group.add(main);
        
        if (this.type === 'solar') {
            for (let i = -3; i <= 3; i+=2) {
                const panelGeo = new THREE.BoxGeometry(6, 0.3, 2);
                const panelMat = new THREE.MeshStandardMaterial({ color: 0x3333aa });
                const panel = new THREE.Mesh(panelGeo, panelMat);
                panel.position.set(i * 1.5, 0, 4);
                group.add(panel);
            }
        } else if (this.type === 'turret') {
            const baseGeo = new THREE.CylinderGeometry(2, 2, 2);
            const baseMat = new THREE.MeshStandardMaterial({ color: 0x666666 });
            const base = new THREE.Mesh(baseGeo, baseMat);
            base.position.y = 1;
            group.add(base);
            
            const barrelGeo = new THREE.BoxGeometry(0.8, 0.8, 3);
            const barrelMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
            const barrel = new THREE.Mesh(barrelGeo, barrelMat);
            barrel.position.set(0, 2, 2);
            group.add(barrel);
        }
        
        return group;
    }
    
    public getMesh(): THREE.Group {
        return this.mesh;
    }
}
