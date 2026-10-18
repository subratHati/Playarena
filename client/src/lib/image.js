import { API_URL } from './api';

// Full URL for a tournament's cover image (the API returns a path). imageSrc is used by admin previews.
export const tournamentImage = (t) => t?.imageSrc || (t?.imageUrl ? `${API_URL}${t.imageUrl}` : null);
export const apiImage = (path) => (path ? `${API_URL}${path}` : null);

// Shapes an admin can crop a picture to. out = pixel size of the uploaded file.
// Tournament posters are always square, so they fill every card, list and page exactly.
export const POSTER_SHAPE = { id: 'square', label: 'Square poster', ratio: 1, out: [1080, 1080] };
export const HERO_SHAPES = {
  side: { id: 'side', label: 'Picture + text', ratio: 4 / 3, out: [1200, 900] },
  // Must match the hero's shape in Hero.jsx: 14:5 on computers and tablets, 3:2 on phones.
  banner: { id: 'banner', label: 'Full banner', ratio: 14 / 5, out: [1960, 700] },
  bannerMobile: { id: 'bannerMobile', label: 'Phone banner', ratio: 3 / 2, out: [1200, 800] },
};

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('That image could not be opened'));
    el.src = src;
  });
}

export function canvasToDataUrl(canvas, quality = 0.86) {
  let dataUrl = canvas.toDataURL('image/webp', quality);
  if (!dataUrl.startsWith('data:image/webp')) dataUrl = canvas.toDataURL('image/jpeg', quality);
  const bytes = Math.round(((dataUrl.length - dataUrl.indexOf(',') - 1) * 3) / 4);
  return { dataUrl, bytes };
}

export const MAX_UPLOAD_BYTES = 1.5 * 1024 * 1024;
