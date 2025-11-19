import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { loginLimiter } from './middleware/rateLimiter';
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
app.get('/', (req: Request, res: Response) => {
  res.send('MintLeaf Backend is running!');
});

// app.use('/api/auth/login', loginLimiter);

app.use('/api/shifts', shiftRoutes);
// app.use('/api/files', fileRoutes); // TEMP: kikapcsolva

// --- Error Handling ---
app.use((req: Request, res: Response, next: NextFunction) => {
  next(new ApiError(404, 'Endpoint not found'));
});

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err);
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      message: err.message,
      errors: err.errors,
    });
  }
  return res.status(500).json({ message: 'Internal Server Error' });
});

app.listen(PORT, () => {
  console.log(`[server]: Server is running at http://localhost:${PORT}`);
});