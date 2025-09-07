import { getPUUID, getLastMatch, getMatchInfo } from '../utils/api.js'

async function startRiotHandler(client, channelId) {
    const channel = client.channels.cache.get(channelId);
    if (!channel) {
        console.error("Channel not found!");
        return;
    }
    const puuid = await getPUUID('europe', 'user', 'tag');

    let lastMatch = await getLastMatch(puuid, 'europe');

    async function refreshMatch() {
        const last = await getLastMatch(puuid, 'europe');
        if (lastMatch !== last) {
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