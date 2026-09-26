import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import documentRoutes from './routes/document.js';
import { errorHandler } from './middleware/errorHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../.env') });

if (!process.env.GEMINI_API_KEY) {
  console.error('ERROR: GEMINI_API_KEY environment variable is not set in the root .env file.');
  process.exit(1);
}

const app = express();

// This API is intentionally called from a separate frontend origin, so the
// default same-origin resource policy is relaxed for it; everything else
// stays at helmet's secure defaults.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
// Text input is capped at 500,000 characters (see validation.js); 2mb leaves
// headroom for JSON overhead while keeping the request body DoS surface small.
app.use(express.json({ limit: '2mb' }));

app.use('/api/documents', documentRoutes);

app.use(errorHandler);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});




