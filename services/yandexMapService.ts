import { GeoCoordinate, MapType } from '../types';

const TILE_SIZE = 256;
const MAX_CONCURRENT_REQUESTS = 4;
// We request a larger image size (max height for Yandex is 450) to pad the tile.
// The Yandex watermark is stamped on the corners of the returned image.
// By cropping the center 256x256, we effectively remove the watermark.
const REQUEST_SIZE = 450; 
const CROP_OFFSET = (REQUEST_SIZE - TILE_SIZE) / 2; // (450 - 256) / 2 = 97px padding

// Convert Tile X,Y,Z to Latitude/Longitude of the center of the tile
export const tileToGeo = (x: number, y: number, z: number): GeoCoordinate => {
  const n = Math.pow(2, z);
  const centerX = x + 0.5;
  const centerY = y + 0.5;
  
  const centerLonDeg = (centerX / n) * 360.0 - 180.0;
  const centerLatRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * centerY) / n)));
  const centerLatDeg = (centerLatRad * 180.0) / Math.PI;

  return { lat: centerLatDeg, lon: centerLonDeg };
};

// Generate Yandex Static API URL with padded size
export const getYandexStaticUrl = (geo: GeoCoordinate, z: number, type: MapType): string => {
  return `https://static-maps.yandex.ru/1.x/?ll=${geo.lon},${geo.lat}&z=${z}&l=${type}&size=${REQUEST_SIZE},${REQUEST_SIZE}&lang=en_US`;
};

// Helper to load a single image
const loadImage = (url: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${url}`));
    img.src = url;
  });
};

interface TileRequest {
  x: number;
  y: number;
  url: string;
  dist: number; // Priority distance (lower is better)
}

export class TileManager {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  
  // Configuration
  readonly targetZoom = 3;
  readonly baseZoom = 2; // Optimized: Use Zoom 2 for better initial detail (16 tiles)
  readonly mapType: MapType;
  
  // State
  private tilesLoaded: boolean[]; // For target zoom
  private activeRequests = 0;
  private queue: TileRequest[] = [];
  private numTilesX: number;
  private onTextureUpdate: () => void;
  private isDestroyed = false;

  constructor(mapType: MapType, onTextureUpdate: () => void) {
    this.mapType = mapType;
    this.onTextureUpdate = onTextureUpdate;
    this.numTilesX = Math.pow(2, this.targetZoom);
    
    // Initialize Canvas (2048x2048 for Zoom 3)
    this.canvas = document.createElement('canvas');
    const size = this.numTilesX * TILE_SIZE;
    this.canvas.width = size;
    this.canvas.height = size;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
    
    // Initialize state tracker (flat array for 8x8 grid)
    this.tilesLoaded = new Array(this.numTilesX * this.numTilesX).fill(false);

    // Fill background with deep blue initially (Ocean color)
    this.ctx.fillStyle = '#001e3f'; 
    this.ctx.fillRect(0, 0, size, size);
  }

  // Load the low-res base layer immediately
  async loadBaseLayer() {
    const n = Math.pow(2, this.baseZoom); 
    const scale = Math.pow(2, this.targetZoom - this.baseZoom); 
    const drawSize = TILE_SIZE * scale; 

    const promises = [];
    for (let x = 0; x < n; x++) {
      for (let y = 0; y < n; y++) {
        const geo = tileToGeo(x, y, this.baseZoom);
        const url = getYandexStaticUrl(geo, this.baseZoom, this.mapType);
        
        promises.push(
          loadImage(url)
            .then(img => {
              if (this.isDestroyed) return;
              // Draw scaled up base tile, cropping the center to remove watermarks
              this.ctx.drawImage(
                img, 
                CROP_OFFSET, CROP_OFFSET, TILE_SIZE, TILE_SIZE, // Source (Crop center)
                x * drawSize, y * drawSize, drawSize, drawSize  // Destination (Scaled)
              );
              // Update immediately per tile so user sees progressive loading
              this.onTextureUpdate();
            })
            .catch(e => console.warn("Base tile failed", e))
        );
      }
    }

    await Promise.all(promises);
  }

  // Update priority based on where the camera is looking (longitude)
  update(currentLonDeg: number) {
    if (this.isDestroyed) return;

    // 1. Calculate the 'center' X tile index for the current longitude
    // Longitude -180 to 180 maps to 0 to 8 (for zoom 3)
    // We normalize lon to 0..1 then multiply by numTiles
    let normalizedLon = (currentLonDeg + 180) / 360;
    // Wrap around just in case
    normalizedLon = normalizedLon - Math.floor(normalizedLon);
    
    const centerX = normalizedLon * this.numTilesX;

    // 2. Identify missing tiles and add to queue if not present
    for (let y = 0; y < this.numTilesX; y++) {
      for (let x = 0; x < this.numTilesX; x++) {
        const index = y * this.numTilesX + x;
        if (this.tilesLoaded[index]) continue;

        // Check if already in queue
        const inQueue = this.queue.some(item => item.x === x && item.y === y);
        if (inQueue) continue;

        // Calculate distance logic
        // X distance handles wrapping (world is spherical horizontally)
        let distBoxX = Math.abs(x - centerX);
        if (distBoxX > this.numTilesX / 2) {
          distBoxX = this.numTilesX - distBoxX;
        }

        // Y distance (prefer equator/center view, less priority to poles)
        const distBoxY = Math.abs(y - (this.numTilesX / 2) - 0.5);

        // Weighted distance: X matters more for rotation streaming
        const dist = distBoxX + (distBoxY * 0.5);

        // Optimization: Only queue tiles that are reasonably close to view
        // The globe shows roughly half the world. 
        if (distBoxX < (this.numTilesX / 2) + 1) {
           const geo = tileToGeo(x, y, this.targetZoom);
           const url = getYandexStaticUrl(geo, this.targetZoom, this.mapType);
           this.queue.push({ x, y, url, dist });
        }
      }
    }

    // 3. Sort queue by distance (closest first)
    this.queue.sort((a, b) => a.dist - b.dist);

    // 4. Trigger processing
    this.processQueue();
  }

  private processQueue() {
    if (this.isDestroyed) return;

    while (this.activeRequests < MAX_CONCURRENT_REQUESTS && this.queue.length > 0) {
      const task = this.queue.shift();
      if (!task) break;

      this.activeRequests++;
      
      loadImage(task.url)
        .then(img => {
          if (this.isDestroyed) return;
          
          // Draw with cropping to remove watermark
          this.ctx.drawImage(
            img, 
            CROP_OFFSET, CROP_OFFSET, TILE_SIZE, TILE_SIZE, // Source: Crop center
            task.x * TILE_SIZE, task.y * TILE_SIZE, TILE_SIZE, TILE_SIZE // Dest: Place in grid
          );
          
          // Mark as loaded
          const index = task.y * this.numTilesX + task.x;
          this.tilesLoaded[index] = true;

          this.onTextureUpdate();
        })
        .catch(e => {
          // If failed, we might retry or just ignore. 
          console.warn("Tile load failed", e);
        })
        .finally(() => {
          this.activeRequests--;
          this.processQueue();
        });
    }
  }

  destroy() {
    this.isDestroyed = true;
    this.queue = [];
  }
  
  // Progress stat
  getProgress() {
    const loaded = this.tilesLoaded.filter(Boolean).length;
    const total = this.tilesLoaded.length;
    return Math.floor((loaded / total) * 100);
  }
}