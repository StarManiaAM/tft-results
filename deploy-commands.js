import "./utils/config.js";
import logger from "./utils/logger.js";
import {REST, Routes} from "discord.js";
import fs from "node:fs";
import path from "node:path";
import {config} from "./utils/config.js";

const guildId = config.guildId;
const token = config.discordToken;
const clientId = config.clientId;

if (!token || !clientId) {
    throw new Error("Discord token and client id must be set in .env file");
}

async function gatherCommands() {
    const commands = [];
    const foldersPath = path.resolve(process.cwd(), "commands");
    if (!fs.existsSync(foldersPath)) {
        logger.warn("Commands folder not found: " + foldersPath);
        return commands;
    }

    const commandFolders = fs.readdirSync(foldersPath, {withFileTypes: true}).filter(d => d.isDirectory()).map(d => d.name);

    for (const folder of commandFolders) {
        const commandsPath = path.join(foldersPath, folder);
        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith(".js"));

        for (const file of commandFiles) {
            const filePath = path.join(commandsPath, file);

            try {
                const imported = await import(`./${path.relative(process.cwd(), filePath).replaceAll("\\", "/")}`);
                const command = imported.default;

                if (command && command.data && command.execute) {
                    commands.push(command.data.toJSON());
                } else {
                    logger.warn(`The command at ${filePath} is missing "data" or "execute"`);
                }
            } catch (err) {
                logger.error(`Failed to import command file ${filePath}`, err);
            }
        }
    }
    return commands;
}

(async () => {
    try {
        const commands = await gatherCommands();
        const rest = new REST({version: "10"}).setToken(token);

        logger.info(`Started refreshing ${commands.length} application (/) commands.`);

        if (guildId) {
            const data = await rest.put(Routes.applicationGuildCommands(clientId, guildId), {body: commands});
            logger.info(`Successfully reloaded ${data.length} guild application (/) commands.`);
        } else {
            const data = await rest.put(Routes.applicationCommands(clientId), {body: commands});
            logger.info(`Successfully reloaded ${data.length} global application (/) commands.`);
        }
    } catch (error) {
        logger.error("Failed to deploy commands", error);
        process.exit(1);
    }
})();
