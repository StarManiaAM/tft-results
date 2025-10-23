// Global test setup and teardown
import { jest } from '@jest/globals';

// Mock console methods to reduce noise in tests
global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
};

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.DISCORD_TOKEN = 'test-discord-token';
process.env.RIOT_API_KEY = 'test-riot-api-key';
process.env.CHANNEL_ID = '123456789';
process.env.POLL_INTERVAL_MS = '60000';

beforeEach(() => {
    jest.clearAllMocks();
});

afterEach(() => {
    jest.restoreAllMocks();
});