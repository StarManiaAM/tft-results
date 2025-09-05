import 'dotenv/config';
import { Client, GatewayIntentBits, Events } from 'discord.js';
import sqlite3 from "sqlite3";
import { init } from "./utils/sql.js";
import { startRiotHandler } from './handlers/new_game.js';

// Create a new client instance
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
    ] });

// Create the database
const db = new sqlite3.Database("database/database.db", sqlite3.OPEN_READWRITE);

// Once client is ready, run the bot
client.once(Events.ClientReady, async readyClient => {
    console.log(`Ready! Logged in as ${readyClient.user.tag}`);
    await init(db);
    await startRiotHandler(client, process.env.CHANNEL_ID);
});

// Log in to Discord with your client's token
await client.login(process.env.DISCORD_CLIENT_TOKEN);