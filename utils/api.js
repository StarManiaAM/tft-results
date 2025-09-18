import axios from 'axios';
const RIOT_API_KEY = process.env.RIOT_API_KEY;

export async function getPUUID(region, name, tag) {
    const res = await axios.get(
        `https://${region}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${name}/${tag}`,
        { headers: { "X-Riot-Token": RIOT_API_KEY } }
    );
    return res.data.puuid;
}

export async function getLastMatch(puuid, region) {
    const res = await axios.get(
        `https://${region}.api.riotgames.com/tft/match/v1/matches/by-puuid/${puuid}/ids?start=0&count=1`,
        { headers: { "X-Riot-Token": RIOT_API_KEY } }
    );
    return res.data[0];
}

export async function getMatchInfo(region, puuid, match){
    const res = await axios.get(
        `https://${region}.api.riotgames.com/tft/match/v1/matches/${match}`,
        { headers: { "X-Riot-Token": RIOT_API_KEY } }
    );
    return res.data;
}

export async function getRank(puuid, region) {
    const res = await axios.get(
        `https://${region}.api.riotgames.com/tft/league/v1/by-puuid/${puuid}`,
        { headers: { "X-Riot-Token": RIOT_API_KEY } }
    );
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
}