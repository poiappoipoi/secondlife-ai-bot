/**
 * Server entry point - initializes and starts the Express application
 */
import { createApp } from './app';
import { config } from './config/index';

const { app } = createApp();
const { port } = config.server;

app.listen(port, () => {
  console.log('--- AI Bot Server Started ---');
  console.log(`--- Rate limit: ${config.rateLimit.maxRequestsPerHour} requests per hour ---`);
  console.log(`--- Server running on port ${port} ---`);
  
  const providerName = config.ai.provider;
  const modelName = providerName === 'ollama' 
    ? config.ai.ollama.model 
    : config.ai.xai.model;
  console.log(`--- AI Provider: ${providerName} (${modelName}) ---`);
  
  if (process.env.AI_PROVIDER) {
    console.log(`--- Config loaded: AI_PROVIDER=${process.env.AI_PROVIDER} ---`);
  }
});
