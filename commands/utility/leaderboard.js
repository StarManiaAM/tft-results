import {SlashCommandBuilder} from "discord.js";
import {get_all_users} from "../../utils/sql.js";
import {rankToNumeric} from "../../utils/rank_num.js";

export default {
    data: new SlashCommandBuilder()
        .setName("leaderboard")
        .setDescription("Print the leaderboard")
        .addStringOption((option) =>
            option
                .setName("mode")
                .setDescription("The game mode you want")
                .setRequired(true)
                .addChoices(
                    {name: "Solo", value: "Solo"},
                    {name: "Double UP", value: "Double UP"}
                )
        ),

    async execute(interaction) {
        const mode = interaction.options.getString("mode");
        try {
            const users = await get_all_users();
            const leaderboard = [];

            for (const user of users) {
                let rankData =
                    mode === "Solo"
                        ? {
                            tier: user.rank_tier,
                            division: user.rank_division,
                            lp: user.rank_lp,
                        }
                        : {
                            tier: user.doubleup_tier,
                            division: user.doubleup_division,
                            lp: user.doubleup_lp,
                        };

                if (rankData) {
                    const points = rankToNumeric(
                        rankData.tier,
                        rankData.division,
                        rankData.lp
                    );

                    leaderboard.push({
                        name: `${user.username}#${user.tag}`,
                        points,
                        rankStr: `${rankData.tier} ${rankData.division || ""} ${
                            rankData.lp
                        } LP`,
                    });

                } else {
                    leaderboard.push({
                        name: `${user.username}#${user.tag}`,
                        points: 0,
                        rankStr: "Unranked",
                    });
                }
            }

            leaderboard.sort((a, b) => b.points - a.points);

            const message = leaderboard
                .map((u, i) => `${i + 1}. ${u.name} - ${u.rankStr}`)
                .join("\n");

            await interaction.reply(`Leaderboard ${mode}:\n${message}`);
        } catch (err) {
            console.log(err);
            await interaction.reply(`No data`);
        }
    },
};
