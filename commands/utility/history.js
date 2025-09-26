import {AttachmentBuilder, SlashCommandBuilder} from "discord.js";
import {get_user, getPUUID, register_user, user_exists} from "../../utils/sql.js";
import { rankToNumeric } from "../../utils/rank_num.js";
import {getLastMatch, getRank, getMatchHistory} from "../../utils/api.js";
import {generateMatchCard} from "../../utils/card_generator.js";

export default {
  data: new SlashCommandBuilder()
    .setName("history")
    .setDescription("Get match history of a player")
      .addStringOption(option =>
          option.setName('username')
              .setDescription('Player in-game username')
              .setRequired(true))
      .addStringOption(option =>
          option.setName('tag')
              .setDescription('Player in-game tag (e.g. #EUW)')
              .setRequired(true))
      .addStringOption(option =>
          option.setName('region')
              .setDescription('Select player region')
              .setRequired(true)
              .addChoices(
                  { name: 'America', value: 'america' },
                  { name: 'Europe', value: 'europe' },
                  { name: 'Asia', value: 'asia' },
              ))
      .addIntegerOption(option =>
      option.setName('size')
          .setDescription('History size')
          .setMinValue(1)
          .setMaxValue(10)),

  async execute(interaction) {
      try {
          const puuid = await getPUUID(interaction.options.region, interaction.options.username, interaction.options.tag);

          // envoyer dans le channel
          await channel.send({
              files: [attachment],
          });
      }
      catch (err) {
          console.log(err);
          await interaction.reply(
              `**${username}#${tag}** in ${region} not found.`
          );
      }
  },
};
