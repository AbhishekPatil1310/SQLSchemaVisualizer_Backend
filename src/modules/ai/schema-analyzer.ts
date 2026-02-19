import NodeCache from 'node-cache';
import { getDatabaseSchema } from '../query/query.service.js';
import type { ColumnMetadata, DatabaseType, RelationshipMetadata, SchemaContext, TableMetadata } from './types/ai.types.js';

interface RawSchemaRow {
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: string | boolean;
}

interface RawConstraintRow {
  table_name: string;
  column_name: string;
  constraint_type: string;
  referenced_table_name?: string | null;
  referenced_column_name?: string | null;
}

interface RawSchemaPayload {
  schema: RawSchemaRow[];
  constraints: RawConstraintRow[];
}

interface SchemaCacheStats {
  cachedSchemas: number;
  hits: number;
  misses: number;
}

export class SchemaAnalyzer {
  private static instance: SchemaAnalyzer | null = null;

  private readonly cache: NodeCache;
  private hits = 0;
  private misses = 0;

  private constructor() {
    this.cache = new NodeCache({ stdTTL: 7200, checkperiod: 300, maxKeys: 500 });
  }

  static getInstance(): SchemaAnalyzer {
    if (!SchemaAnalyzer.instance) {
      SchemaAnalyzer.instance = new SchemaAnalyzer();
    }
    return SchemaAnalyzer.instance;
  }

  /**
   * Build and cache schema context for user/database combination.
   */
  async getSchemaContext(
    userId: string,
    encryptedUrl: string,
    databaseType: DatabaseType
  ): Promise<SchemaContext> {
    const cacheKey = `schema:${userId}:${databaseType}`;
    const cached = this.cache.get<SchemaContext>(cacheKey);

    if (cached) {
      this.hits += 1;
      return cached;
    }

    this.misses += 1;
    const rawSchema = (await getDatabaseSchema(userId, encryptedUrl)) as RawSchemaPayload;
    const parsed = this.parseSchema(rawSchema, databaseType);
    this.cache.set(cacheKey, parsed);
    return parsed;
  }

  /**
   * Convert raw information_schema shape into internal SchemaContext.
   */
  parseSchema(rawSchema: RawSchemaPayload, databaseType: DatabaseType): SchemaContext {
    const tableMap = new Map<string, TableMetadata>();
    const relationships: RelationshipMetadata[] = [];

    for (const row of rawSchema.schema ?? []) {
      const tableName = row.table_name;
      if (!tableMap.has(tableName)) {
        tableMap.set(tableName, {
          tableName,
          columns: [],
          indexes: []
        });
      }

      const table = tableMap.get(tableName);
      if (!table) continue;

      const column: ColumnMetadata = {
        columnName: row.column_name,
        dataType: row.data_type,
        isNullable: row.is_nullable === 'YES' || row.is_nullable === true,
        isUnique: false,
        isForeignKey: false
      };
      table.columns.push(column);
    }

    for (const constraint of rawSchema.constraints ?? []) {
      const table = tableMap.get(constraint.table_name);
      if (!table) continue;

      const column = table.columns.find((item) => item.columnName === constraint.column_name);
      if (!column) continue;

      if (constraint.constraint_type === 'PRIMARY KEY') {
        table.primaryKey = table.primaryKey ?? [];
        table.primaryKey.push(constraint.column_name);
        continue;
      }

      if (constraint.constraint_type === 'UNIQUE') {
        column.isUnique = true;
        table.indexes = table.indexes ?? [];
        table.indexes.push({
          indexName: `uniq_${constraint.table_name}_${constraint.column_name}`,
          columns: [constraint.column_name],
          isUnique: true
        });
        continue;
      }

      if (constraint.constraint_type === 'FOREIGN KEY') {
        column.isForeignKey = true;
        column.foreignKeyReference = constraint.referenced_table_name ?? undefined;
        if (constraint.referenced_table_name) {
          relationships.push({
            fromTable: constraint.table_name,
            toTable: constraint.referenced_table_name,
            fromColumn: constraint.column_name,
            toColumn: constraint.referenced_column_name ?? constraint.column_name,
            type: 'ONE_TO_MANY'
          });
        }
      }
    }

    return {
      tables: Array.from(tableMap.values()),
      relationships,
      databaseType,
      cachedAt: new Date()
    };
  }

  /**
   * Clear cached schema for a user.
   */
  invalidateUserCache(userId: string): void {
    const prefix = `schema:${userId}:`;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.del(key);
      }
    }
  }

  /**
   * Return schema cache monitoring metrics.
   */
  getCacheStats(): SchemaCacheStats {
    return {
      cachedSchemas: this.cache.keys().length,
      hits: this.hits,
      misses: this.misses
    };
  }
}

export const schemaAnalyzer = SchemaAnalyzer.getInstance();

