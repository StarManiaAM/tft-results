import { getLastMatch, getMatchInfo } from '../utils/api.js'
import { get_all_users, update_last_match } from '../utils/sql.js'

async function startRiotHandler(client, channelId) {
    const channel = client.channels.cache.get(channelId);
    if (!channel) {
        console.error("Channel not found!");
        return;
    }

    async function refreshMatch() {
        const users = await get_all_users();
        for (const user of users) {
            const last_match = await getLastMatch(user.puuid, user.region);
            if (last_match !== user.last_match) {
                channel.send(`${user.username} just finished a game`);
                await update_last_match(user.puuid, last_match);
            }
        }
    }

    setInterval(await refreshMatch, 15000);
}

export { startRiotHandler };