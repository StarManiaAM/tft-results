import { jest } from '@jest/globals';

jest.unstable_mockModule('canvas', () => ({
    createCanvas: jest.fn((w, h) => ({
        width: w,
        height: h,
        getContext: () => ({
            fillStyle: '',
            font: '',
            textAlign: '',
            fillRect: jest.fn(),
            fillText: jest.fn(),
            drawImage: jest.fn(),
        }),
        toBuffer: jest.fn(() => Buffer.from('test-image')),
    })),
    loadImage: jest.fn().mockResolvedValue({ width: 60, height: 60 }),
}));

describe('Card Generator', () => {
    describe('generateMatchCard', () => {
        it('should generate solo match card', async () => {
            const { generateMatchCard } = await import('../../utils/card_generator.js');

            const user = { username: 'TestPlayer' };
            const data = {
                placement: 1,
                units: [
                    {
                        character_id: 'TFT15_Ahri',
                        tier: 3,
                        itemNames: ['TFT_Item_GuinsoosRageblade'],
                    },
                ],
            };
            const rank = { tier: 'DIAMOND', division: 'II', lp: 75 };

            const buffer = await generateMatchCard(
                user,
                data,
                rank,
                ' (+25 LP)',
                1,
                null,
                'solo'
            );

            expect(buffer).toBeInstanceOf(Buffer);
        });

        it('should generate double-up match card', async () => {
            const { generateMatchCard } = await import('../../utils/card_generator.js');

            const user = { username: 'Player1' };
            const data = { placement: 2, units: [] };
            const rank = { tier: 'PLATINUM', division: 'I', lp: 50 };
            const teammate = {
                username: 'Player2',
                data: { units: [] },
                rank: { tier: 'GOLD', division: 'III', lp: 30 },
                lpChange: ' (+15 LP)',
            };

            const buffer = await generateMatchCard(
                user,
                data,
                rank,
                ' (+20 LP)',
                1,
                teammate,
                'doubleup'
            );

            expect(buffer).toBeInstanceOf(Buffer);
        });

        it('should throw error for invalid parameters', async () => {
            const { generateMatchCard } = await import('../../utils/card_generator.js');

            await expect(
                generateMatchCard(null, null, null, '', 1, null, 'solo')
            ).rejects.toThrow('Invalid parameters');
        });

        it('should handle empty units array', async () => {
            const { generateMatchCard } = await import('../../utils/card_generator.js');

            const user = { username: 'TestPlayer' };
            const data = { placement: 5, units: [] };
            const rank = { tier: 'SILVER', division: 'IV', lp: 10 };

            const buffer = await generateMatchCard(
                user,
                data,
                rank,
                ' (-5 LP)',
                5,
                null,
                'solo'
            );

            expect(buffer).toBeInstanceOf(Buffer);
        });
    });

    describe('Image Cache', () => {
        it('should clear cache successfully', async () => {
            const { clearImageCache, getImageCacheStats } = await import(
                '../../utils/card_generator.js'
                );

            clearImageCache();
            const stats = getImageCacheStats();

            expect(stats.size).toBe(0);
        });
    });
});