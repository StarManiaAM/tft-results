import { Sequelize, DataTypes } from 'sequelize';

const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: 'database/database.sqlite'
});

const User = sequelize.define(
    "User",
    {
        puuid: {
            type: DataTypes.STRING(78),
            primaryKey: true,
            unique: true,
            allowNull: false,
        },
        region: {
            type: DataTypes.TEXT,

            allowNull: false,
        },
        username: {
            type: DataTypes.TEXT,
            allowNull: false,
        },
        tag: {
            type: DataTypes.STRING(3),
            allowNull: false,
        },
        last_match: {
            type: DataTypes.STRING(15),
            allowNull: true,
        },
    },
    {
        tableName: "users",
        timestamps: true,
    }
);

export async function init_database() {
    try {
        await sequelize.authenticate();
        await sequelize.sync(); // use { force: true } if you want to drop & recreate
    } catch (err) {
        console.error("Database error:", err);
    }
}

export async function get_all_users() {
    return await User.findAll({
        attributes: ['puuid', 'username', 'region', 'last_match'],
    });
}

export async function update_last_match(puuid, last) {
    await User.update(
        { last_match: last },
        {
            where: {
                puuid: puuid,
            },
        },
    );
}