// src/server/storage/WorldStorage.ts
import * as fs from 'fs';
import * as path from 'path';

export class WorldStorage {
  private worldPath: string;
  
  constructor(worldPath: string) {
    this.worldPath = worldPath;
    this.ensureDirectories();
  }
  
  private ensureDirectories() {
    const dirs = [
      this.worldPath,
      path.join(this.worldPath, 'chunks'),
      path.join(this.worldPath, 'backups')
    ];
    
    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }
  
  loadStations(): any[] {
    const filePath = path.join(this.worldPath, 'stations.json');
    try {
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(data);
        return Array.isArray(parsed) ? parsed : [];
      }
    } catch (error) {
      console.error('Error loading stations:', error);
    }
    return [];
  }
  
  saveStations(stations: any[]) {
    const filePath = path.join(this.worldPath, 'stations.json');
    try {
      fs.writeFileSync(filePath, JSON.stringify(stations, null, 2));
      this.createBackup('stations', stations);
    } catch (error) {
      console.error('Error saving stations:', error);
    }
  }
  
  loadAsteroids(): any[] {
    const filePath = path.join(this.worldPath, 'asteroids.json');
    try {
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(data);
        return Array.isArray(parsed) ? parsed : [];
      }
    } catch (error) {
      console.error('Error loading asteroids:', error);
    }
    return [];
  }
  
  saveAsteroids(asteroids: any[]) {
    const filePath = path.join(this.worldPath, 'asteroids.json');
    try {
      fs.writeFileSync(filePath, JSON.stringify(asteroids, null, 2));
    } catch (error) {
      console.error('Error saving asteroids:', error);
    }
  }
  
  loadStar(): any {
    const filePath = path.join(this.worldPath, 'star.json');
    try {
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('Error loading star:', error);
    }
    return null;
  }
  
  saveStar(starData: any) {
    const filePath = path.join(this.worldPath, 'star.json');
    try {
      fs.writeFileSync(filePath, JSON.stringify(starData, null, 2));
    } catch (error) {
      console.error('Error saving star:', error);
    }
  }
  
  loadSector(sectorId: string): any {
    const filePath = path.join(this.worldPath, 'chunks', `${sectorId}.json`);
    try {
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('Error loading sector:', error);
    }
    return null;
  }
  
  saveSector(sectorId: string, sectorData: any) {
    const filePath = path.join(this.worldPath, 'chunks', `${sectorId}.json`);
    try {
      fs.writeFileSync(filePath, JSON.stringify(sectorData, null, 2));
    } catch (error) {
      console.error('Error saving sector:', error);
    }
  }
  
  private createBackup(name: string, data: any) {
    try {
      const timestamp = Date.now();
      const backupPath = path.join(this.worldPath, 'backups', `backup-${timestamp}-${name}.json`);
      fs.writeFileSync(backupPath, JSON.stringify(data, null, 2));
      this.cleanOldBackups();
    } catch (error) {
      console.error('Error creating backup:', error);
    }
  }
  
  private cleanOldBackups() {
    try {
      const backupDir = path.join(this.worldPath, 'backups');
      if (!fs.existsSync(backupDir)) return;
      
      const files = fs.readdirSync(backupDir)
        .filter(f => f.startsWith('backup-'))
        .map(f => ({
          name: f,
          time: parseInt(f.split('-')[1])
        }))
        .sort((a, b) => b.time - a.time);
      
      // Оставляем только 10 последних
      files.slice(10).forEach(file => {
        fs.unlinkSync(path.join(backupDir, file.name));
      });
    } catch (error) {
      console.error('Error cleaning backups:', error);
    }
  }
}
