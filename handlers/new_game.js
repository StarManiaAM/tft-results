import logger from "../utils/logger.js";
import {getLastMatch, getMatchInfo, getRank, RiotApiError} from "../utils/api.js";
import {get_all_users, get_user, update_last_match, update_rank_with_delta} from "../utils/sql.js";
import {AttachmentBuilder} from "discord.js";
import {generateMatchCard} from "../utils/card_generator.js";
import {config} from "../utils/config.js";

let stopLoop = false;
let isShuttingDown = false;

// Track processed matches across loop iterations to prevent duplicates
const globalProcessedMatches = new Map(); // matchId -> { puuid, game_info, timestamp }
const MATCH_CACHE_TTL = 900000; // 15 minutes

function cleanupMatchCache() {
    const now = Date.now();
    for (const [matchId, data] of globalProcessedMatches.entries()) {
        if (now - data.timestamp > MATCH_CACHE_TTL) {
            logger.debug(`${matchId} for ${data.puuid} cleared from cache`);
            globalProcessedMatches.delete(matchId);
        }
    }
}

async function startRiotHandler(client, channelId) {
    const channel = client.channels.cache.get(channelId);

    if (!channel) {
        logger.error("Channel not found for ID: " + channelId);
        throw new Error(`Invalid channel ID: ${channelId}`);
    }

    logger.info(`Starting Riot match handler for channel: ${channel.name} (${channelId})`);

    let running = false;
    let failureCount = 0;
    let consecutiveErrors = 0;
    let apiKeyInvalid = false;
    const maxFailureBackoff = 10 * 60 * 1000; // 10 minutes
    const maxConsecutiveErrors = 5;

    async function refreshMatch() {
        if (running) {
            logger.debug("refreshMatch already running, skipping this tick");
            return;
        }

        if (isShuttingDown) {
            logger.info("Shutdown in progress, skipping refresh");
            return;
        }

        if (apiKeyInvalid) {
            logger.error("API key is invalid, skipping refresh");
            return;
        }

        running = true;
        const startTime = Date.now();

        try {
            const users = await get_all_users();

            if (!users || users.length === 0) {
                logger.debug("No users to track");
                failureCount = 0;
                consecutiveErrors = 0;
                return;
            }

            logger.debug(`Processing ${users.length} tracked users`);

            const processedPartners = new Set();
            let successCount = 0;
            let errorCount = 0;
            let skippedCount = 0;

            for (let user of users) {
                if (stopLoop || isShuttingDown) {
                    logger.info("Loop stopped or shutdown initiated");
                    break;
                }

                if (apiKeyInvalid) {
                    logger.error("API key invalid, stopping user processing");
                    break;
                }

                try {
                    const result = await processUserMatch(
                        user,
                        channel,
                        processedPartners
                    );

                    if (result === 'processed') {
                        successCount++;
                    } else if (result === 'skipped') {
                        skippedCount++;
                    }
                } catch (userErr) {
                    errorCount++;

                    // Check for API key errors
                    if (userErr instanceof RiotApiError && userErr.isUnauthorized()) {
                        logger.fatal(`API key is invalid or expired (${userErr.statusCode})`, {
                            error: userErr.message,
                            url: userErr.url
                        });
                        apiKeyInvalid = true;

                        try {
                            await channel.send({
                                content: `> 🚨 **CRITICAL ERROR**: Riot API key is invalid or expired. Match tracking has been disabled. Please update the API key and restart the bot.`
                            });
                        } catch (sendErr) {
                            logger.error("Failed to send API key alert to channel", sendErr);
                        }
                        break;
                    }

                    logger.error(`Failed to process matches for user ${user.username}#${user.tag} (${user.puuid})`, {
                        error: userErr.message,
                        errorType: userErr.name,
                        statusCode: userErr instanceof RiotApiError ? userErr.statusCode : undefined,
                        stack: userErr.stack,
                        userId: user.puuid
                    });

                    // Continue processing other users despite individual failures
                }
            }

            const duration = Date.now() - startTime;
            logger.info(`Match refresh completed in ${duration}ms`, {
                totalUsers: users.length,
                successCount,
                skippedCount,
                errorCount,
                duration
            });

            // Reset failure counters on successful iteration
            if (errorCount === 0) {
                failureCount = 0;
                consecutiveErrors = 0;
            } else if (errorCount === users.length) {
                consecutiveErrors++;
                logger.warn(`All users failed processing (${consecutiveErrors}/${maxConsecutiveErrors})`);
            }
            else {
                // Partial failures don't increment consecutive errors
                consecutiveErrors = 0;
            }

            cleanupMatchCache();

        } catch (err) {
            failureCount++;
            consecutiveErrors++;

            logger.error("Critical error in refreshMatch loop", {
                error: err.message,
                stack: err.stack,
                failureCount,
                consecutiveErrors
            });

            // Alert on critical repeated failures
            if (consecutiveErrors >= maxConsecutiveErrors) {
                logger.fatal(`Match processing has failed ${consecutiveErrors} consecutive times. System may be unhealthy.`);

                try {
                    await channel.send({
                        content: `> ⚠️ **Bot Health Alert**: Match tracking has encountered ${consecutiveErrors} consecutive failures. Please check the logs.`
                    });
                } catch (sendErr) {
                    logger.error("Failed to send health alert to channel", sendErr);
                }
            }

        } finally {
            running = false;
        }
    }

    async function processUserMatch(user, channel, processedPartners) {
        // Skip if already processed by partner
        if (processedPartners.has(user.puuid)) {
            logger.debug(`User ${user.username} already processed via partner`);
            return 'skipped';
        }

        let last_match;
        try {
            last_match = await getLastMatch(user.puuid, user.region);
        } catch (error) {
            if (error instanceof RiotApiError) {
                if (error.statusCode === 400) {
                    logger.debug(`Puuid ${user.puuid} not found`);
                    return 'skipped';
                } else if (error.isRateLimited()) {
                    logger.warn(`Rate limited while fetching matches for ${user.username}#${user.tag}`);
                    throw error; // Re-throw to trigger backoff
                }
            }
            throw error; // Re-throw other errors
        }

        if (!last_match) {
            logger.debug(`No matches found for ${user.username}#${user.tag}`);
            return 'skipped';
        }

        if (last_match === user.last_match) {
            logger.debug(`No new matches for ${user.username}#${user.tag}`);
            return 'skipped';
        }

        // Check global cache to prevent duplicate processing
        const cached_data = globalProcessedMatches.get(last_match);
        if (cached_data && cached_data.puuid === user.puuid) {
            logger.debug(`Match ${last_match} already processed globally for ${user.username}`);
            await update_last_match(user.puuid, last_match);
            return 'skipped';

        }

        logger.info(`New match detected for ${user.username}#${user.tag}: ${last_match}`);

        let game_info;
        if (globalProcessedMatches.has(last_match)) {
            logger.debug(`Match ${last_match} is stored in cache`);
            game_info = globalProcessedMatches.get(last_match).game_info;
        }
        else {
            try {
                game_info = await getMatchInfo(user.region, last_match);
            } catch (error) {
                if (error instanceof RiotApiError) {
                    if (error.isNotFound()) {
                        logger.warn(`Match ${last_match} not found for ${user.username}`, {
                            userId: user.puuid,
                            matchId: last_match
                        });
                        // Update last_match to prevent repeated attempts
                        await update_last_match(user.puuid, last_match);
                        return 'skipped';
                    } else if (error.isRateLimited()) {
                        logger.warn(`Rate limited while fetching match info ${last_match}`);
                        throw error; // Re-throw to trigger backoff
                    }
                }
                throw error; // Re-throw other errors
            }
        }

        if (!game_info?.info) {
            logger.warn(`No game info available for match ${last_match}`, {
                userId: user.puuid,
                matchId: last_match
            });
            return 'skipped';
        }

        const data = game_info.info.participants.find(p => p.puuid === user.puuid);

        if (!data) {
            logger.warn(`Participant data not found for ${user.username} in match ${last_match}`, {
                userId: user.puuid,
                matchId: last_match,
                participantCount: game_info.info.participants.length
            });
            return 'skipped';
        }

        const queueId = game_info.info.queueId;

        try {
            if (queueId === 1160) {
                await processDoubleUpMatch(user, data, game_info, last_match, channel, processedPartners);
            } else if (queueId === 1100) {
                await processSoloMatch(user, data, last_match, channel);
            } else {
                await processOtherMatch(user, data, last_match, channel);
            }


            // Mark match as processed globally
            globalProcessedMatches.set(last_match, {puuid: user.puuid, game_info: game_info, timestamp: Date.now()});

            return 'processed';
        } catch (error) {
            if (error instanceof RiotApiError && error.isNotFound()) {
                await update_last_match(user.puuid, last_match);
            }
            throw error;
        }
    }

    async function processSoloMatch(user, data, last_match, channel) {
        try {
            const platform = user.plateform;
            let rankInfo;
            try {
                rankInfo = await getRank(data.puuid, platform);
            } catch (error) {
                if (error instanceof RiotApiError) {
                    if (error.isNotFound()) {
                        logger.warn(`Rank not found for ${user.username}, using UNRANKED`, {
                            userId: user.puuid
                        });
                        rankInfo = { solo: null, doubleup: null };
                    } else {
                        throw error;
                    }
                } else {
                    throw error;
                }
            }

            const {newRank, deltas} = await update_rank_with_delta(user.puuid, rankInfo);
            const current = newRank.solo || {tier: "UNRANKED", division: "", lp: 0};
            const delta = deltas.solo;
            const lpChange = formatLPChange(delta);

            logger.info(`${user.username}#${user.tag} finished #${data.placement}`, {
                rank: `${current.tier} ${current.division} ${current.lp} LP`,
                lpChange,
                matchId: last_match
            });

            const soloCard = await generateMatchCard(
                user,
                data,
                current,
                lpChange,
                data.placement,
                null,
                "solo"
            );

            const attachment = new AttachmentBuilder(soloCard, {name: "solo.png"});

            await channel.send({files: [attachment]});

            await update_last_match(user.puuid, last_match);

        } catch (err) {
            logger.error(`Error processing solo match for ${user.username}`, {
                error: err.message,
                errorType: err.name,
                statusCode: err instanceof RiotApiError ? err.statusCode : undefined,
                stack: err.stack,
                matchId: last_match
            });

            throw err;
        }
    }

    async function processDoubleUpMatch(user, data, game_info, last_match, channel, processedPartners) {
        try {
            // Calculate double-up placement
            let placement = data.placement;

            if (placement % 2 !== 0) placement++;
            placement = placement / 2;

            const partnerId = data.partner_group_id;
            const teammate = game_info.info.participants.find(
                p => p.partner_group_id === partnerId && p.puuid !== user.puuid
            );

            if (!teammate) {
                logger.warn(`Teammate not found for ${user.username}`, {
                    partnerId,
                    matchId: last_match
                });
            }

            // Process main user's rank
            const platform = user.plateform;
            let rankInfo;

            try {
                rankInfo = await getRank(data.puuid, platform);
            } catch (error) {
                if (error instanceof RiotApiError) {
                    if (error.isNotFound()) {
                        logger.warn(`Rank not found for ${user.username}, using UNRANKED`, {
                            userId: user.puuid
                        });
                        rankInfo = { solo: null, doubleup: null };
                    } else {
                        throw error;
                    }
                } else {
                    throw error;
                }
            }

            const {newRank, deltas} = await update_rank_with_delta(user.puuid, rankInfo);
            const current = newRank.doubleup || {tier: "UNRANKED", division: "", lp: 0};
            const lpChange = formatLPChange(deltas.doubleup);

            // Process teammate's rank if they're tracked
            let teammateData = null;
            if (teammate) {
                const teammateDb = await get_user(teammate.puuid);

                if (teammateDb) {
                    try {
                        const tPlatform = teammateDb.plateform;
                        let tRankInfo;

                        try {
                            tRankInfo = await getRank(teammate.puuid, tPlatform);
                        } catch (error) {
                            if (error instanceof RiotApiError && error.isNotFound()) {
                                logger.warn(`Rank not found for teammate ${teammate.riotIdGameName}`, {
                                    teammateId: teammate.puuid
                                });
                                tRankInfo = { solo: null, doubleup: null };
                            } else {
                                throw error;
                            }
                        }

                        const tres = await update_rank_with_delta(teammateDb.puuid, tRankInfo);

                        teammateData = {
                            username: `${teammate.riotIdGameName}`,
                            data: {units: teammate.units},
                            rank: tres.newRank?.doubleup || {tier: "UNRANKED", division: "", lp: 0},
                            lpChange: formatLPChange(tres.deltas.doubleup)
                        };

                        await update_last_match(teammateDb.puuid, last_match);
                        processedPartners.add(teammate.puuid);

                        logger.debug(`Processed teammate ${teammateData.username} for ${user.username}`);
                    } catch (teammateErr) {
                        logger.error(`Failed to process teammate ${teammate.riotIdGameName}`, {
                            error: teammateErr.message,
                            errorType: teammateErr.name,
                            statusCode: teammateErr instanceof RiotApiError ? teammateErr.statusCode : undefined,
                            teammateId: teammate.puuid
                        });
                        // Continue with null teammate data
                    }
                } else {
                    // Teammate exists but not tracked
                    teammateData = {
                        username: `${teammate.riotIdGameName}#${teammate.riotIdTagline}`,
                        data: {units: teammate.units},
                        rank: {tier: "UNRANKED", division: "", lp: 0},
                        lpChange: ""
                    };
                }
            }

            logger.info(`${user.username}#${user.tag} - Double Up result #${placement}`, {
                rank: `${current.tier} ${current.division} ${current.lp} LP`,
                lpChange,
                teammate: teammateData?.username || "Unknown",
                matchId: last_match
            });

            const duoCard = await generateMatchCard(
                user,
                data,
                current,
                lpChange,
                placement,
                teammateData,
                "doubleup"
            );

            const attachment = new AttachmentBuilder(duoCard, {name: "doubleup.png"});

            // Only send if main user hasn't been processed by partner
            if (!processedPartners.has(user.puuid)) {
                await channel.send({files: [attachment]});
            }

            processedPartners.add(user.puuid);
            await update_last_match(user.puuid, last_match);

        } catch (err) {
            logger.error(`Error processing double-up match for ${user.username}`, {
                error: err.message,
                errorType: err.name,
                statusCode: err instanceof RiotApiError ? err.statusCode : undefined,
                stack: err.stack,
                matchId: last_match
            });

            throw err;
        }
    }

    async function processOtherMatch(user, data, last_match, channel) {
        try {
            const soloCard = await generateMatchCard(
                user,
                data,
                {tier: "UNRANKED", division: "", lp: 0},
                "",
                data.placement,
                null,
                "other"
            );

            const attachment = new AttachmentBuilder(soloCard, {name: "other.png"});

            await channel.send({files: [attachment]});
            await update_last_match(user.puuid, last_match);

        } catch (err) {
            logger.error(`Error processing solo match for ${user.username}`, {
                error: err.message,
                errorType: err.name,
                stack: err.stack,
                matchId: last_match
            });

            throw err;
        }
    }

    // Main scheduling loop
    await (async function scheduleLoop() {
        logger.info("Match tracking loop started");

        while (!stopLoop && !isShuttingDown && !apiKeyInvalid) {
            try {
                await refreshMatch();

                let nextDelay = config.pollIntervalMs;
                if (failureCount > 0) {
                    nextDelay = Math.min(
                        config.pollIntervalMs * Math.pow(2, failureCount),
                        maxFailureBackoff
                    );
                    logger.debug(`Using backoff delay: ${nextDelay}ms (failure count: ${failureCount})`);
                }

                await new Promise((res) => setTimeout(res, nextDelay));
            } catch (loopErr) {
                logger.error("Unexpected error in schedule loop", {
                    error: loopErr.message,
                    stack: loopErr.stack
                });

                // Emergency backoff
                await new Promise((res) => setTimeout(res, 30000));
            }
        }

        if (apiKeyInvalid) {
            logger.fatal("Match tracking loop stopped due to invalid API key");
        } else {
            logger.info("Match tracking loop stopped");
        }
    })();

    return () => {
        stopLoop = true;
        isShuttingDown = true;
        logger.info("Riot handler shutdown requested");
    };
}

function formatLPChange(delta) {
    if (delta === null || delta === undefined) return "";
    return delta > 0 ? ` (+${delta} LP)` : ` (${delta} LP)`;
}

export {startRiotHandler};