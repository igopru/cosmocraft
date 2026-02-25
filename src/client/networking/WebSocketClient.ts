// src/client/networking/WebSocketClient.ts
export class WebSocketClient {
  private ws: WebSocket;
  private connected: boolean = false;
  private messageHandlers: Map<string, (data: any) => void> = new Map();
  
  constructor(url: string) {
    console.log('🔌 Connecting to server...');
    this.ws = new WebSocket(url);
    
    this.ws.onopen = () => {
      console.log('✅ Connected to server');
      this.connected = true;
      
      // Запрашиваем информацию о мире
      this.send('getWorldInfo', {});
    };
    
    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      console.log('📨 Received:', message.type);
      
      const handler = this.messageHandlers.get(message.type);
      if (handler) {
        handler(message.data);
      }
    };
    
    this.ws.onclose = () => {
      console.log('🔌 Disconnected from server');
      this.connected = false;
    };
    
    this.ws.onerror = (error) => {
      console.error('❌ WebSocket error:', error);
    };
  }
  
  on(type: string, handler: (data: any) => void) {
    this.messageHandlers.set(type, handler);
  }
  
  send(type: string, data: any) {
    if (this.connected) {
      this.ws.send(JSON.stringify({ type, data }));
    } else {
      console.warn('⚠️ Not connected to server');
    }
  }
  
  // Методы для игры
  getAsteroids(position: any, radius: number = 500) {
    this.send('getAsteroids', { position, radius });
  }
  
  updatePosition(position: any, sector: string) {
    this.send('updatePosition', { position, sector });
  }
  
  mineAsteroid(asteroidId: string, laserPower: number = 10) {
    this.send('mineAsteroid', { asteroidId, laserPower });
  }
}
