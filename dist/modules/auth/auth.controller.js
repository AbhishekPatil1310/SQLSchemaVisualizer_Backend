import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { queryMetadata } from '../../config/database.js';
const AuthSchema = z.object({
    email: z.string().email("Invalid email format"),
    password: z.string().min(8, "Password must be at least 8 characters"),
});
export const login = async (req, res) => {
    try {
        const { email, password } = AuthSchema.parse(req.body);
        const secret = process.env.JWT_SECRET;
        if (!secret) {
            return res.status(500).json({ error: "Internal Server Error: Secret missing" });
        }
        const userRes = await queryMetadata('SELECT id, email, password FROM users WHERE email = $1', [email]);
        const user = userRes.rows[0];
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ error: "Invalid email or password" });
        }
        const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '24h' });
        res.json({
            token,
            user: { id: user.id, email: user.email },
            message: "Login successful"
        });
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.issues[0].message });
        }
        console.error("Login Error:", error);
        res.status(500).json({ error: "Authentication failed" });
    }
};
export const register = async (req, res) => {
    try {
        const { email, password } = AuthSchema.parse(req.body);
        const existingUser = await queryMetadata('SELECT id FROM users WHERE email = $1', [email]);
        if (existingUser.rowCount > 0) {
            return res.status(400).json({ error: "User already exists" });
        }
        const hashedPassword = await bcrypt.hash(password, 12);
        const result = await queryMetadata('INSERT INTO users (email, password) VALUES ($1, $2) RETURNING id, email', [email, hashedPassword]);
        res.status(201).json({
            message: "User registered successfully",
            user: result.rows[0]
        });
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.issues[0].message });
        }
        console.error("Registration Error:", error);
        res.status(500).json({ error: "Registration failed" });
    }
};
//# sourceMappingURL=auth.controller.js.map