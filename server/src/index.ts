import { createApp } from './app.js';
import { config } from './config/index.js';

const { app } = createApp();
const { port } = config.server;

app.listen(port, () => {
  console.log('--- AI Bot Server Started ---');
  console.log(`--- Rate limit: ${config.rateLimit.maxRequestsPerHour} requests per hour ---`);
  console.log(`--- Server running on port ${port} ---`);
  
  // Show correct provider and model
  const providerName = config.ai.provider;
  const modelName = providerName === 'ollama' 
    ? config.ai.ollama.model 
    : config.ai.xai.model;
  console.log(`--- AI Provider: ${providerName} (${modelName}) ---`);
  
  // Debug: Show environment variable (for troubleshooting)
  if (process.env.AI_PROVIDER) {
    console.log(`--- Config loaded: AI_PROVIDER=${process.env.AI_PROVIDER} ---`);
  }
});
