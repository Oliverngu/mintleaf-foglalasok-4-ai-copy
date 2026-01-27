import type { Timestamp } from 'firebase/firestore';

export type AvailabilityWindow = {
  startHHmm: string;
  endHHmm: string;
};

export type AvailabilityException = {
  dateKey: string;
  available: boolean;
  windows?: AvailabilityWindow[];
};

export type EmployeeAvailability = {
  weekly: Record<string, AvailabilityWindow[]>;
  exceptions: AvailabilityException[];
};

export type EmployeeProfileV1 = {
  version: 1;
  userId: string;
  unitId: string;
  availability: EmployeeAvailability;
  skillsByPositionId: Record<string, 1 | 2 | 3 | 4 | 5>;
  scores?: {
    reliability?: number;
    punctuality?: number;
  };
  limits?: {
    maxHoursPerWeek?: number;
    maxHoursPerDay?: number;
  };
  preferences?: {
    preferredPositionIds?: string[];
    avoidClose?: boolean;
  };
  updatedAt?: Timestamp | null;
};
