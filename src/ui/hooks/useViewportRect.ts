import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

type ViewportRect = {
  width: number;
  height: number;
};

type UseViewportRectOptions = {
  retryFrames?: number;
  deps?: ReadonlyArray<unknown>;
};

const DEFAULT_RETRY_FRAMES = 20;

export const useViewportRect = (
  ref: React.RefObject<HTMLElement | null>,
  options: UseViewportRectOptions = {}
): ViewportRect => {
  const retryFrames = options.retryFrames ?? DEFAULT_RETRY_FRAMES;
  const deps = options.deps ?? [];
  const retryRafRef = useRef<number | null>(null);
  const retryCountRef = useRef(0);
  const [rect, setRect] = useState<ViewportRect>({ width: 0, height: 0 });

  const updateRect = useCallback((width: number, height: number) => {
    setRect(prev => {
      if (prev.width === width && prev.height === height) {
        return prev;
      }
      return { width, height };
    });
  }, []);

  const measure = useCallback(() => {
    const node = ref.current;
    const width = node?.clientWidth ?? 0;
    const height = node?.clientHeight ?? 0;
    updateRect(width, height);
  }, [ref, updateRect]);

  useLayoutEffect(() => {
    measure();
  }, [measure, ...deps]);

  useLayoutEffect(() => {
    retryCountRef.current = 0;
    if (retryRafRef.current !== null) {
      cancelAnimationFrame(retryRafRef.current);
    }
    const retryMeasure = () => {
      const node = ref.current;
      const width = node?.clientWidth ?? 0;
      const height = node?.clientHeight ?? 0;
      if (width > 0 && height > 0) {
        updateRect(width, height);
        retryRafRef.current = null;
        return;
      }
      retryCountRef.current += 1;
      if (retryCountRef.current >= retryFrames) {
        updateRect(width, height);
        retryRafRef.current = null;
        return;
      }
      retryRafRef.current = requestAnimationFrame(retryMeasure);
    };
    retryRafRef.current = requestAnimationFrame(retryMeasure);
    return () => {
      if (retryRafRef.current !== null) {
        cancelAnimationFrame(retryRafRef.current);
        retryRafRef.current = null;
      }
    };
  }, [measure, retryFrames, updateRect, ...deps]);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      const width = entry?.contentRect?.width ?? node.clientWidth ?? 0;
      const height = entry?.contentRect?.height ?? node.clientHeight ?? 0;
      updateRect(width, height);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, updateRect]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const handleResize = () => measure();
    const handleOrientationChange = () => measure();
    window.addEventListener('resize', handleResize, { passive: true });
    window.addEventListener('orientationchange', handleOrientationChange, { passive: true });
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleOrientationChange);
    };
  }, [measure]);

  return rect;
};
