import React, { useEffect, useMemo, useState } from 'react';
import { ref, getDownloadURL, listAll } from 'firebase/storage';
import { Unit } from '../../../core/models/data';
import { storage } from '../../../core/firebase/config';

interface UnitLogoBadgeProps {
  unit?: Unit;
  size?: number;
  className?: string;
}

const logoCache = new Map<string, string | null>();

const isSafeLogoUrl = (url?: string | null) => {
  if (!url) return false;
  try {
    const parsed = new URL(url, 'https://placeholder.local');
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
};

const UnitLogoBadge: React.FC<UnitLogoBadgeProps> = ({
  unit,
  size = 20,
  className = ''
}) => {
  const [logoUrl, setLogoUrl] = useState<string | null>(() => {
    const inlineLogo = unit?.logoUrl || unit?.logo;
    return isSafeLogoUrl(inlineLogo) ? inlineLogo : null;
  });

  const initials = useMemo(() => {
    if (!unit?.name) return '?';
    return unit.name.charAt(0).toUpperCase();
  }, [unit?.name]);

  useEffect(() => {
    let isMounted = true;

    if (!unit?.id) {
      setLogoUrl(null);
      return () => {
        isMounted = false;
      };
    }

    const cacheKey = `${unit.id}:${unit.logoFileId || 'none'}`;
    if (logoCache.has(cacheKey)) {
      setLogoUrl(logoCache.get(cacheKey) || null);
      return () => {
        isMounted = false;
      };
    }

    const inlineLogo = unit.logoUrl || unit.logo;
    if (isSafeLogoUrl(inlineLogo)) {
      logoCache.set(cacheKey, inlineLogo || null);
      setLogoUrl(inlineLogo || null);
      return () => {
        isMounted = false;
      };
    }

    const resolveFromStorage = async () => {
      const primaryPath = unit.logoFileId
        ? `unit_logos/${unit.id}/${unit.logoFileId}`
        : null;
      let resolved: string | null = null;

      if (primaryPath) {
        try {
          resolved = await getDownloadURL(ref(storage, primaryPath));
        } catch {
          resolved = null;
        }
      }

      if (!resolved) {
        try {
          const folderRef = ref(storage, `unit_logos/${unit.id}`);
          const listing = await listAll(folderRef);
          const firstItem = listing.items[0];
          if (firstItem) {
            resolved = await getDownloadURL(firstItem);
          }
        } catch {
          resolved = null;
        }
      }

      const safeResolved = isSafeLogoUrl(resolved) ? resolved : null;
      logoCache.set(cacheKey, safeResolved);
      if (isMounted) {
        setLogoUrl(safeResolved);
      }
    };

    resolveFromStorage();
    return () => {
      isMounted = false;
    };
  }, [unit?.id, unit?.logoFileId, unit?.logoUrl, unit?.logo]);

  const dimensionStyle = { width: size, height: size } as const;

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={`${unit?.name || 'Egység'} logó`}
        crossOrigin="anonymous"
        className={`rounded-full object-cover border border-gray-200 ${className}`}
        style={dimensionStyle}
      />
    );
  }

  return (
    <div
      className={`flex items-center justify-center rounded-full bg-gray-100 text-gray-600 border border-gray-200 ${className}`}
      style={dimensionStyle}
    >
      <span className="text-[10px] font-semibold leading-none">{initials}</span>
    </div>
  );
};

export default UnitLogoBadge;
