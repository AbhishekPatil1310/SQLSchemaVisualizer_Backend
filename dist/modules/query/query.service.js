import { poolManager } from '../../core/pool-manager.js';
import { decrypt } from '../../core/encryption.js';
const getDialectFromUrl = (encryptedUrl) => {
    try {
        const connectionString = decrypt(encryptedUrl).toLowerCase();
        if (connectionString.startsWith('mysql')) {
            return 'mysql';
        }
        return 'postgres';
    }
    catch (err) {
        console.error("Dialect detection failed, defaulting to postgres");
        return 'postgres';
    }
};
export const executeQuery = async (userId, encryptedUrl, sql, format = 'table') => {
    const pool = await poolManager.getPool(userId, encryptedUrl);
    const client = await pool.connect();
    try {
        const result = await client.query(sql);
        if (format === 'json') {
            return { type: 'json', rows: result.rows, rowCount: result.rowCount ?? 0 };
        }
        const hasFields = result.fields && result.fields.length > 0;
        return {
            type: 'table',
            columns: hasFields ? result.fields.map((f) => f.name) : ['Status'],
            rows: hasFields ? result.rows : [{ Status: 'Success', ...result.rows[0] }],
            rowCount: result.rowCount ?? 0
        };
    }
    catch (error) {
        throw error;
    }
    finally {
        client.release();
    }
};
export const getDatabaseSchema = async (userId, encryptedUrl) => {
    const pool = await poolManager.getPool(userId, encryptedUrl);
    const client = await pool.connect();
    const dialect = getDialectFromUrl(encryptedUrl);
    console.log(`[DEBUG] Detected Dialect: ${dialect} for user: ${userId}`);
    try {
        let schemaSql = '';
        let constraintSql = '';
        if (dialect === 'mysql') {
            schemaSql = `
        SELECT 
          TABLE_NAME as table_name, 
          COLUMN_NAME as column_name, 
          DATA_TYPE as data_type, 
          IS_NULLABLE as is_nullable
        FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE()
        ORDER BY TABLE_NAME, ORDINAL_POSITION;
      `;
            constraintSql = `
        SELECT 
          TABLE_NAME as table_name, 
          COLUMN_NAME as column_name, 
          IF(CONSTRAINT_NAME = 'PRIMARY', 'PRIMARY KEY', 'FOREIGN KEY') AS constraint_type,
          REFERENCED_TABLE_NAME as referenced_table_name
        FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE() 
        AND (REFERENCED_TABLE_NAME IS NOT NULL OR CONSTRAINT_NAME = 'PRIMARY');
      `;
        }
        else {
            schemaSql = `
        SELECT table_name, column_name, data_type, is_nullable
        FROM information_schema.columns 
        WHERE table_schema = 'public'
        ORDER BY table_name, ordinal_position;
      `;
            constraintSql = `
        SELECT 
          tc.table_name, kcu.column_name, tc.constraint_type,
          ccu.table_name AS referenced_table_name
        FROM information_schema.table_constraints AS tc 
        JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name
        LEFT JOIN information_schema.referential_constraints AS rc ON tc.constraint_name = rc.constraint_name
        LEFT JOIN (SELECT DISTINCT table_name, constraint_name FROM information_schema.constraint_column_usage) AS ccu
          ON rc.unique_constraint_name = ccu.constraint_name
        WHERE tc.table_schema = 'public';
      `;
        }
        const schemaRes = await client.query(schemaSql);
        const constraintRes = await client.query(constraintSql);
        return {
            schema: schemaRes.rows,
            constraints: constraintRes.rows
        };
    }
    catch (error) {
        console.error(`Detailed Schema Error (${dialect}):`, error.message);
        throw error;
    }
    finally {
        client.release();
    }
};
export const getVisualSchema = async (userId, encryptedUrl) => {
    return getDatabaseSchema(userId, encryptedUrl);
};
//# sourceMappingURL=query.service.js.map