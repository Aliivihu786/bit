import dotenv from 'dotenv';
import { join } from 'path';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  moonshotApiKey: process.env.MOONSHOT_API_KEY,
  moonshotBaseUrl: process.env.MOONSHOT_BASE_URL || 'https://api.moonshot.ai/v1',
  deepseekApiKey: process.env.DEEPSEEK_API_KEY,
  nodeEnv: process.env.NODE_ENV || 'development',
  maxIterations: parseInt(process.env.MAX_ITERATIONS || '999', 10),
  workspacesDir: join(process.cwd(), 'workspaces'),
  mainModel: process.env.MAIN_MODEL || 'deepseek-reasoner',
  toolModel: process.env.TOOL_MODEL || '',
  compactionModel: process.env.COMPACTION_MODEL || '',
};
