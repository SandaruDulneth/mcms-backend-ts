import 'dotenv/config';

const parsePort = (value: string | undefined): number => {
  const port = Number(value ?? 5000);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }

  return port;
};

export const env = Object.freeze({
  nodeEnv      : process.env.NODE_ENV       ?? 'development',
  port         : parsePort(process.env.PORT),
  mongodbUri   : process.env.MONGODB_URI    ?? 'mongodb://127.0.0.1:27017/mcms',
  clientOrigin : process.env.CLIENT_ORIGIN  ?? 'http://localhost:3000',
  aiServiceUrl : process.env.AI_SERVICE_URL ?? 'http://127.0.0.1:8000',
  newsApiKey   : process.env.NEWS_API_KEY   ?? '',   // ← NewsAPI key for credibility scoring
});