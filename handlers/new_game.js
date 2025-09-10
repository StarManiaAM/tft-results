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
                const game_info = await getMatchInfo(user.region, user.puuid, last_match);
                const data = game_info.info.participants.find(p => p.puuid === user.puuid);
                let placement = data.placement;
                let double = false;
                if ('partner_group_id' in data) {
                    double = true;
                    if (placement % 2 !== 0)
                        placement++;
                    placement = placement / 2;
                }
                if (placement === 1) {
                    if (double)
                        channel.send(`${user.username} vient de finir ${placement}er en double up trop cho`);
                    else
                        channel.send(`${user.username} vient de finir ${placement}er trop cho`);
                }

                else if (placement <= 4 && !double)
                    channel.send(`${user.username} vient de finir ${placement}ème`);

                else if (placement <= 2 && double)
                    channel.send(`${user.username} vient de finir ${placement}ème en double up`);

                else
                {
                    if (!double)
                        channel.send(`${user.username} vient de finir ${placement}ème big loser`);
                    else
                        channel.send(`${user.username} vient de finir ${placement}ème en double up big loser`);
                }

                await update_last_match(user.puuid, last_match);
            }
        }
    }

    setInterval(await refreshMatch, 15000);
}

export { startRiotHandler };