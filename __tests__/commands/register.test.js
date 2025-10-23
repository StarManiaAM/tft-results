import { jest } from '@jest/globals';

describe('Register Command', () => {
    let mockInteraction;
    let registerCommand;

    beforeEach(async () => {
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
            reply: jest.fn(),
        };

        // Mock all dependencies
        jest.unstable_mockModule('../../utils/sql.js', () => ({
            register_user: jest.fn(),
            user_exists: jest.fn(),
        }));

        jest.unstable_mockModule('../../utils/api.js', () => ({
            getPUUID: jest.fn(),
            getLastMatch: jest.fn(),
            getRank: jest.fn(),
        }));

        const module = await import('../../commands/utility/register.js');
        registerCommand = module.default;
    });

    it('should have correct command structure', () => {
        expect(registerCommand.data.name).toBe('register');
        expect(registerCommand.data.description).toBeTruthy();
        expect(registerCommand.execute).toBeInstanceOf(Function);
    });

    it('should register user successfully', async () => {
        const { getPUUID, getLastMatch, getRank } = await import('../../utils/api.js');
        const { user_exists, register_user } = await import('../../utils/sql.js');

        mockInteraction.options.getString
            .mockReturnValueOnce('TestPlayer')
            .mockReturnValueOnce('NA1')
            .mockReturnValueOnce('na1');

        getPUUID.mockResolvedValue('test-puuid');
        user_exists.mockResolvedValue(false);
        getLastMatch.mockResolvedValue('NA1_123');
        getRank.mockResolvedValue({
            solo: { tier: 'DIAMOND', division: 'II', lp: 75 },
            doubleup: null,
        });
        register_user.mockResolvedValue({});

        await registerCommand.execute(mockInteraction);

        expect(mockInteraction.deferReply).toHaveBeenCalled();
        expect(mockInteraction.editReply).toHaveBeenCalledWith(
            expect.stringContaining('Successfully registered')
        );
    });

    it('should reject empty username', async () => {
        mockInteraction.options.getString
            .mockReturnValueOnce('')
            .mockReturnValueOnce('NA1')
            .mockReturnValueOnce('na1');

        await registerCommand.execute(mockInteraction);

        expect(mockInteraction.editReply).toHaveBeenCalledWith(
            expect.stringContaining('cannot be empty')
        );
    });

    it('should handle player not found', async () => {
        const { getPUUID } = await import('../../utils/api.js');

        mockInteraction.options.getString
            .mockReturnValueOnce('NonExistent')
            .mockReturnValueOnce('NA1')
            .mockReturnValueOnce('na1');

        getPUUID.mockResolvedValue(null);

        await registerCommand.execute(mockInteraction);

        expect(mockInteraction.editReply).toHaveBeenCalledWith(
            expect.stringContaining('Could not find player')
        );
    });

    it('should handle already registered user', async () => {
        const { getPUUID } = await import('../../utils/api.js');
        const { user_exists } = await import('../../utils/sql.js');

        mockInteraction.options.getString
            .mockReturnValueOnce('ExistingPlayer')
            .mockReturnValueOnce('NA1')
            .mockReturnValueOnce('na1');

        getPUUID.mockResolvedValue('existing-puuid');
        user_exists.mockResolvedValue(true);

        await registerCommand.execute(mockInteraction);

        expect(mockInteraction.editReply).toHaveBeenCalledWith(
            expect.stringContaining('already being tracked')
        );
    });

    it('should strip # from tag', async () => {
        const { getPUUID } = await import('../../utils/api.js');

        mockInteraction.options.getString
            .mockReturnValueOnce('Player')
            .mockReturnValueOnce('#NA1')
            .mockReturnValueOnce('na1');

        getPUUID.mockResolvedValue('test-puuid');

        await registerCommand.execute(mockInteraction);

        expect(getPUUID).toHaveBeenCalledWith('americas', 'Player', 'NA1');
    });
});