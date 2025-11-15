// --- MOCK DATABASE CLIENT ---
// In a real application, this file would initialize and export a database client
// like Prisma Client, a Knex instance, or a Mongoose connection.

// This mock simulates the Prisma Client API for demonstration purposes.
// FIX: Use ES module import for consistency and to resolve 'require' not found error.
import { randomUUID } from 'crypto';

const dbStore: {
    shifts: any[];
    users: any[];
    files: any[];
    auditLogs: any[];
} = {
    shifts: [],
    users: [],
    files: [],
    auditLogs: [],
};

const mockDbClient = {
    shift: {
        findUnique: async (query: { where: { id: string } }) => {
            console.log('[DB MOCK] findUnique shift:', query);
            return dbStore.shifts.find(s => s.id === query.where.id) || null;
        },
        findMany: async (query: { where: any }) => {
            console.log('[DB MOCK] findMany shifts:', query);
            // This is a very simplified mock and doesn't handle complex queries.
            return dbStore.shifts.filter(s => s.userId === query.where.userId);
        },
        create: async (query: { data: any }) => {
            console.log('[DB MOCK] create shift:', query);
            const newShift = { id: randomUUID(), ...query.data };
            dbStore.shifts.push(newShift);
            return newShift;
        },
        update: async (query: { where: { id: string }, data: any }) => {
            console.log('[DB MOCK] update shift:', query);
            const index = dbStore.shifts.findIndex(s => s.id === query.where.id);
            if (index === -1) return null;
            dbStore.shifts[index] = { ...dbStore.shifts[index], ...query.data };
            return dbStore.shifts[index];
        }
    },
    file: {
        findUnique: async (query: { where: { id: string } }) => {
            console.log('[DB MOCK] findUnique file:', query);
            return dbStore.files.find(f => f.id === query.where.id) || null;
        }
    },
    auditLog: {
        create: async (query: { data: any }) => {
            console.log('[DB MOCK] create auditLog:', query.data);
            const newLog = { id: dbStore.auditLogs.length + 1, ...query.data };
            dbStore.auditLogs.push(newLog);
            return newLog;
        }
    }
};

export const db = mockDbClient;