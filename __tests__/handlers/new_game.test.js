import { jest } from '@jest/globals';

describe('New Game Handler', () => {
    let mockClient;
    let mockChannel;

    beforeEach(() => {
        mockChannel = {
            name: 'test-channel',
            send: jest.fn().mockResolvedValue({}),
        };

        mockClient = {
            channels: {
                cache: new Map([['123', mockChannel]]),
            },
        };

        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('should start handler successfully', async () => {
        jest.unstable_mockModule('../../utils/sql.js', () => ({
            get_all_users: jest.fn().mockResolvedValue([]),
        }));

        const { startRiotHandler } = await import('../../handlers/new_game.js');
        const cleanup = await startRiotHandler(mockClient, '123');

        expect(cleanup).toBeInstanceOf(Function);
        cleanup();
    });

    it('should throw error for invalid channel', async () => {
        const { startRiotHandler } = await import('../../handlers/new_game.js');

        await expect(
            startRiotHandler(mockClient, 'invalid-channel-id')
        ).rejects.toThrow('Invalid channel ID');
    });

    it('should process new match', async () => {
        const mockUser = {
            puuid: 'test-puuid',
            username: 'TestPlayer',
            tag: 'NA1',
            region: 'americas',
            plateform: 'na1',
            last_match: null,
        };

        const mockMatchInfo = {
            info: {
                queueId: 1100,
                participants: [
                    {
                        puuid: 'test-puuid',
                        placement: 1,
                        units: [],
                    },
                ],
            },
        };

        jest.unstable_mockModule('../../utils/sql.js', () => ({
            get_all_users: jest.fn().mockResolvedValue([mockUser]),
            get_user: jest.fn().mockResolvedValue(null),
            update_last_match: jest.fn().mockResolvedValue(true),
            update_rank_with_delta: jest.fn().mockResolvedValue({
                newRank: { solo: { tier: 'DIAMOND', division: 'II', lp: 100 } },
                deltas: { solo: 25 },
            }),
        }));

        jest.unstable_mockModule('../../utils/api.js', () => ({
            getLastMatch: jest.fn().mockResolvedValue('NA1_123456'),
            getMatchInfo: jest.fn().mockResolvedValue(mockMatchInfo),
            getRank: jest.fn().mockResolvedValue({
                solo: { tier: 'DIAMOND', division: 'II', lp: 100 },
                doubleup: null,
            }),
        }));

        jest.unstable_mockModule('../../utils/card_generator.js', () => ({
            generateMatchCard: jest.fn().mockResolvedValue(Buffer.from('test')),
        }));

        const { startRiotHandler } = await import('../../handlers/new_game.js');
        const cleanup = await startRiotHandler(mockClient, '123');

        // Wait for one iteration
        await jest.advanceTimersByTimeAsync(1000);

        expect(mockChannel.send).toHaveBeenCalled();
        cleanup();
    });
});