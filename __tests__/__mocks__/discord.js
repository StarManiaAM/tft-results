export const MessageFlags = {
    Ephemeral: 64,
};

export const GatewayIntentBits = {
    Guilds: 1,
    GuildMessages: 512,
};

export const Events = {
    ClientReady: 'ready',
    InteractionCreate: 'interactionCreate',
    Error: 'error',
    Warn: 'warn',
    ShardDisconnect: 'shardDisconnect',
    ShardReconnecting: 'shardReconnecting',
    RateLimited: 'rateLimit',
};

export class Collection extends Map {}

export class Client {
    constructor() {
        this.commands = new Collection();
        this.user = { tag: 'TestBot#0000', id: '123', setPresence: jest.fn() };
        this.guilds = { cache: new Map() };
        this.channels = { cache: new Map() };
        this.listeners = {};
    }

    login = jest.fn().mockResolvedValue('token');
    destroy = jest.fn().mockResolvedValue(undefined);

    on(event, handler) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(handler);
    }

    once(event, handler) {
        this.on(event, handler);
    }

    emit(event, ...args) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(handler => handler(...args));
        }
    }
}

export class AttachmentBuilder {
    constructor(buffer, options) {
        this.buffer = buffer;
        this.name = options?.name;
    }
}

export class SlashCommandBuilder {
    constructor() {
        this.nameValue = '';
        this.descriptionValue = '';
        this.options = [];
    }

    setName(name) {
        this.nameValue = name;
        return this;
    }

    setDescription(desc) {
        this.descriptionValue = desc;
        return this;
    }

    addStringOption(fn) {
        const option = new StringOption();
        fn(option);
        this.options.push(option);
        return this;
    }

    toJSON() {
        return {
            name: this.nameValue,
            description: this.descriptionValue,
            options: this.options,
        };
    }
}

class StringOption {
    constructor() {
        this.nameValue = '';
        this.descriptionValue = '';
        this.requiredValue = false;
        this.choicesValue = [];
    }

    setName(name) {
        this.nameValue = name;
        return this;
    }

    setDescription(desc) {
        this.descriptionValue = desc;
        return this;
    }

    setRequired(required) {
        this.requiredValue = required;
        return this;
    }

    addChoices(...choices) {
        this.choicesValue.push(...choices);
        return this;
    }
}