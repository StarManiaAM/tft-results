import { jest } from '@jest/globals';

// Mock Sequelize
const mockUser = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    destroy: jest.fn(),
    count: jest.fn(),
};

const mockSequelize = {
    authenticate: jest.fn(),
    sync: jest.fn(),
    close: jest.fn(),
    transaction: jest.fn(),
    define: jest.fn(() => mockUser),
};

const mockTransaction = {
    commit: jest.fn(),
    rollback: jest.fn(),
    LOCK: { UPDATE: 'UPDATE' },
};

jest.unstable_mockModule('sequelize', () => ({
    Sequelize: jest.fn(() => mockSequelize),
    DataTypes: {
        STRING: jest.fn(),
        INTEGER: jest.fn(),
    },
}));

describe('SQL Utils', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockSequelize.transaction.mockResolvedValue(mockTransaction);
    });

    describe('init_database', () => {
        it('should initialize database successfully', async () => {
            mockSequelize.authenticate.mockResolvedValue();
            mockSequelize.sync.mockResolvedValue();

            // Dynamic import after mocking
            const { init_database } = await import('../../utils/sql.js');
            const result = await init_database();

            expect(result).toBe(true);
            expect(mockSequelize.authenticate).toHaveBeenCalled();
            expect(mockSequelize.sync).toHaveBeenCalled();
        });

        it('should retry on connection failure', async () => {
            mockSequelize.authenticate
                .mockRejectedValueOnce(new Error('Connection failed'))
                .mockResolvedValueOnce();
            mockSequelize.sync.mockResolvedValue();

            const { init_database } = await import('../../utils/sql.js');
            const result = await init_database();

            expect(result).toBe(true);
            expect(mockSequelize.authenticate).toHaveBeenCalledTimes(2);
        });
    });

    describe('get_all_users', () => {
        it('should return all users', async () => {
            const mockUsers = [
                {
                    puuid: 'test-puuid-1',
                    username: 'Player1',
                    tag: 'NA1',
                    region: 'americas',
                },
            ];
            mockUser.findAll.mockResolvedValue(mockUsers);

            const { get_all_users } = await import('../../utils/sql.js');
            const result = await get_all_users();

            expect(result).toEqual(mockUsers);
            expect(mockUser.findAll).toHaveBeenCalled();
        });

        it('should handle database errors', async () => {
            mockUser.findAll.mockRejectedValue(new Error('DB Error'));

            const { get_all_users } = await import('../../utils/sql.js');
            await expect(get_all_users()).rejects.toThrow('DB Error');
        });
    });

    describe('get_user', () => {
        it('should return user by PUUID', async () => {
            const mockUserData = { puuid: 'test-puuid', username: 'TestPlayer' };
            mockUser.findOne.mockResolvedValue(mockUserData);

            const { get_user } = await import('../../utils/sql.js');
            const result = await get_user('test-puuid');

            expect(result).toEqual(mockUserData);
        });

        it('should return null for non-existent user', async () => {
            mockUser.findOne.mockResolvedValue(null);

            const { get_user } = await import('../../utils/sql.js');
            const result = await get_user('non-existent');

            expect(result).toBeNull();
        });

        it('should return null for empty PUUID', async () => {
            const { get_user } = await import('../../utils/sql.js');
            const result = await get_user('');

            expect(result).toBeNull();
            expect(mockUser.findOne).not.toHaveBeenCalled();
        });
    });

    describe('update_last_match', () => {
        it('should update last match successfully', async () => {
            mockUser.update.mockResolvedValue([1]);

            const { update_last_match } = await import('../../utils/sql.js');
            const result = await update_last_match('test-puuid', 'NA1_123');

            expect(result).toBe(true);
            expect(mockUser.update).toHaveBeenCalledWith(
                { last_match: 'NA1_123' },
                { where: { puuid: 'test-puuid' } }
            );
        });

        it('should return false when no user found', async () => {
            mockUser.update.mockResolvedValue([0]);

            const { update_last_match } = await import('../../utils/sql.js');
            const result = await update_last_match('non-existent', 'NA1_123');

            expect(result).toBe(false);
        });
    });

    describe('update_rank_with_delta', () => {
        it('should calculate LP delta correctly', async () => {
            const existingUser = {
                puuid: 'test-puuid',
                rank_tier: 'DIAMOND',
                rank_division: 'II',
                rank_lp: 75,
                doubleup_tier: null,
                doubleup_division: null,
                doubleup_lp: 0,
            };

            mockUser.findOne.mockResolvedValue(existingUser);
            mockUser.update.mockResolvedValue([1]);
            mockTransaction.commit.mockResolvedValue();

            const newRank = {
                solo: { tier: 'DIAMOND', division: 'I', lp: 25 },
                doubleup: null,
            };

            const { update_rank_with_delta } = await import('../../utils/sql.js');
            const result = await update_rank_with_delta('test-puuid', newRank);

            expect(result.deltas.solo).toBeGreaterThan(0);
            expect(mockTransaction.commit).toHaveBeenCalled();
        });

        it('should rollback on error', async () => {
            mockUser.findOne.mockRejectedValue(new Error('DB Error'));

            const { update_rank_with_delta } = await import('../../utils/sql.js');
            await expect(
                update_rank_with_delta('test-puuid', { solo: null })
            ).rejects.toThrow();

            expect(mockTransaction.rollback).toHaveBeenCalled();
        });
    });

    describe('register_user', () => {
        it('should register new user successfully', async () => {
            const newUser = {
                puuid: 'new-puuid',
                username: 'NewPlayer',
                tag: 'NA1',
            };
            mockUser.create.mockResolvedValue(newUser);

            const { register_user } = await import('../../utils/sql.js');
            const result = await register_user(
                'new-puuid',
                'americas',
                'na1',
                'NewPlayer',
                'NA1',
                null,
                { solo: null, doubleup: null }
            );

            expect(result).toEqual(newUser);
            expect(mockUser.create).toHaveBeenCalled();
        });

        it('should throw error for duplicate user', async () => {
            mockUser.create.mockRejectedValue({
                name: 'SequelizeUniqueConstraintError',
            });

            const { register_user } = await import('../../utils/sql.js');
            await expect(
                register_user('dup-puuid', 'americas', 'na1', 'Dup', 'NA1', null, {})
            ).rejects.toThrow('already registered');
        });

        it('should throw error for missing parameters', async () => {
            const { register_user } = await import('../../utils/sql.js');
            await expect(
                register_user('', 'americas', 'na1', '', 'NA1', null, {})
            ).rejects.toThrow('Missing required parameters');
        });
    });

    describe('user_exists', () => {
        it('should return true for existing user', async () => {
            mockUser.count.mockResolvedValue(1);

            const { user_exists } = await import('../../utils/sql.js');
            const result = await user_exists('existing-puuid');

            expect(result).toBe(true);
        });

        it('should return false for non-existent user', async () => {
            mockUser.count.mockResolvedValue(0);

            const { user_exists } = await import('../../utils/sql.js');
            const result = await user_exists('non-existent');

            expect(result).toBe(false);
        });
    });

    describe('delete_user', () => {
        it('should delete user successfully', async () => {
            mockUser.destroy.mockResolvedValue(1);

            const { delete_user } = await import('../../utils/sql.js');
            const result = await delete_user('test-puuid');

            expect(result).toBe(true);
        });

        it('should return false when user not found', async () => {
            mockUser.destroy.mockResolvedValue(0);

            const { delete_user } = await import('../../utils/sql.js');
            const result = await delete_user('non-existent');

            expect(result).toBe(false);
        });
    });
});