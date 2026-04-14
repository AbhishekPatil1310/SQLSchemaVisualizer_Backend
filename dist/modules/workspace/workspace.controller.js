import { queryMetadata } from '../../config/database.js';
import { encrypt } from '../../core/encryption.js';
import { poolManager } from '../../core/pool-manager.js';
export const addConnection = async (req, res) => {
    try {
        const { label, url } = req.body;
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ error: "Unauthorized: User ID missing" });
        }
        const countRes = await queryMetadata('SELECT COUNT(*)::int FROM user_connections WHERE user_id = $1', [userId]);
        const count = countRes.rows[0].count;
        if (count >= 5) {
            return res.status(400).json({ error: "Maximum limit of 5 databases reached." });
        }
        const encryptedUrl = encrypt(url);
        const isActive = count === 0;
        await queryMetadata(`INSERT INTO user_connections (user_id, label, encrypted_url, is_active) 
       VALUES ($1, $2, $3, $4)`, [userId, label, encryptedUrl, isActive]);
        res.status(201).json({ message: "Database connection saved successfully." });
    }
    catch (error) {
        console.error("Add Connection Error:", error);
        res.status(500).json({ error: "Failed to save connection", details: error.message });
    }
};
export const listConnections = async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        const result = await queryMetadata('SELECT id, label, is_active FROM user_connections WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
        res.json(result.rows || []);
    }
    catch (error) {
        console.error("List Connections Error:", error);
        res.status(500).json({ error: "Failed to fetch connections", details: error.message });
    }
};
export const switchConnection = async (req, res) => {
    try {
        const { connectionId } = req.body;
        const userId = req.user?.userId;
        if (!userId || !connectionId) {
            return res.status(400).json({ error: "User ID or Connection ID missing" });
        }
        await poolManager.closePool(userId);
        await queryMetadata('UPDATE user_connections SET is_active = false WHERE user_id = $1', [userId]);
        const updateRes = await queryMetadata('UPDATE user_connections SET is_active = true WHERE id = $1 AND user_id = $2 RETURNING id', [connectionId, userId]);
        if ((updateRes.rowCount ?? 0) === 0) {
            return res.status(404).json({ error: "Connection not found or access denied" });
        }
        res.json({ message: "Workspace switched successfully." });
    }
    catch (error) {
        console.error("Switch Connection Error:", error);
        res.status(500).json({ error: "Failed to switch workspace", details: error.message });
    }
};
export const deleteConnection = async (req, res) => {
    try {
        const { connectionId } = req.params;
        const userId = req.user?.userId;
        if (!userId || !connectionId) {
            return res.status(400).json({ error: "User ID or Connection ID missing" });
        }
        const checkRes = await queryMetadata('SELECT is_active FROM user_connections WHERE id = $1 AND user_id = $2', [connectionId, userId]);
        if ((checkRes.rowCount ?? 0) === 0) {
            return res.status(404).json({ error: "Connection not found or access denied" });
        }
        const wasActive = checkRes.rows[0].is_active;
        await queryMetadata('DELETE FROM user_connections WHERE id = $1 AND user_id = $2', [connectionId, userId]);
        if (wasActive) {
            await poolManager.closePool(userId);
            const remainingRes = await queryMetadata('SELECT id FROM user_connections WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1', [userId]);
            if ((remainingRes.rowCount ?? 0) > 0) {
                await queryMetadata('UPDATE user_connections SET is_active = true WHERE id = $1', [remainingRes.rows[0].id]);
            }
        }
        res.json({ message: "Connection deleted successfully." });
    }
    catch (error) {
        console.error("Delete Connection Error:", error);
        res.status(500).json({ error: "Failed to delete connection", details: error.message });
    }
};
//# sourceMappingURL=workspace.controller.js.map