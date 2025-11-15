import { Timestamp } from 'firebase/firestore';

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
    radius: 'sm' | 'md' | 'lg';
    elevation: 'low' | 'mid' | 'high';
    typographyScale: 'S' | 'M' | 'L';
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
    schemaVersion?: number;
    reservationMode?: 'request' | 'auto';
    notificationEmails?: string[];
}


export interface Shift {
  id: string;
  userId: string;
  userName: string;
  unitId?: string;
  position: string;
  start: Timestamp;
  end?: Timestamp | null;
  note?: string;
  status: 'draft' | 'published';
  isDayOff?: boolean;
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
}

export interface Unit {
    id: string;
    name: string;
    logoUrl?: string;
    sheetId?: string;
}

export interface Position {
    id: string;
    name: string;
}

export interface DailySetting {
    isOpen: boolean;
    openingTime: string;
    closingTime: string;
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
    canManageContacts: boolean;
    canViewAllContacts: boolean;
    canManageUnits: boolean;
    canCreatePolls: boolean;
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