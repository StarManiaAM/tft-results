import axios from 'axios';
import logger from "./logger.js";
import {config} from "./config.js";

const RIOT_API_KEY = config.riotApiKey;

const riotApi = axios.create({
    headers: {"X-Riot-Token": RIOT_API_KEY},
    timeout: 10_000,
});

// Custom error class for API errors
export class RiotApiError extends Error {
    constructor(message, statusCode, url, originalError) {
        super(message);
        this.name = 'RiotApiError';
        this.statusCode = statusCode;
        this.url = url;
        this.originalError = originalError;
    }

    isNotFound() {
        return this.statusCode === 404;
    }

    isUnauthorized() {
        return this.statusCode === 401;
    }

    isForbidden() {
        return this.statusCode === 403
    }

    isRateLimited() {
        return this.statusCode === 429;
    }

    isServerError() {
        return this.statusCode >= 500 && this.statusCode < 600;
    }

    isClientError() {
        return this.statusCode >= 400 && this.statusCode < 500;
    }
}

async function safeGet(url, maxRetries = 3) {
    let attempt = 0;
    let delay = 500;

    while (attempt <= maxRetries) {
        try {
            logger.debug(`[API] Try to get: ${url}`, url);
            const res = await riotApi.get(url);
            return res.data;
        } catch (err) {
            attempt++;
            const status = err.response?.status;
            const statusText = err.response?.statusText || 'Unknown error';

            // Don't retry on 4xx except 429
            if (status && status >= 400 && status < 500 && status !== 429) {
                logger.warn(`[API] Non-retryable error ${status} at ${url}: ${statusText}`);
                throw new RiotApiError(
                    `API request failed with status ${status}: ${statusText}`,
                    status,
                    url,
                    err
                );
            }

            if (attempt > maxRetries) {
                logger.error(`[API] Failed GET ${url} after ${attempt} attempts:`, err.message || err);
                throw new RiotApiError(
                    `API request failed after ${maxRetries} retries`,
                    status,
                    url,
                    err
                );
            }

            // if rate limited, respect Retry-After if present
            const retryAfter = err.response?.headers?.["retry-after"];
            const waitMs = retryAfter ? Number(retryAfter) * 1000 : delay;

            logger.warn(`[API] GET ${url} failed (attempt ${attempt}). Retrying in ${waitMs}ms`);

            await new Promise((res) => setTimeout(res, waitMs));
            delay *= 2;
        }
    }

    // This should never be reached due to throw in loop
    throw new RiotApiError('Unexpected error in safeGet', 0, url, null);
}

export async function getPUUID(region, name, tag) {
    if (!region || !name || !tag) throw new Error('Missing required parameters: region, name, or tag');;

    try {
        const url = `https://${region}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`
        const data = await safeGet(url);

        if (!data?.puuid) {
            throw new RiotApiError('Invalid response: missing puuid', 0, url, null);
        }
        return data.puuid;
    } catch (error) {
        if (error instanceof RiotApiError) {
            logger.error(`[API Error] Could not get PUUID for ${name}#${tag}: ${error.message} (${error.statusCode})`);
            throw error;
        }

        logger.error(`[API Error] Could not get PUUID for ${name}#${tag}: ${error.message}`);
        throw error;
    }
}

export async function getLastMatch(puuid, region) {
    if (!puuid || !region) throw new Error('Missing required parameters: puuid or region');

    try {
        const url = `https://${region}.api.riotgames.com/tft/match/v1/matches/by-puuid/${puuid}/ids?start=0&count=1`
        const data = await safeGet(url);
        if (!Array.isArray(data)) {
            throw new RiotApiError('Invalid response: expected array', 0, url, null);
        }
        return data.length > 0 ? data[0] : null;
    } catch (error) {
        if (error instanceof RiotApiError) {
            logger.error(`[API Error] Could not get last match for ${puuid}: ${error.message} (${error.statusCode})`);
            throw error;
        }
        logger.error(`[API Error] Could not get last match for ${puuid}: ${error.message}`);
        throw error;
    }
}

export async function getMatchInfo(region, matchId) {
    if (!region || !matchId) throw new Error('Missing required parameters: region or matchId');;

    try {
        const url = `https://${region}.api.riotgames.com/tft/match/v1/matches/${matchId}`;
        const data = await safeGet(url);

        if (!data) {
            throw new RiotApiError('Invalid response: no data returned', 0, url, null);
        }

        return data;
    } catch (error) {
        if (error instanceof RiotApiError) {
            logger.error(`[API Error] Could not get match info ${matchId}: ${error.message} (${error.statusCode})`);
            throw error;
        }
        logger.error(`[API Error] Could not get match info ${matchId}: ${error.message}`);
        throw error;
    }
}

export async function getRank(puuid, platform) {
    if (!puuid || !platform) {
        throw new Error('Missing required parameters: puuid or platform');
    }

    try {
        const url = `https://${platform}.api.riotgames.com/tft/league/v1/by-puuid/${puuid}`;
        const data = await safeGet(url);

        if (!Array.isArray(data)) {
            throw new RiotApiError('Invalid response: expected array', 0, url, null);
        }

        const solo = data.find(d => d.queueType === "RANKED_TFT") || null;
        const doubleup = data.find(d => d.queueType === "RANKED_TFT_DOUBLE_UP") || null;

        return {
            solo: solo ? {tier: solo.tier, division: solo.rank, lp: solo.leaguePoints} : null,
            doubleup: doubleup ? {tier: doubleup.tier, division: doubleup.rank, lp: doubleup.leaguePoints} : null,
        };
    } catch (error) {
        if (error instanceof RiotApiError) {
            logger.error(`[API Error] Could not get rank for ${puuid}: ${error.message} (${error.statusCode})`);
            throw error;
        }
        logger.error(`[API Error] Could not get rank for ${puuid}: ${error.message}`);
        throw error;
    }
}