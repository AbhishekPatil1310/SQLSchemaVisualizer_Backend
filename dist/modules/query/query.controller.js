import { executeQuery, getDatabaseSchema } from './query.service.js';
import { getActiveConnectionForUser } from '../workspace/workspace.service.js';
export const runUserQuery = async (req, res) => {
    try {
        const { sql, format = 'table' } = req.body;
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ error: "Unauthorized: No User Session" });
        }
        if (!sql || sql.trim() === "") {
            return res.status(400).json({ error: "Bad Request", details: "SQL query cannot be empty" });
        }
        const encryptedUrl = await getActiveConnectionForUser(userId);
        if (!encryptedUrl) {
            return res.status(400).json({
                error: "No Active Connection",
                details: "Please select a database from the sidebar before running a query."
            });
        }
        const results = await executeQuery(userId, encryptedUrl, sql, format);
        res.json(results);
    }
    catch (error) {
        console.error("Query Execution Error:", error);
        res.status(400).json({
            error: "Query Execution Failed",
            details: error.message || "An unknown error occurred during execution"
        });
    }
};
export const getSchema = async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        const encryptedUrl = await getActiveConnectionForUser(userId);
        if (!encryptedUrl) {
            return res.status(404).json({
                error: "No active connection",
                details: "Connect to a workspace to view its schema."
            });
        }
        const schemaData = await getDatabaseSchema(userId, encryptedUrl);
        res.json(schemaData);
    }
    catch (error) {
        console.error("Schema Fetch Error:", error);
        res.status(500).json({
            error: "Failed to fetch schema visualizer data",
            details: error.message
        });
    }
};
//# sourceMappingURL=query.controller.js.map