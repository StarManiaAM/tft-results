import { getLastMatch, getMatchInfo, getRank } from "../utils/api.js";
import { get_all_users, update_last_match, update_rank_with_delta, get_user } from "../utils/sql.js";
import { AttachmentBuilder } from "discord.js";
import { generateMatchCard } from "../utils/card_generator.js";

async function startRiotHandler(client, channelId) {
    const channel = client.channels.cache.get(channelId);
    if (!channel) {
        console.error("Channel not found!");
        return;
    }

    async function refreshMatch() {
        const users = await get_all_users();
        let partners = [];
        for (const user of users) {
            const last_match = await getLastMatch(user.puuid, user.region);
            if (last_match !== user.last_match) {
                const game_info = await getMatchInfo(
                    user.region,
                    user.puuid,
                    last_match
                );
                const data = game_info.info.participants.find(
                    (p) => p.puuid === user.puuid
                );
                let placement = data.placement;
                let double = false;

                // --- Handle Double Up ---
                if ("partner_group_id" in data) {
                    double = true;
                    if (placement % 2 !== 0) placement++;
                    placement = placement / 2;

                    const partnerId = data.partner_group_id;
                    const teammate = game_info.info.participants.find(
                        (p) =>
                            p.partner_group_id === partnerId &&
                            p.puuid !== user.puuid
                    );

                    // Get current user rank (Double Up)
                    const rankInfo = await getRank(data.puuid, "euw1");
                    const { newRank, deltas } = await update_rank_with_delta(
                        user.puuid,
                        rankInfo
                    );
                    const current = newRank.doubleup;
                    const delta = deltas.doubleup;

                    let lpChange =
                        delta !== null
                            ? delta > 0
                                ? ` (+${delta} LP)`
                                : ` (${delta} LP)`
                            : "";

                    // --- Teammate infos ---
                    let teammateName = `${teammate.riotIdGameName}#${teammate.riotIdTagline}`;
                    let tlpChange = "";
                    let tdeltas = "";

                    const teammateDb = await get_user(teammate.puuid);
                    partners.push(teammate.puuid);
                    const tRankInfo = await getRank(teammate.puuid, "euw1");
                    if (teammateDb) {
                        // Update teammate rank
                        const res = await update_rank_with_delta(
                            teammateDb.puuid,
                            tRankInfo
                        );
                        tdeltas = res.deltas;
                        // Sync teammate's last match
                        await update_last_match(teammateDb.puuid, last_match);
                    }

                    tlpChange =
                        tdeltas.doubleup !== null
                            ? tdeltas.doubleup > 0
                                ? ` (+${tdeltas.doubleup} LP)`
                                : ` (${tdeltas.doubleup} LP)`
                            : "";

                    console.log(
                        `${user.username} (${current.tier} ${current.division} ${current.lp} LP${lpChange}) & ${teammateName} finished ${placement} in Double Up`
                    );

                    const duoCard = await generateMatchCard(
                        user,
                        data,
                        current,
                        lpChange,
                        placement,
                        {
                            username: teammateName,
                            data: { units: teammate.units },
                            rank: tRankInfo.doubleup,
                            lpChange: tlpChange,
                        },
                        "doubleup"
                    );

                    const attachment = new AttachmentBuilder(duoCard, {
                        name: "doubleup.png",
                    });

                    // envoyer dans le channel
                    if (!partners.includes(user.puuid)) {
                        await channel.send({
                            files: [attachment],
                        });
                    }
                } else {
                    // --- Solo Ranked ---
                    const rankInfo = await getRank(data.puuid, "euw1");
                    const { newRank, deltas } = await update_rank_with_delta(
                        user.puuid,
                        rankInfo
                    );
                    const current = newRank.solo;
                    const delta = deltas.solo;
                    let lpChange =
                        delta !== null
                            ? delta > 0
                                ? ` (+${delta} LP)`
                                : ` (${delta} LP)`
                            : "";

                    console.log(
                        `${user.username} finished ${placement} — now ${current.tier} ${current.division} ${current.lp} LP${lpChange}`
                    );

                    const soloCard = await generateMatchCard(
                        user,
                        data,
                        current,
                        lpChange,
                        placement,
                        null,
                        "solo"
                    );

                    const attachment = new AttachmentBuilder(soloCard, {
                        name: "solo.png",
                    });

                    // envoyer dans le channel
                    await channel.send({
                        files: [attachment],
                    });
                }

                await update_last_match(user.puuid, last_match);
            }
        }
    }

    setInterval(await refreshMatch, 15000);
}

export { startRiotHandler };
