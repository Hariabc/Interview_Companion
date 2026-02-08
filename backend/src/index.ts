console.log("Starting index.ts...");
import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import path from 'path';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

// Swagger Docs
const swaggerDocument = YAML.load(path.join(__dirname, '../swagger.yaml'));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Routes (Imports will be added as we create them)
import authRoutes from './routes/authRoutes';
import interviewRoutes from './routes/interviewRoutes';
import resumeRoutes from './routes/resumeRoutes';

app.use('/auth', authRoutes);
app.use('/interviews', interviewRoutes);
app.use('/resume', resumeRoutes);
// app.use('/dashboard', dashboardRoutes);

app.get('/', (req: Request, res: Response) => {
    res.json({ message: 'AI Mock Interview API is running' });
});

// Error handling middleware
app.use((err: any, req: Request, res: Response, next: express.NextFunction) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
