import "./utils/config.js";
import logger from "./utils/logger.js";
import fs from 'node:fs';
import path from 'node:path';
import { Client, GatewayIntentBits, Events, Collection, MessageFlags } from 'discord.js';
import { init_database, close_database, checkDatabaseHealth } from "./utils/sql.js";
import { startRiotHandler } from './handlers/new_game.js';
import { config } from "./utils/config.js";

logger.logStartup();

// Create a new client instance
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
    ] });

client.commands = new Collection();

let riotHandlerCleanup = null;
let isShuttingDown = false;

async function loadCommands() {
    const foldersPath = path.resolve(process.cwd(), "commands");
    if (!fs.existsSync(foldersPath)) {
        logger.warn("Commands folder not found: " + foldersPath);
        return;
    }
    const commandFolders = fs.readdirSync(foldersPath, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
    let loadedCount = 0;
    let failedCount = 0;

    for (const folder of commandFolders) {
        const commandsPath = path.join(foldersPath, folder);
        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith(".js"));
        for (const file of commandFiles) {
            const filePath = path.join(commandsPath, file);
            try {
                const relativePath = path.relative(process.cwd(), filePath).replaceAll("\\", "/");
                const imported = await import(`./${relativePath}`);
                const command = imported.default;

                if (command && command.data && command.execute) {
                    client.commands.set(command.data.name, command);
                    logger.debug(`Loaded command ${command.data.name} from ${filePath}`);
                } else {
                    failedCount++;
                    logger.warn(`Command file ${file} is missing "data" or "execute" export`);
                }
            } catch (err) {
                failedCount++;
                logger.error(`Failed to import command from ${file}`, {
                    error: err.message,
                    stack: err.stack
                });
            }
        }
    }
    logger.info(`Commands loaded: ${loadedCount} successful, ${failedCount} failed`);
}

// Handle slash command interactions
client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);

    if (!command) {
        logger.warn(`Unknown command attempted: ${interaction.commandName}`, {
            user: interaction.user.tag,
            userId: interaction.user.id
        });

        await interaction.reply({
            content: "Unknown command.",
            ephemeral: true
        }).catch(err => logger.error("Failed to send unknown command reply", err));

        return;
    }

    logger.info(`Command executed: ${interaction.commandName}`, {
        user: interaction.user.tag,
        userId: interaction.user.id,
        guild: interaction.guild?.name,
        guildId: interaction.guild?.id
    });

    try {
        await command.execute(interaction);
    } catch (err) {
        logger.error(`Error executing command: ${interaction.commandName}`, {
            error: err.message,
            stack: err.stack,
            user: interaction.user.tag
        });
        const errorMessage = {
            content: "There was an error while executing this command. The issue has been logged.",
            flags: MessageFlags.Ephemeral
        };
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(errorMessage);
            } else {
                await interaction.reply(errorMessage);
            }
        } catch (replyErr) {
            logger.error("Failed to send error reply to user", {
                error: replyErr.message,
                commandName: interaction.commandName
            });
        }
    }
});

// Once client is ready, run the bot
client.once(Events.ClientReady, async (readyClient) => {
    logger.info(`Bot ready! Logged in as ${readyClient.user.tag}`, {
        userId: readyClient.user.id,
        guildCount: readyClient.guilds.cache.size
    });
    try {
        logger.info("Initializing database...");
        await init_database();
        const dbHealth = await checkDatabaseHealth();
        if (!dbHealth.healthy) {
            throw new Error(`Database unhealthy: ${dbHealth.message}`);
        }
        logger.info("Database initialized and healthy");

        logger.info("Starting Riot match handler...");
        riotHandlerCleanup = await startRiotHandler(client, config.channelId);
        logger.info("Riot match handler started successfully");

        readyClient.user.setPresence({
            activities: [{ name: 'TFT matches', type: 3 }], // Type 3 = Watching
            status: 'online'
        });

    } catch (err) {
        logger.fatal("Failed during bot initialization", {
            error: err.message,
            stack: err.stack
        });

        await shutdown(1);
    }
});


// Handle errors
client.on(Events.Error, (error) => {
    logger.error("Discord client error", {
        error: error.message,
        stack: error.stack
    });
});

// Handle warnings
client.on(Events.Warn, (warning) => {
    logger.warn("Discord client warning", { warning });
});

// Handle disconnections
client.on(Events.ShardDisconnect, (event, shardId) => {
    logger.warn("Shard disconnected", {
        shardId,
        code: event.code,
        reason: event.reason
    });
});

// Handle reconnections
client.on(Events.ShardReconnecting, (shardId) => {
    logger.info("Shard reconnecting", { shardId });
});

// Handle rate limits (for monitoring)
client.on(Events.RateLimited, (rateLimitData) => {
    logger.warn("Discord rate limit hit", {
        timeout: rateLimitData.timeout,
        limit: rateLimitData.limit,
        method: rateLimitData.method,
        path: rateLimitData.path,
        route: rateLimitData.route
    });
});

// Global error handlers
process.on("unhandledRejection", (reason, promise) => {
    logger.error("Unhandled Promise Rejection", {
        reason: reason instanceof Error ? reason.message : reason,
        stack: reason instanceof Error ? reason.stack : undefined
    });
});

process.on("uncaughtException", (err) => {
    logger.fatal("Uncaught Exception - Application will exit", {
        error: err.message,
        stack: err.stack
    });

    shutdown(1);
});

// Start the bot
async function start() {
    try {
        logger.info("Loading commands...");
        await loadCommands();

        logger.info("Logging in to Discord...");
        await client.login(config.discordToken);
        logger.info("Discord login initiated successfully");
    } catch (err) {
        logger.fatal("Failed to start bot", {
            error: err.message,
            stack: err.stack
        });
        process.exit(1);
    }
}

// Graceful shutdown handler
async function shutdown(exitCode = 0) {
    if (isShuttingDown) {
        logger.warn("Shutdown already in progress");
        return;
    }

    isShuttingDown = true;
    logger.logShutdown();

    const shutdownTimeout = setTimeout(() => {
        logger.warn("Forced shutdown after timeout");
        process.exit(1);
    }, 10000); // 10 second timeout

    try {
        // Stop Riot handler
        if (riotHandlerCleanup) {
            logger.info("Stopping Riot match handler...");
            riotHandlerCleanup();
            await new Promise(resolve => setTimeout(resolve, 1000)); // Give it time to stop
            logger.info("Riot match handler stopped");
        }

        // Close database connection
        logger.info("Closing database connection...");
        await close_database();
        logger.info("Database connection closed");

        // Destroy Discord client
        logger.info("Destroying Discord client...");
        await client.destroy();
        logger.info("Discord client destroyed");

        clearTimeout(shutdownTimeout);
        logger.info(`Shutdown complete. Exiting with code ${exitCode}`);

        // Give logger time to flush
        setTimeout(() => {
            process.exit(exitCode);
        }, 500);
    } catch (err) {
        logger.error("Error during shutdown", {
            error: err.message,
            stack: err.stack
        });
        clearTimeout(shutdownTimeout);
        process.exit(1);
    }
}

// Handle termination signals
process.on("SIGINT", () => {
    logger.info("Received SIGINT signal");
    shutdown(0);
});

process.on("SIGTERM", () => {
    logger.info("Received SIGTERM signal");
    shutdown(0);
});

// Handle Docker stop signal
process.on("SIGUSR2", () => {
    logger.info("Received SIGUSR2 signal (nodemon restart)");
    shutdown(0);
});

// Start the application
start();