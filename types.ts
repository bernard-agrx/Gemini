export interface TileCoordinate {
  x: number;
  y: number;
  z: number;
}

export interface GeoCoordinate {
  lat: number;
  lon: number;
}

export enum MapType {
  MAP = 'map',
  SAT = 'sat',
}

export interface GlobeState {
  isLoading: boolean;
  progress: number;
  texture: HTMLCanvasElement | null;
  error: string | null;
}