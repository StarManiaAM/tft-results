import { Sequelize, DataTypes } from 'sequelize';

export async function init_database() {
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
        }
    );

    try {
        await sequelize.authenticate();
        console.log("✅ Database connected");

        await sequelize.sync(); // use { force: true } if you want to drop & recreate
        console.log("✅ Tables created/synced");
    } catch (err) {
        console.error("❌ Database error:", err);
    }
}