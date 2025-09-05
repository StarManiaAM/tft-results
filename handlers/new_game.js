import axios from 'axios';
const RIOT_API_KEY = process.env.RIOT_API_KEY;

async function getPUUID(region, name, tag) {
    const res = await axios.get(
        `https://${region}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${name}/${tag}`,
        { headers: { "X-Riot-Token": RIOT_API_KEY } }
    );
    return res.data.puuid;
}

async function getLastMatch(puuid, region) {
    const res = await axios.get(
        `https://${region}.api.riotgames.com/tft/match/v1/matches/by-puuid/${puuid}/ids?start=0&count=1`,
        { headers: { "X-Riot-Token": RIOT_API_KEY } }
    );
    return res.data[0];
}

async function getMatchInfo(region, puuid, match){
    const res = await axios.get(
        `https://${region}.api.riotgames.com/tft/match/v1/matches/${match}`,
        { headers: { "X-Riot-Token": RIOT_API_KEY } }
    );
    return res.data;
}

async function startRiotHandler(client, channelId) {
    const channel = client.channels.cache.get(channelId);
    if (!channel) {
        console.error("Channel not found!");
        return;
    }
    const puuid = await getPUUID('europe', 'User', 'tag');
    let lastMatch = await getLastMatch(puuid, 'europe');

    async function refreshMatch() {
        const last = await getLastMatch(puuid, 'europe');
        if (last !== lastMatch) {
            lastMatch = last;
            const matchInfo = await getMatchInfo('europe', puuid, last);
            let place = matchInfo.info.participants.find(p => p.puuid === puuid).placement;
            if (place > 4)
                channel.send(`User vient de finir ${place}eme loser`);
            else
                channel.send(`User vient de finir ${place}eme GG`);
        }
    }

    setInterval(await refreshMatch, 15000);
}

export { startRiotHandler };