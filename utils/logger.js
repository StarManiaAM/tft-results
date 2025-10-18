import {createLogger, format, transports} from "winston";
import path from "node:path";
import fs from "node:fs";

const {combine, timestamp, printf, colorize, errors, json} = format;

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, {recursive: true});
}

// Custom format for console (human-readable)
const consoleFormat = printf(({level, message, timestamp, stack, ...metadata}) => {
    let msg = `${timestamp} ${level}: ${stack || message}`;

    // Add metadata if present (excluding empty objects)
    const metaKeys = Object.keys(metadata);
    if (metaKeys.length > 0 && !(metaKeys.length === 1 && metaKeys[0] === 'level')) {
        msg += ` ${JSON.stringify(metadata)}`;
    }

    return msg;
});

// Sanitize sensitive data from logs
const sanitize = format((info) => {
    const sensitiveKeys = ['token', 'api_key', 'apikey', 'password', 'secret', 'authorization'];

    function sanitizeObject(obj) {
        if (!obj || typeof obj !== 'object') return obj;

        for (const key of Object.keys(obj)) {
            const lowerKey = key.toLowerCase();

            // Check if key contains sensitive information
            if (sensitiveKeys.some(sensitive => lowerKey.includes(sensitive))) {
                obj[key] = '***REDACTED***';
            } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                sanitizeObject(obj[key]);
            } else if (typeof obj[key] === 'string') {
                // Sanitize URLs with API keys
                obj[key] = obj[key].replace(/([?&]api_key=)[^&]+/gi, '$1***');
                obj[key] = obj[key].replace(/([?&]token=)[^&]+/gi, '$1***');
                obj[key] = obj[key].replace(/(X-Riot-Token[:\s]+)[^\s&]+/gi, '$1***');
                obj[key] = obj[key].replace(/(RGAPI-)[^\s&]+/gi, '$1***');
            }
        }
        return obj;
    }

    return sanitizeObject(info);
});

// Create logger instance
const logger = createLogger({
    level: process.env.LOG_LEVEL || "info",
    format: combine(
        errors({stack: true}),
        timestamp({format: 'YYYY-MM-DD HH:mm:ss'}),
        sanitize()
    ),
    transports: [
        // Console output (colorized for development)
        new transports.Console({
            format: combine(
                colorize(),
                consoleFormat
            )
        }),

        // All logs file (JSON format for parsing)
        new transports.File({
            filename: path.join(logsDir, 'bot.log'),
            format: json(),
            maxsize: 5242880, // 5MB
            maxFiles: 5,
            tailable: true
        }),

        // Error logs file (JSON format)
        new transports.File({
            filename: path.join(logsDir, 'error.log'),
            level: 'error',
            format: json(),
            maxsize: 5242880, // 5MB
            maxFiles: 5,
            tailable: true
        }),

        // Combined logs file (human-readable)
        new transports.File({
            filename: path.join(logsDir, 'combined.log'),
            format: combine(
                timestamp({format: 'YYYY-MM-DD HH:mm:ss'}),
                consoleFormat
            ),
            maxsize: 10485760, // 10MB
            maxFiles: 3,
            tailable: true
        })
    ],
    exitOnError: false,
});

// Add custom log level for fatal errors
logger.fatal = (message, meta) => {
    logger.error(`[FATAL] ${message}`, meta);
};

// Log unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Promise Rejection', {
        reason: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined,
        promise: promise.toString()
    });
});

// Log uncaught exceptions
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception - Application will terminate', {
        error: error.message,
        stack: error.stack,
        code: error.code
    });

    // Give logger time to write before exiting
    setTimeout(() => {
        process.exit(1);
    }, 1000);
});

// Helper to log startup info
logger.logStartup = () => {
    logger.info('='.repeat(60));
    logger.info('Application Starting', {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        env: process.env.NODE_ENV || 'development',
        pid: process.pid,
        cwd: process.cwd()
    });
    logger.info('='.repeat(60));
};

// Helper to log shutdown
logger.logShutdown = () => {
    logger.info('='.repeat(60));
    logger.info('Application Shutting Down', {
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage()
    });
    logger.info('='.repeat(60));
};

// Helper for performance logging
logger.logPerformance = (operation, duration, metadata = {}) => {
    const level = duration > 5000 ? 'warn' : duration > 2000 ? 'info' : 'debug';
    logger[level](`Performance: ${operation}`, {
        duration: `${duration}ms`,
        ...metadata
    });
};

export default logger;