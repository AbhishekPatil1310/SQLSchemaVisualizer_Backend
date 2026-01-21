import { Pool } from 'pg';
const metadataPool = new Pool({
    connectionString: process.env.METADATA_DB_URL,
    ssl: { rejectUnauthorized: false }
});
export const queryMetadata = (text, params) => metadataPool.query(text, params);
//# sourceMappingURL=database.js.map