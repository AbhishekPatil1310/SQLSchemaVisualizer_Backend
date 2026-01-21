export const errorMiddleware = (err, req, res, next) => {
    console.error(`[Error] ${req.method} ${req.path}:`, err.message);
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
        success: false,
        message: err.message || 'An unexpected error occurred',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
};
//# sourceMappingURL=error.middleware.js.map