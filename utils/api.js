import axios from 'axios';
import logger from "./logger.js";
import {config} from "./config.js";

const RIOT_API_KEY = config.riotApiKey;

const riotApi = axios.create({
    headers: {"X-Riot-Token": RIOT_API_KEY},
    timeout: 10_000,
});

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

            // Don't retry on 4xx except 429
            if (status && status >= 400 && status < 500 && status !== 429) {
                logger.warn(`[API] Non-retryable error ${status} at ${url}: ${err.response?.statusText}`);
                throw err;
            }

            if (attempt > maxRetries) {
                logger.error(`[API] Failed GET ${url} after ${attempt} attempts:`, err.message || err);
                throw err;
            }

            // if rate limited, respect Retry-After if present
            const retryAfter = err.response?.headers?.["retry-after"];
            const waitMs = retryAfter ? Number(retryAfter) * 1000 : delay;

            logger.warn(`[API] GET ${url} failed (attempt ${attempt}). Retrying in ${waitMs}ms`);

            await new Promise((res) => setTimeout(res, waitMs));
            delay *= 2;
        }
    }

    return null;
}

export async function getPUUID(region, name, tag) {
    if (!region || !name || !tag) return null;

    try {
        const data = await safeGet(`https://${region}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`);
        return data?.puuid ?? null;
    } catch (error) {
        logger.error(`[API Error] Could not get PUUID for ${name}#${tag}: ${error.message}`);
        return null;
    }
}

export async function getLastMatch(puuid, region) {
    if (!puuid || !region) return null;

    try {
        const data = await safeGet(`https://${region}.api.riotgames.com/tft/match/v1/matches/by-puuid/${puuid}/ids?start=0&count=1`);
        return Array.isArray(data) && data.length ? data[0] : null;
    } catch (error) {
        logger.error(`[API Error] Could not get last match for ${puuid}: ${error.message}`);
        return null;
    }
}

export async function getMatchInfo(region, matchId) {
    if (!region || !matchId) return null;

    try {
        const data = await safeGet(`https://${region}.api.riotgames.com/tft/match/v1/matches/${matchId}`);
        return data ?? null;
    } catch (error) {
        logger.error(`[API Error] Could not get match info ${matchId}: ${error.message}`);
        return null;
    }
}

export async function getRank(puuid, platform) {
    if (!puuid || !platform) return {solo: null, doubleup: null};

    try {
        const data = await safeGet(`https://${platform}.api.riotgames.com/tft/league/v1/by-puuid/${puuid}`);
        const solo = Array.isArray(data) ? data.find(d => d.queueType === "RANKED_TFT") : null;
        const doubleup = Array.isArray(data) ? data.find(d => d.queueType === "RANKED_TFT_DOUBLE_UP") : null;

        return {
            solo: solo ? {tier: solo.tier, division: solo.rank, lp: solo.leaguePoints} : null,
            doubleup: doubleup ? {tier: doubleup.tier, division: doubleup.rank, lp: doubleup.leaguePoints} : null,
        };
    } catch (error) {
        logger.error(`[API Error] Could not get rank for ${puuid}: ${error.message}`);
        return {solo: null, doubleup: null};
    }
}