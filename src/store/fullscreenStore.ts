import { create } from 'zustand';
import { Platform, StatusBar } from 'react-native';

interface FullscreenState {
  isFullscreen: boolean;
  toggle: () => void;
  setFullscreen: (val: boolean) => void;
}

export const useFullscreenStore = create<FullscreenState>((set, get) => ({
  isFullscreen: false,
  setFullscreen: (val: boolean) => set({ isFullscreen: val }),
  toggle: () => {
    const current = get().isFullscreen;
    const next = !current;

    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      try {
        const isActuallyFull = Boolean(
          document.fullscreenElement ||
          (document as any).webkitFullscreenElement ||
          (document as any).mozFullScreenElement ||
          (document as any).msFullscreenElement
        );

        if (!isActuallyFull) {
          const docEl = document.documentElement as any;
          if (docEl.requestFullscreen) {
            docEl.requestFullscreen().catch(() => {});
          } else if (docEl.webkitRequestFullscreen) {
            docEl.webkitRequestFullscreen();
          } else if (docEl.mozRequestFullScreen) {
            docEl.mozRequestFullScreen();
          } else if (docEl.msRequestFullscreen) {
            docEl.msRequestFullscreen();
          }
          set({ isFullscreen: true });
        } else {
          if (document.exitFullscreen) {
            document.exitFullscreen().catch(() => {});
          } else if ((document as any).webkitExitFullscreen) {
            (document as any).webkitExitFullscreen();
          } else if ((document as any).mozCancelFullScreen) {
            (document as any).mozCancelFullScreen();
          } else if ((document as any).msExitFullscreen) {
            (document as any).msExitFullscreen();
          }
          set({ isFullscreen: false });
        }
      } catch (err) {
        console.warn('[FullscreenStore] Web toggle error:', err);
      }
    } else {
      // Native Mobile / Tablet (Android / iOS)
      StatusBar.setHidden(next, 'fade');
      set({ isFullscreen: next });
    }
  },
}));

// Listen to browser-native fullscreen events (F11, Escape key, or browser chrome buttons)
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const syncFsState = () => {
    const isFull = Boolean(
      document.fullscreenElement ||
      (document as any).webkitFullscreenElement ||
      (document as any).mozFullScreenElement ||
      (document as any).msFullscreenElement
    );
    useFullscreenStore.getState().setFullscreen(isFull);
  };

  document.addEventListener('fullscreenchange', syncFsState);
  document.addEventListener('webkitfullscreenchange', syncFsState);
  document.addEventListener('mozfullscreenchange', syncFsState);
  document.addEventListener('MSFullscreenChange', syncFsState);
}

