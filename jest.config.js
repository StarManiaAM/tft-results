export default {
    testEnvironment: 'node',
    transform: {},
    moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1',
    },
    collectCoverageFrom: [
        'utils/**/*.js',
        'handlers/**/*.js',
        'commands/**/*.js',
        '!**/node_modules/**',
        '!**/database/**',
    ],
    coverageThreshold: {
        global: {
            branches: 70,
            functions: 75,
            lines: 80,
            statements: 80,
        },
    },
    setupFilesAfterEnv: ['<rootDir>/__tests__/setup.js'],
    testMatch: [
        '**/__tests__/**/*.test.js',
        '**/?(*.)+(spec|test).js',
    ],
    verbose: true,
    testTimeout: 10000,
};