export type CapacityMutation = { key: string; delta: number };

export const computeCapacityMutationPlan = ({
  oldKey,
  newKey,
  oldCount,
  newCount,
  oldIncluded,
  newIncluded,
}: {
  oldKey: string;
  newKey: string;
  oldCount: number;
  newCount: number;
  oldIncluded: boolean;
  newIncluded: boolean;
}): CapacityMutation[] => {
  const mutations: CapacityMutation[] = [];
  const sameKey = oldKey === newKey;

  if (sameKey) {
    if (oldIncluded && newIncluded) {
      const delta = newCount - oldCount;
      if (delta !== 0) {
        mutations.push({ key: newKey, delta });
      }
      return mutations;
    }
    if (oldIncluded && !newIncluded) {
      if (oldCount !== 0) {
        mutations.push({ key: oldKey, delta: -oldCount });
      }
      return mutations;
    }
    if (!oldIncluded && newIncluded) {
      if (newCount !== 0) {
        mutations.push({ key: newKey, delta: newCount });
      }
      return mutations;
    }
    return mutations;
  }

  if (oldIncluded && !newIncluded) {
    if (oldCount !== 0) {
      mutations.push({ key: oldKey, delta: -oldCount });
    }
    return mutations;
  }
  if (!oldIncluded && newIncluded) {
    if (newCount !== 0) {
      mutations.push({ key: newKey, delta: newCount });
    }
    return mutations;
  }
  if (oldIncluded && newIncluded) {
    if (oldCount !== 0) {
      mutations.push({ key: oldKey, delta: -oldCount });
    }
    if (newCount !== 0) {
      mutations.push({ key: newKey, delta: newCount });
    }
    return mutations;
  }

  return mutations;
};
