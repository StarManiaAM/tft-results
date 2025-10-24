import {SlashCommandBuilder} from 'discord.js';
import {register_user, user_exists} from '../../utils/sql.js'
import {getLastMatch, getPUUID, getRank, RiotApiError} from "../../utils/api.js";
import logger from "../../utils/logger.js";

function getRegionFromPlatform(platform) {
    const platformToRegionMap = {
        // AMERICAS
        'br1': 'americas',
        'la1': 'americas',
        'la2': 'americas',
        'na1': 'americas',
        'oc1': 'americas', // OC1 routes to AMERICAS

        // ASIA
        'jp1': 'asia',
        'kr': 'asia',

        // EUROPE
        'eun1': 'europe',
        'euw1': 'europe',
        'tr1': 'europe',
        'ru': 'europe',

        // SEA
        'ph2': 'sea',
        'sg2': 'sea',
        'th2': 'sea',
        'tw2': 'sea',
        'vn2': 'sea'
    };

    // Return the corresponding region, or undefined if no match
    return platformToRegionMap[platform];
}

export default {
    data: new SlashCommandBuilder()
        .setName('register')
        .setDescription('Register a new user to be tracked')
        .addStringOption(option =>
            option.setName('username')
                .setDescription('Your in-game username')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('tag')
                .setDescription('Your in-game tag (e.g. #EUW or EUW)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('platform')
                .setDescription('Select your server')
                .setRequired(true)
                .addChoices(
                    // Americas
                    {name: 'NA1 (North America)', value: 'na1'},
                    {name: 'BR1 (Brazil)', value: 'br1'},
                    {name: 'LA1 (LATAM North)', value: 'la1'},
                    {name: 'LA2 (LATAM South)', value: 'la2'},
                    {name: 'OC1 (Oceania)', value: 'oc1'},
                    // Europe
                    {name: 'EUW1 (EU West)', value: 'euw1'},
                    {name: 'EUN1 (EU Nordic & East)', value: 'eun1'},
                    {name: 'TR1 (Turkey)', value: 'tr1'},
                    {name: 'RU (Russia)', value: 'ru'},
                    // Asia
                    {name: 'KR (Korea)', value: 'kr'},
                    {name: 'JP1 (Japan)', value: 'jp1'},
                    // SEA (Southeast Asia)
                    {name: 'PH2 (Philippines)', value: 'ph2'},
                    {name: 'SG2 (Singapore)', value: 'sg2'},
                    {name: 'TH2 (Thailand)', value: 'th2'},
                    {name: 'TW2 (Taiwan)', value: 'tw2'},
                    {name: 'VN2 (Vietnam)', value: 'vn2'}
                )),

    async execute(interaction) {
        await interaction.deferReply();

        const username = interaction.options.getString('username')?.trim();
        let tag = interaction.options.getString('tag')?.trim();
        const platform = interaction.options.getString('platform');

        // Validate inputs
        if (!username || username.length === 0) {
            await interaction.editReply("> ❌ Username cannot be empty.");
            return;
        }

        if (!tag || tag.length === 0) {
            await interaction.editReply("> ❌ Tag cannot be empty.");
            return;
        }

        if (tag.startsWith('#'))
            tag = tag.slice(1);

        const region = getRegionFromPlatform(platform);

        if (!region) {
            logger.error("Invalid platform provided", {platform});
            await interaction.editReply("> ❌ Invalid platform selected.");
            return;
        }

        logger.info(`Registration attempt for ${username}#${tag}`, {
            platform,
            region,
            requestedBy: interaction.user.tag,
            userId: interaction.user.id
        });

        try {
            let puuid;
            try {
                puuid = await getPUUID(region, username, tag);
            } catch (err) {
                if (err instanceof RiotApiError) {
                    if (err.isNotFound()) {
                        logger.info(`Player not found: ${username}#${tag}`, {
                            region,
                            platform,
                            statusCode: err.statusCode
                        });

                        await interaction.editReply(
                            `>>> ❌ Could not find player **${username}#${tag}** in region **${region}**.\n` +
                            `Please verify:\n` +
                            `• Username and tag are correct\n` +
                            `• Platform matches your account region`
                        );
                        return;
                    }

                    if (err.isUnauthorized()) {
                        logger.fatal(`API key is invalid or expired during registration`, {
                            statusCode: err.statusCode,
                            url: err.url
                        });

                        await interaction.editReply(
                            `> 🚨 **CRITICAL ERROR**: Riot API key is invalid or expired. Please update the API key and restart the bot.`
                        );
                        return;
                    }

                    if (err.isRateLimited()) {
                        logger.warn(`Rate limited during registration for ${username}#${tag}`, {
                            statusCode: err.statusCode
                        });

                        await interaction.editReply(
                            `>>> ⏱️ **Rate Limit Exceeded**\n` +
                            `Too many requests to the Riot API. Please try again in a few minutes.`
                        );
                        return;
                    }

                    if (err.isServerError()) {
                        logger.error(`Riot API server error during registration`, {
                            error: err.message,
                            statusCode: err.statusCode,
                            url: err.url
                        });

                        await interaction.editReply(
                            `>>> ⚠️ **Riot API Error**\n` +
                            `The Riot API is experiencing issues. Please try again later.`
                        );
                        return;
                    }
                }

                // Re-throw unknown errors
                throw err;
            }

            if (await user_exists(puuid)) {
                logger.info(`Registration rejected - user already exists: ${username}#${tag}`, {
                    puuid: puuid.substring(0, 8) + '...'
                });

                await interaction.editReply(
                    `> ℹ️ **${username}#${tag}** is already being tracked!`
                );
                return;
            }

            let lastMatch = null;
            try {
                lastMatch = await getLastMatch(puuid, region);

                if (!lastMatch) {
                    logger.warn(`No match history found for ${username}#${tag}`, {
                        puuid: puuid.substring(0, 8) + '...'
                    });
                }
            } catch (err) {
                if (err instanceof RiotApiError) {
                    if (err.isNotFound()) {
                        logger.info(`No matches found for ${username}#${tag} (404)`, {
                            puuid: puuid.substring(0, 8) + '...'
                        });
                        // Continue with null lastMatch
                    } else if (err.isRateLimited()) {
                        logger.warn(`Rate limited while fetching matches for ${username}#${tag}`);
                        // Continue with null lastMatch - not critical for registration
                    } else {
                        // For other API errors, log but continue
                        logger.error(`Failed to fetch last match for ${username}#${tag}`, {
                            error: err.message,
                            statusCode: err.statusCode
                        });
                    }
                } else {
                    // Unknown error, log but continue
                    logger.error(`Unexpected error fetching last match`, {
                        error: err.message,
                        stack: err.stack
                    });
                }
            }
            let rankInfo = {solo: null, doubleup: null};

            try {
                rankInfo = await getRank(puuid, platform);
            } catch (err) {
                if (err instanceof RiotApiError) {
                    if (err.isNotFound()) {
                        logger.info(`No rank found for ${username}#${tag}, using UNRANKED`, {
                            puuid: puuid.substring(0, 8) + '...',
                            statusCode: err.statusCode
                        });
                        // Continue with unranked - this is fine
                    } else if (err.isRateLimited()) {
                        logger.warn(`Rate limited while fetching rank for ${username}#${tag}`);
                        // Continue with unranked - not critical for registration
                    } else {
                        // For other API errors, log but continue
                        logger.error(`Failed to fetch rank for ${username}#${tag}`, {
                            error: err.message,
                            statusCode: err.statusCode
                        });
                    }
                } else {
                    // Unknown error, log but continue
                    logger.error(`Unexpected error fetching rank`, {
                        error: err.message,
                        stack: err.stack
                    });
                }
            }
            await register_user(puuid, region, platform, username, tag, lastMatch, rankInfo);

            logger.info(`Successfully registered user: ${username}#${tag}`, {
                puuid: puuid.substring(0, 8) + '...',
                platform,
                region,
                soloRank: rankInfo.solo ? `${rankInfo.solo.tier} ${rankInfo.solo.division}` : 'Unranked',
                doubleupRank: rankInfo.doubleup ? `${rankInfo.doubleup.tier} ${rankInfo.doubleup.division}` : 'Unranked'
            });

            let message = `>>> ✅ Successfully registered **${username}#${tag}** !\n\n`;
            message += `**Platform:** ${platform.toUpperCase()}\n`;
            message += `**Region:** ${region}\n\n`;

            if (rankInfo.solo) {
                message += `**Solo Rank:** ${rankInfo.solo.tier} ${rankInfo.solo.division} ${rankInfo.solo.lp} LP\n`;
            } else {
                message += `**Solo Rank:** Unranked\n`;
            }

            if (rankInfo.doubleup) {
                message += `**Double Up Rank:** ${rankInfo.doubleup.tier} ${rankInfo.doubleup.division} ${rankInfo.doubleup.lp} LP\n`;
            } else {
                message += `**Double Up Rank:** Unranked\n`;
            }

            message += `\n🎮 Your matches will now be tracked automatically!`;

            await interaction.editReply(message);

        } catch (err) {
            logger.error(`Registration failed for ${username}#${tag}`, {
                error: err.message,
                errorType: err.name,
                statusCode: err instanceof RiotApiError ? err.statusCode : undefined,
                stack: err.stack,
                platform,
                region
            });
            let errorMessage = `>>> ❌ Failed to register **${username}#${tag}**.`;
            if (err instanceof RiotApiError) {
                if (err.isUnauthorized()) {
                    errorMessage += `\n\n🚨 The bot's API key is invalid. Please contact the administrator.`;
                } else if (err.isRateLimited()) {
                    errorMessage += `\n\n⏱️ Rate limit exceeded. Please try again in a few minutes.`;
                } else if (err.isServerError()) {
                    errorMessage += `\n\n⚠️ Riot API is experiencing issues. Please try again later.`;
                } else {
                    errorMessage += `\n\nAPI Error (${err.statusCode}). Please try again.`;
                }
            } else if (err.message?.includes('already registered')) {
                errorMessage += `\n\nThis player is already being tracked.`;
            } else if (err.message?.includes('timeout')) {
                errorMessage += `\n\nRequest timed out. Please try again.`;
            } else if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
                errorMessage += `\n\nNetwork error. Please check your connection and try again.`;
            } else {
                errorMessage += `\n\nAn unexpected error occurred. The issue has been logged.`;
            }

            await interaction.editReply(errorMessage);
        }
    },
};