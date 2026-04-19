import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { corsOptions } from './config/cors';
import { requestLogger } from './common/middleware/request-logger';
import { errorHandler } from './common/middleware/error-handler';
import healthRoutes from './modules/health/health.routes';
import { registerRoutes } from './routes';

const app = express();

app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json({ limit: '5mb' }));
app.use(requestLogger);

// Routes
app.use('/api', healthRoutes);
registerRoutes(app);

// Error handler (must be last)
app.use(errorHandler);

export default app;
