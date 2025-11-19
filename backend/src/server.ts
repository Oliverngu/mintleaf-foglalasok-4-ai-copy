import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { ApiError } from './utils/errors';

// Import routes
import shiftRoutes from './routes/shifts';
// import fileRoutes from './routes/files'; // TEMP: kikapcsolva, amíg a files route-ot nem refaktoráljuk

dotenv.config();

const app: Express = express();
const PORT = process.env.PORT || 3001;

// --- Core Middleware ---
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Routes ---

// Health check / root endpoint
app.get('/', (req: Request, res: Response) => {
  res.send('MintLeaf Backend is running!');
});

// Shifts API
app.use('/api/shifts', shiftRoutes);

// Files API – jelenleg kikapcsolva, amíg a route-ot nem refaktoráljuk
// app.use('/api/files', fileRoutes);

// Email test endpoint – Cloud Run + frontend teszteléshez
// Jelenleg AUTH NÉLKÜL, hogy egyszerűen tudd tesztelni cURL-ből és a webappból.
// Ha már minden stabil, ide később rá lehet tenni Auth middleware-t.
app.post('/email-test', (req: Request, res: Response) => {
  console.log('[/email-test] Received payload:', req.body);

  return res.json({
    message: 'Email test endpoint OK (MintLeaf backend on Cloud Run)',
    dryRun: true,
    received: req.body,
  });
});

// --- Error Handling ---

// 404 – minden ismeretlen route ide jön
app.use((req: Request, res: Response, next: NextFunction) => {
  next(new ApiError(404, 'Endpoint not found'));
});

// Globális hiba-kezelő
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('[Global Error Handler]', err);

  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      message: err.message,
      errors: err.errors,
    });
  }

  return res.status(500).json({ message: 'Internal Server Error' });
});

// --- Server start (local dev) ---
app.listen(PORT, () => {
  console.log(`[server]: Server is running at http://localhost:${PORT}`);
});