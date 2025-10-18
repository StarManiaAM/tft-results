import logger from "../utils/logger.js";
import {getLastMatch, getMatchInfo, getRank} from "../utils/api.js";
import {get_all_users, get_user, update_last_match, update_rank_with_delta} from "../utils/sql.js";
import {AttachmentBuilder} from "discord.js";
import {generateMatchCard} from "../utils/card_generator.js";
import {config} from "../utils/config.js";

let stopLoop = false;
let isShuttingDown = false;

// Track processed matches across loop iterations to prevent duplicates
const globalProcessedMatches = new Map(); // matchId -> timestamp
const MATCH_CACHE_TTL = 1800000; // 30 minutes

function cleanupMatchCache() {
    const now = Date.now();
    for (const [matchId, timestamp] of globalProcessedMatches.entries()) {
        if (now - timestamp > MATCH_CACHE_TTL) {
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

            for (const user of users) {
                if (stopLoop || isShuttingDown) {
                    logger.info("Loop stopped or shutdown initiated");
                    break;
                }

                try {
                    const matchProcessed = await processUserMatch(
                        user,
                        channel,
                        processedPartners
                    );

                    if (matchProcessed) {
                        successCount++;
                    }
                } catch (userErr) {
                    errorCount++;

                    logger.error(`Failed to process matches for user ${user.username}#${user.tag} (${user.puuid})`, {
                        error: userErr.message,
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

            // Cleanup old match cache entries periodically
            if (Math.random() < 0.1) { // 10% chance each iteration
                cleanupMatchCache();
            }

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
                        content: `⚠️ **Bot Health Alert**: Match tracking has encountered ${consecutiveErrors} consecutive failures. Please check the logs.`
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
            return false;
        }

        const last_match = await getLastMatch(user.puuid, user.region);

        if (!last_match) {
            logger.debug(`No matches found for ${user.username}#${user.tag}`);
            return false;
        }

        if (last_match === user.last_match) {
            logger.debug(`No new matches for ${user.username}#${user.tag}`);
            return false;
        }

        // Check global cache to prevent duplicate processing
        if (globalProcessedMatches.has(last_match)) {
            logger.debug(`Match ${last_match} already processed globally for ${user.username}`);
            await update_last_match(user.puuid, last_match);
            return false;
        }

        logger.info(`New match detected for ${user.username}#${user.tag}: ${last_match}`);

        const game_info = await getMatchInfo(user.region, last_match);

        if (!game_info?.info) {
            logger.warn(`No game info available for match ${last_match}`, {
                userId: user.puuid,
                matchId: last_match
            });
            return false;
        }

        const data = game_info.info.participants.find(p => p.puuid === user.puuid);

        if (!data) {
            logger.warn(`Participant data not found for ${user.username} in match ${last_match}`, {
                userId: user.puuid,
                matchId: last_match,
                participantCount: game_info.info.participants.length
            });
            return false;
        }

        const queueId = game_info.info.queueId;

        if (queueId === 1160) {
            await processDoubleUpMatch(user, data, game_info, last_match, channel, processedPartners);
        } else if (queueId === 1100) {
            await processSoloMatch(user, data, last_match, channel);
        } else {
            await processOtherMatch(user, data, last_match, channel);
        }


        // Mark match as processed globally
        globalProcessedMatches.set(last_match, Date.now());

        return true;
    }

    async function processSoloMatch(user, data, last_match, channel) {
        try {
            const platform = user.plateform;
            const rankInfo = await getRank(data.puuid, platform);

            if (!rankInfo) {
                throw new Error("Failed to retrieve rank information");
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
            const rankInfo = await getRank(data.puuid, platform);

            if (!rankInfo) {
                throw new Error("Failed to retrieve rank information");
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
                        const tRankInfo = await getRank(teammate.puuid, tPlatform);
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
                0,
                0,
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
                stack: err.stack,
                matchId: last_match
            });

            throw err;
        }
    }

    // Main scheduling loop
    await (async function scheduleLoop() {
        logger.info("Match tracking loop started");

        while (!stopLoop && !isShuttingDown) {
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

        logger.info("Match tracking loop stopped");
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