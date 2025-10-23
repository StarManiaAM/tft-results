import { jest } from '@jest/globals';


// !!! Mock modules BEFORE importing them

// Create mock function references
const mockAxiosGet = jest.fn();

// Mock axios - must be done before import
jest.unstable_mockModule('axios', () => ({
    default: {
        create: jest.fn(() => ({
            get: mockAxiosGet,
        })),
    },
}));

// Mock logger to prevent console output
jest.unstable_mockModule('../../utils/logger.js', () => ({
    default: {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    },
}));

// Mock config
jest.unstable_mockModule('../../utils/config.js', () => ({
    config: {
        riotApiKey: 'test-riot-api-key-12345',
        discordToken: 'test-discord-token',
        channelId: '123456789',
        pollIntervalMs: 60000,
    },
}));

const { getPUUID, getLastMatch, getMatchInfo, getRank } = await import('../../utils/api.js');

describe('Riot API Utils', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('getPUUID', () => {
        it('should return PUUID for valid player', async () => {
            // Arrange
            const mockResponse = {
                data: {
                    puuid: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                    gameName: 'SuperUserName',
                    tagLine: 'TAG',
                },
            };
            mockAxiosGet.mockResolvedValue(mockResponse);

            // Act
            const result = await getPUUID('americas', 'SuperUserName', 'TAG');

            // Assert
            expect(result).toBe('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
            expect(mockAxiosGet).toHaveBeenCalledTimes(1);
            expect(mockAxiosGet).toHaveBeenCalledWith(
                'https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/SuperUserName/TAG'
            );
        });
    });
});