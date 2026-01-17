import { Timestamp } from 'firebase/firestore';
import { EmailTypeId } from '../email/emailTypes';

// NEW: Define the structure for a single widget's configuration
export interface WidgetConfig {
  id: string;
  visible: boolean;
  order: number;
}

// NEW: Define the structure for PNG export styling
export interface ExportStyleSettings {
  id: string; // unitId
  // Row Coloring
  zebraStrength: number; // 0-100
  zebraColor: string;
  // Name Column Coloring
  nameColumnColor: string;
  // Header Coloring
  dayHeaderBgColor: string;
  categoryHeaderBgColor: string;
  // FIX: Added missing property to store calculated text color.
  categoryHeaderTextColor: string;
  // Grid and Border
  gridThickness: number; // 1-2
  gridColor: string;
  useRoundedCorners: boolean;
  borderRadius: number; // 6-12
  // Typography
  fontSizeCell: number; // 12-16
  fontSizeHeader: number; // 14-18
  // Layout
  useFullNameForDays: boolean;
}


export interface User {
  id: string;
  name: string;
  nickname?: string;
  nicknameLower?: string;
  lastName: string;
  firstName: string;
  fullName: string;
  email: string;
  role: 'Admin' | 'Unit Admin' | 'Unit Leader' | 'User' | 'Guest' | 'Demo User';
  unitIds?: string[];
  position?: string;
  dashboardConfig?: WidgetConfig[]; // NEW: Add dashboard configuration to user
  notifications?: {
    newSchedule?: boolean;
  };
  registrationEmailSent?: boolean;
}

export interface Request {
  id: string;
  userId: string;
  userName: string;
  unitId?: string;
  startDate: Timestamp;
  endDate: Timestamp;
  note?: string;
  type: 'leave' | 'availability';
  timeRange?: { from: string; to: string };
  status: 'pending' | 'approved' | 'rejected';
  createdAt: Timestamp;
  reviewedBy?: string;
  reviewedAt?: Timestamp;
}

export interface Booking {
  id: string;
  unitId: string;
  name: string;
  headcount: number;
  occasion: string;
  source?: string;
  startTime: Timestamp;
  endTime: Timestamp;
  status: 'confirmed' | 'pending' | 'cancelled';
  createdAt: Timestamp;
  notes?: string;
  
  // For admin-created bookings
  phone?: string; 
  email?: string;

  // For guest-submitted bookings
  contact?: {
    phoneE164: string;
    email: string;
  };
  locale?: 'hu' | 'en';

  cancelledAt?: Timestamp;
  cancelReason?: string;
  referenceCode?: string;
  customData?: Record<string, string>;
  reservationMode?: 'auto' | 'request';
  adminActionTokenHash?: string;
  adminActionExpiresAt?: Timestamp;
  adminActionUsedAt?: Timestamp | null;
  adminActionHandledAt?: Timestamp;
  adminActionSource?: 'email' | 'manual';
  cancelledBy?: 'guest' | 'admin' | 'system';
  manageTokenHash?: string;
  zoneId?: string;
  assignedTableIds?: string[];
  seatingSource?: 'auto' | 'manual';
  isVip?: boolean;
  noShowAt?: Timestamp;
  preferredTimeSlot?: string | null;
  seatingPreference?: 'any' | 'bar' | 'table' | 'outdoor';
  allocationIntent?: {
    timeSlot?: string | null;
    zoneId?: string | null;
    tableGroup?: string | null;
  };
  allocationDiagnostics?: {
    intentQuality?: 'none' | 'weak' | 'good';
    reasons?: string[];
    warnings?: string[];
    matchedZoneId?: string | null;
  };
  allocationOverride?: {
    enabled?: boolean;
    timeSlot?: string | null;
    zoneId?: string | null;
    tableGroup?: string | null;
    tableIds?: string[] | null;
    note?: string | null;
  };
  allocationOverrideSetAt?: Timestamp | null;
  allocationOverrideSetByUid?: string;
  allocationFinal?: {
    source?: 'intent' | 'override';
    timeSlot?: string | null;
    zoneId?: string | null;
    tableGroup?: string | null;
    tableIds?: string[] | null;
    locked?: boolean | null;
  };
  allocationFinalComputedAt?: Timestamp | null;
  allocated?: {
    zoneId?: string | null;
    tableIds?: string[];
    traceId?: string;
    decidedAtMs?: number;
    strategy?: string | null;
    diagnosticsSummary?: string;
    computedForStartTimeMs?: number;
    computedForEndTimeMs?: number;
    computedForHeadcount?: number;
    algoVersion?: string;
  };
}

