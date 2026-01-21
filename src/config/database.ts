import { Pool } from 'pg';

// This is the connection to your app's internal metadata DB
const metadataPool = new Pool({
  connectionString: process.env.METADATA_DB_URL, 
  ssl: { rejectUnauthorized: false } // Required for Aiven/Managed DBs
});

export const queryMetadata = (text: string, params?: any[]) => 
  metadataPool.query(text, params);