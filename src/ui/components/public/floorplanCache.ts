import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../../core/firebase/config';
import { Floorplan, Table, Zone } from '../../../core/models/data';

export interface FloorplanData {
  floorplans: Floorplan[];
  zones: Zone[];
  tables: Table[];
}

const floorplanCache = new Map<string, FloorplanData>();
const inflightRequests = new Map<string, Promise<FloorplanData>>();

export const getCachedFloorplanData = (unitId: string) =>
  floorplanCache.get(unitId) || null;

export const fetchFloorplanData = async (unitId: string): Promise<FloorplanData> => {
  const cached = floorplanCache.get(unitId);
  if (cached) return cached;

  const inflight = inflightRequests.get(unitId);
  if (inflight) return inflight;

  const request = Promise.all([
    getDocs(collection(db, 'units', unitId, 'floorplans')),
    getDocs(collection(db, 'units', unitId, 'zones')),
    getDocs(collection(db, 'units', unitId, 'tables')),
  ]).then(([floorplansSnap, zonesSnap, tablesSnap]) => {
    const data: FloorplanData = {
      floorplans: floorplansSnap.docs.map(
        docSnap => ({ id: docSnap.id, ...docSnap.data() } as Floorplan)
      ),
      zones: zonesSnap.docs.map(
        docSnap => ({ id: docSnap.id, ...docSnap.data() } as Zone)
      ),
      tables: tablesSnap.docs.map(
        docSnap => ({ id: docSnap.id, ...docSnap.data() } as Table)
      ),
    };
    floorplanCache.set(unitId, data);
    inflightRequests.delete(unitId);
    return data;
  });

  inflightRequests.set(unitId, request);
  return request;
};
