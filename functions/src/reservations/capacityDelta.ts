export type CapacityMutation = {
  key: string;
  totalDelta: number;
  slotDeltas?: Record<string, number>;
  bucketDeltas?: Record<string, number>;
};

export const computeCapacityMutationPlan = ({
  oldKey,
  newKey,
  oldCount,
  newCount,
  oldIncluded,
  newIncluded,
  oldSlotKey,
  newSlotKey,
  oldBucketKeys,
  newBucketKeys,
}: {
  oldKey: string;
  newKey: string;
  oldCount: number;
  newCount: number;
  oldIncluded: boolean;
  newIncluded: boolean;
  oldSlotKey?: string | null;
  newSlotKey?: string | null;
  oldBucketKeys?: string[];
  newBucketKeys?: string[];
}): CapacityMutation[] => {
  const sameKey = oldKey === newKey;
  const mutations = new Map<string, CapacityMutation>();
  const cleanSlotKey = (slotKey?: string | null) => (slotKey && slotKey.trim() ? slotKey.trim() : null);
  const addMutation = (
    key: string,
    totalDelta: number,
    slotKey?: string | null,
    slotDelta?: number,
    bucketKeys?: string[] | null,
    bucketDelta?: number
  ) => {
    const entry = mutations.get(key) ?? { key, totalDelta: 0 };
    entry.totalDelta += totalDelta;
    const normalizedSlotKey = cleanSlotKey(slotKey);
    if (normalizedSlotKey && slotDelta && slotDelta !== 0) {
      const slotDeltas = entry.slotDeltas ?? {};
      slotDeltas[normalizedSlotKey] = (slotDeltas[normalizedSlotKey] || 0) + slotDelta;
      entry.slotDeltas = slotDeltas;
    }
    if (bucketKeys && bucketKeys.length && bucketDelta && bucketDelta !== 0) {
      const bucketDeltas = entry.bucketDeltas ?? {};
      for (const bucketKey of bucketKeys) {
        if (!bucketKey) continue;
        bucketDeltas[bucketKey] = (bucketDeltas[bucketKey] || 0) + bucketDelta;
      }
      entry.bucketDeltas = bucketDeltas;
    }
    mutations.set(key, entry);
  };
  const hasSameBuckets =
    (oldBucketKeys?.length ?? 0) > 0 &&
    (newBucketKeys?.length ?? 0) > 0 &&
    oldBucketKeys?.length === newBucketKeys?.length &&
    oldBucketKeys?.every((key, index) => key === newBucketKeys?.[index]);

  if (sameKey) {
    if (oldIncluded && newIncluded) {
      const delta = newCount - oldCount;
      const slotSame = cleanSlotKey(oldSlotKey) === cleanSlotKey(newSlotKey);
      if (slotSame && hasSameBuckets) {
        if (delta !== 0) {
          addMutation(
            newKey,
            delta,
            newSlotKey ?? oldSlotKey ?? null,
            delta,
            newBucketKeys ?? oldBucketKeys ?? null,
            delta
          );
        }
      } else {
        if (oldCount !== 0) {
          addMutation(
            newKey,
            -oldCount,
            oldSlotKey ?? null,
            -oldCount,
            oldBucketKeys ?? null,
            -oldCount
          );
        }
        if (newCount !== 0) {
          addMutation(
            newKey,
            newCount,
            newSlotKey ?? null,
            newCount,
            newBucketKeys ?? null,
            newCount
          );
        }
      }
      return Array.from(mutations.values()).filter(
        mutation =>
          mutation.totalDelta !== 0 ||
          (mutation.slotDeltas && Object.keys(mutation.slotDeltas).length > 0) ||
          (mutation.bucketDeltas && Object.keys(mutation.bucketDeltas).length > 0)
      );
    }
    if (oldIncluded && !newIncluded) {
      if (oldCount !== 0) {
        addMutation(
          oldKey,
          -oldCount,
          oldSlotKey ?? null,
          -oldCount,
          oldBucketKeys ?? null,
          -oldCount
        );
      }
      return Array.from(mutations.values()).filter(
        mutation =>
          mutation.totalDelta !== 0 ||
          (mutation.slotDeltas && Object.keys(mutation.slotDeltas).length > 0) ||
          (mutation.bucketDeltas && Object.keys(mutation.bucketDeltas).length > 0)
      );
    }
    if (!oldIncluded && newIncluded) {
      if (newCount !== 0) {
        addMutation(
          newKey,
          newCount,
          newSlotKey ?? null,
          newCount,
          newBucketKeys ?? null,
          newCount
        );
      }
      return Array.from(mutations.values()).filter(
        mutation =>
          mutation.totalDelta !== 0 ||
          (mutation.slotDeltas && Object.keys(mutation.slotDeltas).length > 0) ||
          (mutation.bucketDeltas && Object.keys(mutation.bucketDeltas).length > 0)
      );
    }
    return [];
  }

  if (oldIncluded && !newIncluded) {
    if (oldCount !== 0) {
      addMutation(
        oldKey,
        -oldCount,
        oldSlotKey ?? null,
        -oldCount,
        oldBucketKeys ?? null,
        -oldCount
      );
    }
    return Array.from(mutations.values()).filter(
      mutation =>
        mutation.totalDelta !== 0 ||
        (mutation.slotDeltas && Object.keys(mutation.slotDeltas).length > 0) ||
        (mutation.bucketDeltas && Object.keys(mutation.bucketDeltas).length > 0)
    );
  }
  if (!oldIncluded && newIncluded) {
    if (newCount !== 0) {
      addMutation(
        newKey,
        newCount,
        newSlotKey ?? null,
        newCount,
        newBucketKeys ?? null,
        newCount
      );
    }
    return Array.from(mutations.values()).filter(
      mutation =>
        mutation.totalDelta !== 0 ||
        (mutation.slotDeltas && Object.keys(mutation.slotDeltas).length > 0) ||
        (mutation.bucketDeltas && Object.keys(mutation.bucketDeltas).length > 0)
    );
  }
  if (oldIncluded && newIncluded) {
    if (oldCount !== 0) {
      addMutation(
        oldKey,
        -oldCount,
        oldSlotKey ?? null,
        -oldCount,
        oldBucketKeys ?? null,
        -oldCount
      );
    }
    if (newCount !== 0) {
      addMutation(
        newKey,
        newCount,
        newSlotKey ?? null,
        newCount,
        newBucketKeys ?? null,
        newCount
      );
    }
    return Array.from(mutations.values()).filter(
      mutation =>
        mutation.totalDelta !== 0 ||
        (mutation.slotDeltas && Object.keys(mutation.slotDeltas).length > 0) ||
        (mutation.bucketDeltas && Object.keys(mutation.bucketDeltas).length > 0)
    );
  }

  return [];
};
