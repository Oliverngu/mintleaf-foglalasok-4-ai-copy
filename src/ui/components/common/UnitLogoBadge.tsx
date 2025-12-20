import React, { useEffect, useMemo, useState } from 'react';
import { ref, getDownloadURL } from 'firebase/storage';
import { Unit } from '../../../core/models/data';
import { storage } from '../../../core/firebase/config';

interface UnitLogoBadgeProps {
  unit?: Unit;
  size?: number;
  className?: string;
}

const UnitLogoBadge: React.FC<UnitLogoBadgeProps> = ({
  unit,
  size = 20,
  className = ''
}) => {
  const [logoUrl, setLogoUrl] = useState<string | null>(
    unit?.logoUrl || unit?.logo || null
  );

  const initials = useMemo(() => {
    if (!unit?.name) return '?';
    return unit.name.charAt(0).toUpperCase();
  }, [unit?.name]);

  useEffect(() => {
    let isMounted = true;

    const resolvedLogo = unit?.logoUrl || unit?.logo;
    if (resolvedLogo) {
      setLogoUrl(resolvedLogo);
      return () => {
        isMounted = false;
      };
    }

    if (!unit?.logoFileId || !unit.id) {
      setLogoUrl(null);
      return () => {
        isMounted = false;
      };
    }

    const storagePath = `unit_logos/${unit.id}/${unit.logoFileId}`;
    getDownloadURL(ref(storage, storagePath))
      .then(url => {
        if (isMounted) {
          setLogoUrl(url);
        }
      })
      .catch(() => {
        if (isMounted) {
          setLogoUrl(null);
        }
      });

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
