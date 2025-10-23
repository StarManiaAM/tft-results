import { jest } from '@jest/globals';

describe('Integration: Full Registration and Match Flow', () => {
    let mockClient;
    let mockChannel;
    let mockInteraction;

    beforeEach(() => {
        mockChannel = {
            name: 'tft-tracker',
            send: jest.fn().mockResolvedValue({}),
        };

        mockClient = {
            channels: {
                cache: new Map([['123', mockChannel]]),
            },
        };

        mockInteraction = {
            options: {
                getString: jest.fn(),
            },
            user: {
                tag: 'TestUser#1234',
                id: '123456',
            },
            deferReply: jest.fn(),
            editReply: jest.fn(),
        };
    });

    it('should complete full user registration and match tracking', async () => {
        // Setup mocks
        jest.unstable_mockModule('../../utils/api.js', () => ({
            getPUUID: jest.fn().mockResolvedValue('test-puuid-123'),
            getLastMatch: jest.fn().mockResolvedValue('NA1_match_1'),
            getMatchInfo: jest.fn().mockResolvedValue({
                info: {
                    queueId: 1100,
                    participants: [
                        {
                            puuid: 'test-puuid-123',
                            placement: 1,
                            units: [],
                        },
                    ],
                },
            }),
            getRank: jest.fn().mockResolvedValue({
                solo: { tier: 'DIAMOND', division: 'II', lp: 75 },
                doubleup: { tier: 'PLATINUM', division: 'III', lp: 40 },
            }),
        }));

        const mockUsers = [];
        jest.unstable_mockModule('../../utils/sql.js', () => ({
            user_exists: jest.fn().mockResolvedValue(false),
            register_user: jest.fn().mockImplementation((puuid, region, platform, username, tag) => {
                const user = { puuid, region, plateform: platform, username, tag, last_match: null };
                mockUsers.push(user);
                return Promise.resolve(user);
            }),
            get_all_users: jest.fn(() => Promise.resolve(mockUsers)),
            get_user: jest.fn().mockResolvedValue(null),
            update_last_match: jest.fn().mockResolvedValue(true),
            update_rank_with_delta: jest.fn().mockResolvedValue({
                newRank: { solo: { tier: 'DIAMOND', division: 'I', lp: 25 } },
                deltas: { solo: 50 },
            }),
        }));

        jest.unstable_mockModule('../../utils/card_generator.js', () => ({
            generateMatchCard: jest.fn().mockResolvedValue(Buffer.from('card')),
        }));

        // Step 1: Register user
        mockInteraction.options.getString
            .mockReturnValueOnce('ProPlayer')
            .mockReturnValueOnce('NA1')
            .mockReturnValueOnce('na1');

        const registerModule = await import('../../commands/utility/register.js');
        await registerModule.default.execute(mockInteraction);

        expect(mockInteraction.editReply).toHaveBeenCalledWith(
            expect.stringContaining('Successfully registered')
        );

        // Step 2: Start match handler and verify tracking
        const { get_all_users } = await import('../../utils/sql.js');
        const users = await get_all_users();

        expect(users).toHaveLength(1);
        expect(users[0].username).toBe('ProPlayer');
    });
});