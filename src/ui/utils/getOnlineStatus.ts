export const getOnlineStatus = (explicit?: boolean): boolean | undefined => {
  if (typeof explicit === 'boolean') return explicit;
  if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
    return navigator.onLine;
  }
  return undefined;
};
