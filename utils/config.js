import dotenv from "dotenv";
dotenv.config();
import logger from "./logger.js";

const required = [
    "DISCORD_CLIENT_TOKEN",
    "CLIENT_ID",
    "RIOT_API_KEY",
    "CHANNEL_ID",
];

for (const key of required) {
    if (!process.env[key]) {
        logger.error(`Missing required environment variable: ${key}`);
        throw new Error(`Missing required environment variable: ${key}`);
    }
}

export const config = {
    discordToken: process.env.DISCORD_CLIENT_TOKEN,
    clientId: process.env.CLIENT_ID,
    guildId: process.env.GUILD_ID || null,
    riotApiKey: process.env.RIOT_API_KEY,
    channelId: process.env.CHANNEL_ID,
    pollIntervalMs: Number(process.env.POLL_INTERVAL_MS) || 15000,
    nodeEnv: process.env.NODE_ENV || "development",
};
