// Base map tiles shared by every operational map.
export const TILE_URL = `https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=${encodeURIComponent(import.meta.env.VITE_CARTO_API_KEY || 'cb1_4u0a_1_93cf66948d960a7d71de1c27')}`;
export const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';
export const DEFAULT_CENTER = [-5.28, -44.46];
