import { getLastMatch, getMatchInfo, getRank } from '../utils/api.js'
import { get_all_users, update_last_match, update_rank_with_delta, get_user } from '../utils/sql.js'

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
    
                // --- Handle Double Up ---
                if ('partner_group_id' in data) {
                    double = true;
                    if (placement % 2 !== 0)
                        placement++;
                    placement = placement / 2;
    
                    const partnerId = data.partner_group_id;
                    const teammate = game_info.info.participants.find(
                        p => p.partner_group_id === partnerId && p.puuid !== user.puuid
                    );
    
                    // Get current user rank (Double Up)
                    const rankInfo = await getRank(data.puuid, "euw1"); //TODO: change region
                    const { newRank, deltas } = await update_rank_with_delta(user.puuid, rankInfo);
                    const current = newRank.doubleup;
                    const delta = deltas.doubleup;
                    let lpChange = delta !== null ? (delta > 0 ? ` (+${delta} LP)` : ` (${delta} LP)`) : "";
    
                    // --- Teammate display ---
                    let teammateDisplay = "Unknown";
                    if (teammate) {
                        const teammateDb = await get_user(teammate.puuid);
                        if (teammateDb) {
                            // Update teammate rank
                            const tRankInfo = await getRank(teammate.puuid, "euw1");
                            const res = await update_rank_with_delta(teammateDb.puuid, tRankInfo); 
                            const tnewRank = res.newRank;
                            const tdeltas = res.deltas;
                            let tlpChange = tdeltas.doubleup !== null ? (tdeltas.doubleup > 0 ? ` (+${tdeltas.doubleup} LP)` : ` (${tdeltas.doubleup} LP)`) : "";
   
                            if (tnewRank)
                                teammateDisplay = `${teammateDb.username} (${tnewRank.doubleup.tier} ${tnewRank.doubleup.division} ${tnewRank.doubleup.lp} LP${tlpChange})`;
                            else
                                teammateDisplay = teammateDb.username;
    
                            // Sync teammate's last match
                            users.splice(users.indexOf(users.find(p => p.puuid === teammateDb.puuid)), 1);
                        }
                        else {
                            teammateDisplay = teammate.riotIdGameName
                                ? `${teammate.riotIdGameName}#${teammate.riotIdTagline}`
                                : "Unknown";
                        }
                    }
    
                    channel.send(
                        `${user.username} (${current.tier} ${current.division} ${current.lp} LP${lpChange}) & ${teammateDisplay} finished ${placement} in Double Up`
                    );
                }
                else {
                    // --- Solo Ranked ---
                    const rankInfo = await getRank(data.puuid, "euw1"); //TODO: change region
                    const { newRank, deltas } = await update_rank_with_delta(user.puuid, rankInfo);
                    const current = newRank.solo;
                    const delta = deltas.solo;
                    let lpChange = delta !== null ? (delta > 0 ? ` (+${delta} LP)` : ` (${delta} LP)`) : "";
    
                    channel.send(
                        `${user.username} finished ${placement} — now ${current.tier} ${current.division} ${current.lp} LP${lpChange}`
                    );
                }
    
                await update_last_match(user.puuid, last_match);
            }
        }
    }
    
    setInterval(await refreshMatch, 15000);
}

export { startRiotHandler };