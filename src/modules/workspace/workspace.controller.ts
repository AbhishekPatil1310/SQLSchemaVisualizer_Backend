import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware.js';
import { queryMetadata } from '../../config/database.js';
import { encrypt } from '../../core/encryption.js';
import { poolManager } from '../../core/pool-manager.js';

export const addConnection = async (req: AuthRequest, res: Response) => {
  try {
    const { label, url } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized: User ID missing" });
    }

    // 1. Check current connection count
    const countRes = await queryMetadata(
      'SELECT COUNT(*)::int FROM user_connections WHERE user_id = $1',
      [userId]
    );
    
    const count = countRes.rows[0].count;
    if (count >= 5) {
      return res.status(400).json({ error: "Maximum limit of 5 databases reached." });
    }

    // 2. Encrypt the Aiven URL
    const encryptedUrl = encrypt(url);

    // 3. Determine if this should be the active connection
    // If it's the first one (count is 0), set it to active
    const isActive = count === 0;
    
    await queryMetadata(
      `INSERT INTO user_connections (user_id, label, encrypted_url, is_active) 
       VALUES ($1, $2, $3, $4)`,
      [userId, label, encryptedUrl, isActive]
    );

    res.status(201).json({ message: "Database connection saved successfully." });
  } catch (error: any) {
    console.error("Add Connection Error:", error);
    res.status(500).json({ error: "Failed to save connection", details: error.message });
  }
};

export const listConnections = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const result = await queryMetadata(
      'SELECT id, label, is_active FROM user_connections WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );

    // Return an empty array instead of null if no rows exist
    res.json(result.rows || []);
  } catch (error: any) {
    console.error("List Connections Error:", error);
    res.status(500).json({ error: "Failed to fetch connections", details: error.message });
  }
};

export const switchConnection = async (req: AuthRequest, res: Response) => {
  try {
    const { connectionId } = req.body;
    const userId = req.user?.userId;

    if (!userId || !connectionId) {
      return res.status(400).json({ error: "User ID or Connection ID missing" });
    }

    // 1. Clear the specific pool from memory for this user
    // This ensures the next query uses the NEW connection string
    await poolManager.closePool(userId);

    // 2. Database Transaction logic: Set all inactive, then one active
    // We do this in two steps to ensure consistency
    await queryMetadata(
      'UPDATE user_connections SET is_active = false WHERE user_id = $1',
      [userId]
    );

    const updateRes = await queryMetadata(
      'UPDATE user_connections SET is_active = true WHERE id = $1 AND user_id = $2 RETURNING id',
      [connectionId, userId]
    );

    if (updateRes.rowCount === 0) {
      return res.status(404).json({ error: "Connection not found or access denied" });
    }

    res.json({ message: "Workspace switched successfully." });
  } catch (error: any) {
    console.error("Switch Connection Error:", error);
    res.status(500).json({ error: "Failed to switch workspace", details: error.message });
  }
};