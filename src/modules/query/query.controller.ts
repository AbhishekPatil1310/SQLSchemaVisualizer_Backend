import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware.js';
import { executeQuery, getDatabaseSchema } from './query.service.js';
import { getActiveConnectionForUser } from '../workspace/workspace.service.js';

/**
 * Executes a raw SQL query provided by the user against their active Aiven DB.
 */
export const runUserQuery = async (req: AuthRequest, res: Response) => {
  try {
    const { sql, format = 'table' } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized: No User Session" });
    }

    // 1. Validate that SQL was actually sent
    if (!sql || sql.trim() === "") {
      return res.status(400).json({ error: "Bad Request", details: "SQL query cannot be empty" });
    }

    // 2. Get the actual encrypted URL from metadata DB
    const encryptedUrl = await getActiveConnectionForUser(userId);

    if (!encryptedUrl) {
      return res.status(400).json({ 
        error: "No Active Connection", 
        details: "Please select a database from the sidebar before running a query." 
      });
    }

    // 3. Execute against Aiven target database
    const results = await executeQuery(userId, encryptedUrl, sql, format);
    
    res.json(results);
  } catch (error: any) {
    console.error("Query Execution Error:", error);
    res.status(400).json({ 
      error: "Query Execution Failed", 
      details: error.message || "An unknown error occurred during execution" 
    });
  }
};

/**
 * Fetches database metadata (tables, columns, relationships) for the Visual Schema view.
 */
export const getSchema = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // 1. Get active connection
    const encryptedUrl = await getActiveConnectionForUser(userId);
    if (!encryptedUrl) {
      return res.status(404).json({ 
        error: "No active connection", 
        details: "Connect to a workspace to view its schema." 
      });
    }

    // 2. Call service to fetch information_schema data
    const schemaData = await getDatabaseSchema(userId, encryptedUrl);
    
    res.json(schemaData);
  } catch (error: any) {
    console.error("Schema Fetch Error:", error);
    res.status(500).json({ 
      error: "Failed to fetch schema visualizer data", 
      details: error.message 
    });
  }
};