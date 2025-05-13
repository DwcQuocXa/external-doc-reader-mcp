import dotenv from 'dotenv';

dotenv.config();

export const config = {
  googleApiKey: process.env.GOOGLE_API_KEY,
  firecrawlApiKey: process.env.FIRECRAWL_API_KEY,
};

if (!config.googleApiKey) {
  console.warn('Warning: GOOGLE_API_KEY is not set in the environment.');
}

if (!config.firecrawlApiKey) {
  console.warn('Warning: FIRECRAWL_API_KEY is not set in the environment.');
}
