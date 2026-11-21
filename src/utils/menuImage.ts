import { Platform } from 'react-native';
import { getActiveServerHttpUrl } from '../services/syncService';

export interface MenuImageLike {
  id?: string;
  imageUri?: string;
  imageUrl?: string;
}

/**
 * Returns true if the image URI is empty or an old generic Unsplash placeholder
 * that should be upgraded to the authentic local per-product photo.
 */
export function isLegacyStockImageUri(uri?: string): boolean {
  if (!uri || !uri.trim()) return true;
  const trimmed = uri.trim().toLowerCase();
  return trimmed.includes('images.unsplash.com/photo-');
}

/**
 * Returns the canonical local path `/menu-images/<id>.jpg` for built-in Sultan menu items (`slt-*`).
 */
export function getLocalMenuImagePath(id?: string): string | undefined {
  if (!id || !id.startsWith('slt-')) return undefined;
  return `/menu-images/${id}.jpg`;
}

/**
 * Normalizes a MenuItem's stored image field (`imageUri` / legacy `imageUrl`)
 * so `imageUri` is always populated and built-in `slt-*` dishes automatically use
 * their dedicated authentic per-dish photo unless the admin uploaded a custom image.
 */
export function normalizeMenuItemImage<T extends MenuImageLike>(item: T): T {
  if (!item || typeof item !== 'object') return item;
  const raw = (item.imageUri || item.imageUrl || '').trim();
  const localPath = getLocalMenuImagePath(item.id);

  let finalUri = raw;
  if (localPath && (!raw || isLegacyStockImageUri(raw))) {
    finalUri = localPath;
  }

  if (!finalUri) return item;
  return {
    ...item,
    imageUri: finalUri,
  };
}

/**
 * Resolves a MenuItem's image URI for React Native `<Image source={{ uri }} />`
 * across Web (localhost / LAN IP) and Native (iOS / Android via LAN Hub server).
 */
export function resolveMenuImageUri(item?: MenuImageLike | string | null): string | undefined {
  if (!item) return undefined;

  let uri: string | undefined;
  if (typeof item === 'string') {
    uri = item.trim();
  } else {
    const raw = (item.imageUri || item.imageUrl || '').trim();
    const localPath = getLocalMenuImagePath(item.id);
    if (localPath && (!raw || isLegacyStockImageUri(raw))) {
      uri = localPath;
    } else {
      uri = raw || undefined;
    }
  }

  if (!uri) return undefined;

  // Data URIs or absolute HTTP(S) URLs work everywhere directly
  if (uri.startsWith('data:') || uri.startsWith('http://') || uri.startsWith('https://') || uri.startsWith('file://')) {
    return uri;
  }

  // Relative local paths like `/menu-images/slt-sal-caesar.jpg`
  if (uri.startsWith('/')) {
    if (Platform.OS === 'web') {
      return uri;
    }
    try {
      const base = getActiveServerHttpUrl().replace(/\/+$/, '');
      if (base) return `${base}${uri}`;
    } catch {}
  }

  return uri;
}
