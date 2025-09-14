import { SlashCommandBuilder } from 'discord.js';
import { register_user, user_exists } from '../../utils/sql.js'
import { getLastMatch, getPUUID, getRank } from "../../utils/api.js";


export default {
    data: new SlashCommandBuilder()
        .setName('register')
        .setDescription('Register a new user to be tracked')
        .addStringOption(option =>
            option.setName('username')
                .setDescription('Your in-game username')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('tag')
                .setDescription('Your in-game tag (e.g. #EUW)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('region')
                .setDescription('Select your region')
                .setRequired(true)
                .addChoices(
                    { name: 'America', value: 'america' },
                    { name: 'Europe', value: 'europe' },
                    { name: 'Asia', value: 'asia' },
                )),
    async execute(interaction) {
        const username = interaction.options.getString('username');
        let tag = interaction.options.getString('tag');
        if (tag.startsWith('#'))
            tag = tag.slice(1);
        const region = interaction.options.getString('region');
        try {
            const puuid = await getPUUID(region, username, tag);
            if (await user_exists(puuid)) {
                await interaction.reply(
                    `**${username}#${tag}** is already tracked !`
                );
                return;
            }
            const lastMatch = await getLastMatch(puuid, region);

            const rankInfo = await getRank(puuid, "euw1");

            await register_user(puuid, region, username, tag, lastMatch, rankInfo);

            await interaction.reply(
                `Registered user: **${username}#${tag}**.`
            );
        }
        catch (err) {
            console.log(err);
            await interaction.reply(
                `**${username}#${tag}** in ${region} not found.`
            );
        }
    },

};