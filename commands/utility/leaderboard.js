import {SlashCommandBuilder} from "discord.js";
import {get_all_users} from "../../utils/sql.js";
import {rankToNumeric} from "../../utils/rank_num.js";
import logger from "../../utils/logger.js";

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

        // Validate inputs
        if (!mode) {
            logger.error("Invalid mode provided", {mode});
            await interaction.editReply("> ❌ Invalid mode selected.")
            return;
        }

        logger.info(`Leaderboard request received for ${mode} mode`, {
            requestedBy: interaction.user.tag,
            userId: interaction.user.id
        });

        try {
            const users = await get_all_users();
            if (!users || users.length === 0) {
                logger.info("No users found.", {
                    mode
                });

                await interaction.reply(`> ℹ️ No data for ${mode}`);
                return;
            }

            const leaderboard = [];

            for (const user of users) {
                let rankData = null;
                if (mode === "Solo") {
                    rankData = {
                        tier: user.rank_tier,
                        division: user.rank_division,
                        lp: user.rank_lp
                    };
                } else if (mode === "Double UP") {
                    rankData = {
                        tier: user.doubleup_tier,
                        division: user.doubleup_division,
                        lp: user.doubleup_lp
                    };
                }

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

            logger.info("Leaderboard successfully generated", {
                mode,
                totalUsers: leaderboard.length
            });

            await interaction.reply(`>>> 🏆 Leaderboard ${mode}:\n${message}`);
        } catch (err) {
            logger.error("Failed to generate leaderboard", {
                error: err.message,
                stack: err.stack,
                mode
            });

            let errorMessage = `>>> ❌ Failed to generate leaderboard for **${mode}**.`;

            if (err.message.includes("timeout")) {
                errorMessage += `\n\nRequest timed out. Please try again later.`;
            } else if (err.response?.status === 403) {
                errorMessage += `\n\nAPI access forbidden. Please contact the administrator.`;
            } else if (err.response?.status === 429) {
                errorMessage += `\n\nRate limit exceeded. Try again in a few minutes.`;
            } else {
                errorMessage += `\n\nAn unexpected error occurred. The issue has been logged.`;
            }

            await interaction.editReply(errorMessage);
        }
    },
};
