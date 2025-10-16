import axios from 'axios';
const RIOT_API_KEY = process.env.RIOT_API_KEY;

const riotApi = axios.create({
    headers: { "X-Riot-Token": RIOT_API_KEY }
});

export async function getPUUID(region, name, tag) {
    try {
        const res = await riotApi.get(`https://${region}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${name}/${tag}`);
        return res.data.puuid;
    } catch (error) {
        console.error(`[API Error] Could not get PUUID for ${name}#${tag}:`, error.response?.statusText || error.message);
        return null;
    }
}

export async function getLastMatch(puuid, region) {
    try {
        const res = await riotApi.get(`https://${region}.api.riotgames.com/tft/match/v1/matches/by-puuid/${puuid}/ids?start=0&count=1`);
        return res.data[0];
    } catch (error) {
        console.error(`[API Error] Could not get last match for ${puuid}:`, error.response?.statusText || error.message);
        return null;
    }
}

export async function getMatchInfo(region, matchId) {
    try {
        const res = await riotApi.get(`https://${region}.api.riotgames.com/tft/match/v1/matches/${matchId}`);
        return res.data;
    } catch (error) {
        console.error(`[API Error] Could not get info for match ${matchId}:`, error.response?.statusText || error.message);
        return null;
    }
}

export async function getRank(puuid, platform) {
    try {
        const res = await riotApi.get(`https://${platform}.api.riotgames.com/tft/league/v1/by-puuid/${puuid}`);
        const data = res.data;
        const solo = data.find(d => d.queueType === "RANKED_TFT");
        const doubleup = data.find(d => d.queueType === "RANKED_TFT_DOUBLE_UP");
        return {
            solo: solo ? {
                tier: solo.tier,
                division: solo.rank,
                lp: solo.leaguePoints
            } : null,
            doubleup: doubleup ? {
                tier: doubleup.tier,
                division: doubleup.rank,
                lp: doubleup.leaguePoints
            } : null
        };
    } catch (error) {
        console.error(`[API Error] Could not get rank for ${puuid}:`, error.response?.statusText || error.message);
        return { solo: null, doubleup: null };
    }
}