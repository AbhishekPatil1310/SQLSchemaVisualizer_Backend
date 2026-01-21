import jwt from 'jsonwebtoken';
export const authenticate = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }
    try {
        const secret = process.env.JWT_SECRET;
        const decoded = jwt.verify(token, secret);
        req.user = decoded;
        next();
    }
    catch (error) {
        return res.status(403).json({ error: 'Forbidden: Invalid or expired token' });
    }
};
//# sourceMappingURL=auth.middleware.js.map