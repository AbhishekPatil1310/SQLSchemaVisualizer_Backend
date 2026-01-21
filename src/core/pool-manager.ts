import pg, { type Pool } from 'pg';
const { Pool: PoolClass } = pg;
import mysql from 'mysql2/promise';
import { decrypt } from './encryption.js';

class ConnectionManager {
  private pools: Map<string, any> = new Map();

  async getPool(userId: string, encryptedUrl: string): Promise<any> {
    const poolKey = userId;
    if (this.pools.has(poolKey)) {
      return this.pools.get(poolKey);
    }

    const connectionString = decrypt(encryptedUrl);
    if (!connectionString || typeof connectionString !== 'string') {
        throw new Error(`Failed to decrypt connection string for user ${userId}. Result is not a string.`);
    }

    const isMysql = connectionString.toLowerCase().startsWith('mysql');

    if (isMysql) {
      const mysqlPool = mysql.createPool(connectionString);
      
      const adapter = {
        connect: async () => {
          const connection = await mysqlPool.getConnection();
          return {
            query: async (sql: string) => {
              const [result, fields] = await connection.query(sql);
              // Handle MySQL DDL (CREATE/INSERT) vs DQL (SELECT)
              const rows = Array.isArray(result) ? result : [result];
              const rowCount = Array.isArray(result) ? result.length : (result as any).affectedRows || 0;
              
              return { 
                rows, 
                fields: fields?.map((f: any) => ({ name: f.name })) || [],
                rowCount
              };
            },
            release: () => connection.release()
          };
        },
        query: async (sql: string) => {
          const [result, fields] = await mysqlPool.query(sql);
          const rows = Array.isArray(result) ? result : [result];
          const rowCount = Array.isArray(result) ? result.length : (result as any).affectedRows || 0;

          return { 
            rows, 
            fields: fields?.map((f: any) => ({ name: f.name })) || [],
            rowCount
          };
        },
        end: () => mysqlPool.end()
      };

      this.pools.set(poolKey, adapter);
      return adapter;

    } else {
      const pgPool = new PoolClass({
        connectionString,
        ssl: { rejectUnauthorized: false },
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      });

      pgPool.on('error', (err) => {
        console.error(`PG Pool Error for user ${userId}:`, err.message);
        this.closePool(userId);
      });

      this.pools.set(poolKey, pgPool);
      return pgPool;
    }
  }

  async closePool(userId: string) {
    const pool = this.pools.get(userId);
    if (pool) {
      try {
        await pool.end();
      } catch (err) {
        console.error(`Error closing pool for user ${userId}:`, err);
      } finally {
        this.pools.delete(userId);
      }
    }
  }
}

export const poolManager = new ConnectionManager();