export interface Zone {
  id: string;
  name: string;
  priority: number;
  isActive: boolean;
  isEmergency?: boolean;
  tags?: string[];
  type?: 'bar' | 'outdoor' | 'table' | 'other';
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Table {
  id: string;
  name: string;
  zoneId: string;
  capacityMax: number;
  minCapacity: number;
  isActive: boolean;
  tableGroup?: string | null;
  tags?: string[];
  floorplanId?: string | null;
  shape?: 'rect' | 'circle' | string | null;
  w?: number | null;
  h?: number | null;
  radius?: number | null;
  snapToGrid?: boolean;
  locked?: boolean | null;
  x?: number | null;
  y?: number | null;
  rot?: number | null;
  canSeatSolo?: boolean;
  canCombine?: boolean | null;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Floorplan {
  id: string;
  name: string;
  width?: number | null;
  height?: number | null;
  isActive?: boolean;
  gridSize?: number;
  backgroundImageUrl?: string | null;
  obstacles?: FloorplanObstacle[];
  unitId?: string | null;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface FloorplanObstacle {
  id: string;
  name?: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
  rot?: number | null;
}

export interface TableCombination {
  id: string;
  tableIds: string[];
  isActive: boolean;
  groupId?: string;
  resultingCapacity?: number;
  constraints?: string[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface SeatingSettings {
  bufferMinutes?: number;
  defaultDurationMinutes?: number;
  allowGuestDurationEdit?: boolean;
  holdTableMinutesOnLate?: number;
  maxCombineCount?: number;
  vipEnabled?: boolean;
  activeFloorplanId?: string;
  soloAllowedTableIds?: string[];
  allocationEnabled?: boolean;
  allocationMode?: 'capacity' | 'floorplan' | 'hybrid';
  allocationStrategy?: 'bestFit' | 'minWaste' | 'priorityZoneFirst';
  defaultZoneId?: string;
  zonePriority?: string[];
  overflowZones?: string[];
  allowCrossZoneCombinations?: boolean;
  emergencyZones?: {
    enabled?: boolean;
    zoneIds?: string[];
    activeRule?: 'always' | 'byWeekday';
    weekdays?: number[];
  };
}

export interface PublicBookingDTO {
  id: string;
  unitId: string;
  unitName?: string;
  name: string;
  headcount: number;
  startTimeMs: number | null;
  endTimeMs: number | null;
  preferredTimeSlot?: string | null;
  seatingPreference?: 'any' | 'bar' | 'table' | 'outdoor';
  status: 'confirmed' | 'pending' | 'cancelled';
  locale?: 'hu' | 'en';
  occasion?: string;
  source?: string;
  referenceCode?: string;
  cancelReason?: string;
  cancelledBy?: 'guest' | 'admin' | 'system';
  contact?: {
    phoneE164?: string;
    email?: string;
  };
  adminActionTokenHash?: string | null;
  adminActionExpiresAtMs?: number | null;
  adminActionUsedAtMs?: number | null;
}

export interface ThemeSettings {
    primary: string;
    surface: string;
    background: string;
    textPrimary: string;
    textSecondary: string;
    accent: string;
    success: string;
    danger: string;
    radius: 'sm' | 'md' | 'lg' | 'xl';
    elevation: 'none' | 'low' | 'medium' | 'mid' | 'high';
    typographyScale: 'S' | 'M' | 'L';
    highlight?: string;
    backgroundImageUrl?: string;
    timeWindowLogoMode?: 'unit' | 'custom' | 'none';
    timeWindowLogoUrl?: string;
    headerBrandMode?: 'text' | 'logo';
    headerLogoMode?: 'unit' | 'custom' | 'none';
    headerLogoUrl?: string;
}

export interface CustomSelectField {
  id: string;
  label: string;
  options: string[];
}

export interface GuestFormSettings {
    customSelects?: CustomSelectField[];
}

export interface ReservationSetting {
    id: string; // unitId
    blackoutDates: string[]; // "YYYY-MM-DD"
    dailyCapacity?: number | null;
    bookableWindow?: { from: string; to: string }; // "HH:mm"
    kitchenStartTime?: string | null;
    kitchenEndTime?: string | null;
    barStartTime?: string | null;
    barEndTime?: string | null;
    guestForm?: GuestFormSettings;
    theme?: ThemeSettings;
    uiTheme?: 'minimal_glass' | 'elegant' | 'bubbly' | 'classic_elegant' | 'playful_bubble' | 'smooth_touch';
    schemaVersion?: number;
    reservationMode?: 'request' | 'auto';
    notificationEmails?: string[];
}

export interface ReservationCapacity {
  date: string;
  count?: number;
  totalCount?: number;
  byTimeSlot?: Record<string, number>;
  byZone?: Record<string, number>;
  byTableGroup?: Record<string, number>;
  limit?: number;
  updatedAt?: Timestamp;
  capacityNeedsRecalc?: boolean;
  hasAllocationWarnings?: boolean;
}


export interface Shift {
  id: string;
  userId: string;
  userName: string;
  unitId?: string;
  position: string;
  start?: Timestamp | null;
  end?: Timestamp | null;
  note?: string;
  status: 'draft' | 'published';
  isDayOff?: boolean;
  isHighlighted?: boolean;
  dayKey?: string;
}

export interface TimeEntry {
  id: string;
  userId: string;
  unitId: string;
  startTime: Timestamp;
  endTime?: Timestamp;
  status: 'active' | 'completed';
}

export interface Todo {
  id: string;
  text: string;
  isDone: boolean;
  createdBy: string;
  createdByUid: string;
  createdAt: Timestamp;
  completedBy?: string;
  completedAt?: Timestamp;
  unitId?: string;
  seenBy?: string[];
  seenAt?: { [userId: string]: Timestamp };
  isDaily?: boolean;
  dailyType?: 'opening' | 'closing' | 'general';
  completedDate?: string;
}

export interface Feedback {
  id: string;
  text: string;
  unitId: string;
  createdAt: Timestamp;
  reactions?: {
    thankYou?: string[]; // Array of user IDs who reacted
  };
}

export interface Contact {
  id: string;
  name: string;
  phone: string;
  email?: string;
  note?: string;
  categoryId: string;
  isVisible: boolean;
  createdByUid?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  unitId?: string;
}

export interface ContactCategory {
  id: string;
  name: string;
  isUserSelectable: boolean;
}

export interface Invitation {
  id: string;
  code: string;
  role: 'Admin' | 'Unit Admin' | 'User' | 'Guest';
  unitId: string;
  position: string;
  prefilledLastName?: string;
  prefilledFirstName?: string;
  status: 'active' | 'used';
  createdAt: Timestamp;
  usedBy?: string;
  usedAt?: Timestamp;
}

export interface FileMetadata {
  id: string;
  name: string;
  url: string;
  storagePath: string;
  size: number;
  contentType: string;
  uploadedBy: string;
  uploadedByUid: string;
  uploadedAt: Timestamp;
  unitId: string; // 'central' for shared documents
  categoryId?: string;
  subcategory?: string;
}

export interface KnowledgeCategory {
  id: string;
  title: string;
  order: number;
  unitId: string;
  subcategories?: string[];
}

export interface KnowledgeNote {
  id: string;
  title: string;
  content: string;
  categoryId: string;
  subcategory?: string;
  unitId: string;
  createdAt: Timestamp;
  createdBy: string;
  createdByUid: string;
}

// --- INVENTORY MODULE INTERFACES ---
export interface InventoryCategory {
  id: string;
  name: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface InventorySupplier {
  id: string;
  name: string;
  contactEmail?: string;
  phone?: string;
  note?: string;
  contactId?: string;
  leadTimeMinDays?: number;
  leadTimeMaxDays?: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface InventoryProduct {
  id: string;
  name: string;
  categoryId?: string;
  supplierId?: string; // legacy support
  supplierIds?: string[];
  avgDailyUsage?: number;
  unitPrice?: number;
  currency?: string;
  minOrderQuantity?: number;
  packageSize?: number;
  packageLabel?: string;
  safetyStock?: number;
  unitOfMeasure: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface InventoryIdealStock {
  id: string;
  productId: string;
  idealQuantity: number;
  updatedAt: Timestamp;
}

export interface InventoryCurrentStock {
  id: string;
  productId: string;
  currentQuantity: number;
  updatedAt: Timestamp;
  updatedByUserId?: string;
}

export interface InventorySettings {
  id?: string;
  targetDaysOfCover?: number;
  safetyDaysForSupplyRisk?: number;
}

export interface Unit {
    id: string;
    name: string;
    logoUrl?: string;
    logoFileId?: string;
    logo?: string;
    sheetId?: string;
    brandColors?: {
      primary: string; // Header
      secondary: string; // Buttons, Active Menu Item
      background: string; // App Background
    };
    uiTheme?: 'default' | 'brand';
    uiHeaderImageUrl?: string;
    uiBackgroundImageUrl?: string;
}

export interface Position {
    id: string;
    name: string;
}

export interface DailySetting {
    isOpen: boolean;
    openingTime: string;
    closingTime: string;
    closingOffsetMinutes?: number;
    quotas: { [position: string]: number };
}

export interface ScheduleSettings {
    id: string; // Composite key: unitId_weekStartDate
    unitId: string;
    weekStartDate: string;
    showOpeningTime: boolean;
    showClosingTime: boolean;
    dailySettings: {
        [dayIndex: number]: DailySetting;
    };
}


export interface Permissions {
    canAddBookings: boolean;
    canManageSchedules: boolean;
    canManageUsers: boolean;
    canManagePositions: boolean;
    canGenerateInvites: boolean;
    canManageLeaveRequests: boolean;
    canSubmitLeaveRequests: boolean;
    canManageTodos: boolean;
    canManageKnowledgeBase: boolean;
    canManageKnowledgeCategories: boolean;
    canManageContacts: boolean;
    canViewAllContacts: boolean;
    canManageUnits: boolean;
    canCreatePolls: boolean;
    canViewInventory: boolean;
    canManageInventory: boolean;
}

export type RolePermissions = {
    [role in User['role']]?: Partial<Permissions>;
};

// --- POLLS MODULE INTERFACES ---
export interface PollOption {
  id: string;
  label: string;
}

export interface Poll {
  id: string;
  question: string;
  options: PollOption[];
  unitId: string;
  multipleChoice: boolean;
  createdBy: string;
  createdAt: Timestamp;
  closesAt: Timestamp | null;
}

export interface PollWithResults extends Poll {
  results: Record<string, number>;
  totalVotes: number;
  userVote: string[] | null;
}

export interface PollVote {
  userId: string;
  selectedOptionIds: string[];
  votedAt: Timestamp;
}

// --- EMAIL SETTINGS INTERFACE ---
export interface EmailSettingsDocument {
  enabledTypes: Record<string, boolean>;
  adminRecipients: Record<string, string[]>;
  templateOverrides?: {
    [key in EmailTypeId]?: {
      subject: string;
      html: string;
    }
  };
  adminDefaultEmail?: string;
}

// --- DEMO MODE DATA ---
export const demoUnit: Unit = { id: 'demo-unit-id', name: 'DEMO Üzlet', logoUrl: 'https://firebasestorage.googleapis.com/v0/b/mintleaf-74d27.appspot.com/o/unit_logos%2Fdemo-unit-id%2Flogo_demo.png?alt=media&token=1a2b3c4d-5e6f-7g8h-9i0j-1k2l3m4n5o6p' };
export const demoUser: User = {
    id: 'demo-user-id',
    name: 'demouser',
    lastName: 'Demo',
    firstName: 'Felhasználó',
    fullName: 'Demo Felhasználó',
    email: 'demo@example.com',
    role: 'Demo User',
    unitIds: [demoUnit.id],
    position: 'Munkatárs'
};
const otherDemoUser: User = {
    id: 'other-demo-user-id',
    name: 'teszteszter',
    lastName: 'Teszt',
    firstName: 'Eszter',
    fullName: 'Teszt Eszter',
    email: 'eszter@example.com',
    role: 'User',
    unitIds: [demoUnit.id],
    position: 'Pultos'
};

export const demoData = {
    requests: [
        { id: 'req1', userId: otherDemoUser.id, userName: otherDemoUser.fullName, status: 'approved', startDate: Timestamp.fromDate(new Date(new Date().setDate(new Date().getDate() + 8))), endDate: Timestamp.fromDate(new Date(new Date().setDate(new Date().getDate() + 9))), createdAt: Timestamp.now() },
    ] as Request[],
    bookings: [
        { 
            id: 'book1', 
            unitId: demoUnit.id,
            name: 'Nagy Család', 
            headcount: 5,
            occasion: 'Vacsora',
            startTime: Timestamp.fromDate(new Date(new Date().setHours(19, 0, 0, 0))),
            endTime: Timestamp.fromDate(new Date(new Date().setHours(21, 0, 0, 0))),
            status: 'confirmed',
            createdAt: Timestamp.now(),
            notes: 'Ablak melletti asztalt szeretnének.',
        },
    ] as Booking[],
    shifts: [
        { id: 'shift1', userId: demoUser.id, userName: demoUser.fullName, position: demoUser.position!, unitId: demoUnit.id, status: 'published', start: Timestamp.fromDate(new Date(new Date().setHours(8, 0, 0, 0))), end: Timestamp.fromDate(new Date(new Date().setHours(16, 0, 0, 0))) },
        { id: 'shift2', userId: otherDemoUser.id, userName: otherDemoUser.fullName, position: otherDemoUser.position!, unitId: demoUnit.id, status: 'published', start: Timestamp.fromDate(new Date(new Date().setHours(14, 0, 0, 0))), end: Timestamp.fromDate(new Date(new Date().setHours(22, 0, 0, 0))) }
    ] as Shift[],
    todos: [
        { id: 'todo1', text: 'Hűtők leltárazása', isDone: false, createdBy: 'Vezető', createdByUid: 'admin-id', createdAt: Timestamp.now(), unitId: demoUnit.id, seenBy: [demoUser.id] },
        { id: 'todo2', text: 'Szárazáru rendelés leadása', isDone: true, completedBy: otherDemoUser.fullName, completedAt: Timestamp.fromDate(new Date(Date.now() - 3600 * 1000)), createdBy: 'Vezető', createdByUid: 'admin-id', createdAt: Timestamp.fromDate(new Date(Date.now() - 24 * 3600 * 1000)), unitId: demoUnit.id, seenBy: [demoUser.id, otherDemoUser.id] }
    ] as Todo[],
    adminTodos: [] as Todo[],
    allUnits: [demoUnit] as Unit[],
    allUsers: [demoUser, otherDemoUser] as User[],
};
// --- END DEMO MODE DATA ---

export const mintLeafLogoSvgDataUri = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0iIzM0RDM5OSIgZD0iTTUgMjFjLjUtNC41IDIuNS04IDctMTBNOSAxOGM2LjIxOCAwIDEwLjUtMy4yODIgMTEtMTJ2LTJoLTQuMDE0Yy05IDAtMTEuOTg2IDQtMTIgOWMwIDEgMCAzIDIgNWgzeiIgLz48L3N2Zz4=";
