// This file extends the Express Request interface to include our custom 'user' property.
// This avoids TypeScript errors when we attach the authenticated user to the request object.

import { User } from './models'; // Assuming User type is defined elsewhere

declare global {
  namespace Express {
    export interface Request {
      user?: {
        id: string;
        role: 'Admin' | 'Unit Admin' | 'Unit Leader' | 'User' | 'Guest';
        unitIds: string[];
      };
    }
  }
}

// Minimal User type for backend context
export interface User {
  id: string;
  name: string;
  fullName: string;
  email: string;
  role: 'Admin' | 'Unit Admin' | 'Unit Leader' | 'User' | 'Guest' | 'Demo User';
  unitIds?: string[];
  position?: string;
}
