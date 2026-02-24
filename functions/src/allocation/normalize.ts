import { FloorplanTable, FloorplanZone } from './types';

const normalizeTags = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map(tag => (typeof tag === 'string' ? tag.trim().toLowerCase() : ''))
    .filter(Boolean);
};

export const normalizeZone = (raw: unknown, idFallback?: string): FloorplanZone => {
  const data = (raw ?? {}) as Record<string, unknown>;
  const type =
    data.type === 'bar' || data.type === 'outdoor' || data.type === 'table' || data.type === 'other'
      ? data.type
      : undefined;
  const priority =
    typeof data.priority === 'number' && !Number.isNaN(data.priority)
      ? data.priority
      : undefined;
  return {
    id: typeof data.id === 'string' ? data.id : idFallback || '',
    name: typeof data.name === 'string' ? data.name : undefined,
    isActive: typeof data.isActive === 'boolean' ? data.isActive : true,
    tags: normalizeTags(data.tags),
    type,
    priority,
  };
};

export const normalizeTable = (raw: unknown, idFallback?: string): FloorplanTable => {
  const data = (raw ?? {}) as Record<string, unknown>;
  const canCombine =
    typeof data.canCombine === 'boolean'
      ? data.canCombine
      : typeof data.isCombinable === 'boolean'
      ? data.isCombinable
      : false;
  return {
    id: typeof data.id === 'string' ? data.id : idFallback || '',
    zoneId: typeof data.zoneId === 'string' ? data.zoneId : undefined,
    isActive: typeof data.isActive === 'boolean' ? data.isActive : true,
    tableGroup: typeof data.tableGroup === 'string' ? data.tableGroup : undefined,
    canCombine,
    tags: normalizeTags(data.tags),
    minCapacity: typeof data.minCapacity === 'number' ? data.minCapacity : undefined,
    capacityMax: typeof data.capacityMax === 'number' ? data.capacityMax : undefined,
    canSeatSolo: typeof data.canSeatSolo === 'boolean' ? data.canSeatSolo : undefined,
  };
};
