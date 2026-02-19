import NodeCache from 'node-cache';
import { getDatabaseSchema } from '../query/query.service.js';
export class SchemaAnalyzer {
    static instance = null;
    cache;
    hits = 0;
    misses = 0;
    constructor() {
        this.cache = new NodeCache({ stdTTL: 7200, checkperiod: 300, maxKeys: 500 });
    }
    static getInstance() {
        if (!SchemaAnalyzer.instance) {
            SchemaAnalyzer.instance = new SchemaAnalyzer();
        }
        return SchemaAnalyzer.instance;
    }
    async getSchemaContext(userId, encryptedUrl, databaseType) {
        const cacheKey = `schema:${userId}:${databaseType}`;
        const cached = this.cache.get(cacheKey);
        if (cached) {
            this.hits += 1;
            return cached;
        }
        this.misses += 1;
        const rawSchema = (await getDatabaseSchema(userId, encryptedUrl));
        const parsed = this.parseSchema(rawSchema, databaseType);
        this.cache.set(cacheKey, parsed);
        return parsed;
    }
    parseSchema(rawSchema, databaseType) {
        const tableMap = new Map();
        const relationships = [];
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
            if (!table)
                continue;
            const column = {
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
            if (!table)
                continue;
            const column = table.columns.find((item) => item.columnName === constraint.column_name);
            if (!column)
                continue;
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
    invalidateUserCache(userId) {
        const prefix = `schema:${userId}:`;
        for (const key of this.cache.keys()) {
            if (key.startsWith(prefix)) {
                this.cache.del(key);
            }
        }
    }
    getCacheStats() {
        return {
            cachedSchemas: this.cache.keys().length,
            hits: this.hits,
            misses: this.misses
        };
    }
}
export const schemaAnalyzer = SchemaAnalyzer.getInstance();
//# sourceMappingURL=schema-analyzer.js.map