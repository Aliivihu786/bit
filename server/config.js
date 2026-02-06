import dotenv from 'dotenv';
import { join } from 'path';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  deepseekApiKey: process.env.DEEPSEEK_API_KEY,
  nodeEnv: process.env.NODE_ENV || 'development',
  maxIterations: parseInt(process.env.MAX_ITERATIONS || '15', 10),
  workspacesDir: join(process.cwd(), 'workspaces'),
};
