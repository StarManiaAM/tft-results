import 'dotenv/config';
import { Client, GatewayIntentBits, Events, Collection } from 'discord.js';
import { init_database } from "./utils/sql.js";
import { startRiotHandler } from './handlers/new_game.js';


// Create a new client instance
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
    ] });

client.commands = new Collection();
import registerCommand from './commands/utility/register.js';
client.commands.set(registerCommand.data.name, registerCommand);
import leaderboardCommand from './commands/utility/leaderboard.js';
client.commands.set(leaderboardCommand.data.name, leaderboardCommand);

client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) {
        console.error(`No command matching ${interaction.commandName} was found.`);
        return;
    }

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(error);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: 'There was an error while executing this command!', flags: MessageFlags.Ephemeral });
        } else {
            await interaction.reply({ content: 'There was an error while executing this command!', flags: MessageFlags.Ephemeral });
        }
    }
});

// Once client is ready, run the bot
client.once(Events.ClientReady, async readyClient => {
    console.log(`Ready! Logged in as ${readyClient.user.tag}`);

    await init_database();
    await startRiotHandler(client, process.env.CHANNEL_ID);
});

// Log in to Discord with your client's token
await client.login(process.env.DISCORD_CLIENT_TOKEN);