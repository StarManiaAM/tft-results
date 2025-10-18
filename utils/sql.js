import { Sequelize, DataTypes } from "sequelize";
import { rankToNumeric } from "./rank_num.js";
import logger from "./logger.js";

const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: 'database/database.sqlite',
    logging: (msg) => logger.debug(`[Sequelize] ${msg}`),
    pool: {
    max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000
},
retry: {
    max: 3,
        match: [
        /SQLITE_BUSY/,
    ]
}
});

const User = sequelize.define(
  "User",
  {
    puuid: {
      type: DataTypes.STRING(78),
      primaryKey: true,
      unique: true,
      allowNull: false,
        validate: {
            notEmpty: true,
            len: 78
        }
    },
    region: {
      type: DataTypes.STRING(10),
      allowNull: false,
        validate: {
            notEmpty: true,
            isIn: [['americas', 'europe', 'asia', 'sea']]
        }
    },
      plateform: {
        type: DataTypes.STRING(4),
          allowNull: false,
          validate: {
              notEmpty: true,
              isIn: [['na1',
'br1',
'la1',
'la2' ,
 'oc1' ,
'euw1' ,
 'eun1',
'tr1' ,
'ru' ,
 'kr' ,
 'jp1' ,
 'ph2' ,
'sg2' ,
 'th2' ,
'tw2' ,'vn2']]
          }
      },
    username: {
      type: DataTypes.STRING(100),
      allowNull: false,
        validate: {
            notEmpty: true,
            len: [1, 100]
        }
    },
    tag: {
      type: DataTypes.STRING(20),
      allowNull: false,
        validate: {
            notEmpty: true,
            len: [1, 20]
        }
    },
    last_match: {
      type: DataTypes.STRING(15),
      allowNull: true,
    },
    rank_tier: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    rank_division: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    rank_lp: {
      type: DataTypes.INTEGER,
      allowNull: true,
        defaultValue: 0,
        validate: {
            min: 0
        }
    },
    doubleup_tier: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    doubleup_division: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    doubleup_lp: {
      type: DataTypes.INTEGER,
      allowNull: true,
        defaultValue: 0,
        validate: {
            min: 0
        }
    },
  },
  {
    tableName: "users",
    timestamps: true,
  }
);

let isConnected = false;
let connectionAttempts = 0;
const MAX_CONNECTION_ATTEMPTS = 5;

export async function init_database() {
    while (connectionAttempts < MAX_CONNECTION_ATTEMPTS && !isConnected) {
        try {
            await sequelize.authenticate();
            logger.info("Database connection established successfully");

            await sequelize.sync({ alter: false }); // Use migrations in production
            logger.info("Database synchronized");

            isConnected = true;
            connectionAttempts = 0;
            return true;
        } catch (err) {
            connectionAttempts++;
            logger.error(`Database connection failed (attempt ${connectionAttempts}/${MAX_CONNECTION_ATTEMPTS})`, {
                error: err.message,
                stack: err.stack
            });

            if (connectionAttempts >= MAX_CONNECTION_ATTEMPTS) {
                logger.fatal("Failed to connect to database after maximum attempts");
                throw new Error("Database connection failed");
            }

            // Exponential backoff
            const backoffMs = Math.min(1000 * Math.pow(2, connectionAttempts), 30000);
            logger.info(`Retrying database connection in ${backoffMs}ms`);
            await new Promise(resolve => setTimeout(resolve, backoffMs));
        }
    }
    return false;
}

export async function checkDatabaseHealth() {
    try {
        await sequelize.authenticate();
        return { healthy: true, message: "Database connection OK" };
    } catch (err) {
        logger.error("Database health check failed", { error: err.message });
        return { healthy: false, message: err.message };
    }
}

export async function get_all_users() {
    try {
        const users = await User.findAll({
            attributes: [
                "puuid",
                "username",
                "tag",
                "region",
                "plateform",
                "last_match",
                "rank_tier",
                "rank_division",
                "rank_lp",
                "doubleup_tier",
                "doubleup_division",
                "doubleup_lp",
            ],
            raw: true
        });

        logger.debug(`Retrieved ${users.length} users from database`);
        return users;
    } catch (err) {
        logger.error("Failed to retrieve users", {
            error: err.message,
            stack: err.stack
        });
        throw err;
    }
}

export async function get_user(puuid) {
    if (!puuid) {
        logger.warn("get_user called with empty puuid");
        return null;
    }

    try {
        const user = await User.findOne({
            where: { puuid },
            raw: true
        });

        if (!user) {
            logger.debug(`User not found: ${puuid.substring(0, 8)}...`);
        }

        return user;
    } catch (err) {
        logger.error(`Failed to get user ${puuid.substring(0, 8)}...`, {
            error: err.message,
            stack: err.stack
        });
        throw err;
    }
}

export async function update_last_match(puuid, last) {
    if (!puuid || !last) {
        logger.warn("update_last_match called with invalid parameters", {
            puuid: !!puuid,
            last: !!last
        });
        return false;
    }

    try {
        const [affectedRows] = await User.update(
            { last_match: last },
            { where: { puuid } }
        );

        if (affectedRows === 0) {
            logger.warn(`No user found to update last_match for puuid ${puuid.substring(0, 8)}...`);
            return false;
        }

        logger.debug(`Updated last_match for ${puuid.substring(0, 8)}... to ${last}`);
        return true;
    } catch (err) {
        logger.error(`Failed to update last_match for ${puuid.substring(0, 8)}...`, {
            error: err.message,
            matchId: last
        });
        throw err;
    }
}

export async function update_rank_with_delta(puuid, rankInfo) {
    if (!puuid) {
        logger.warn("update_rank_with_delta called with empty puuid");
        throw new Error("Invalid puuid provided");
    }

    if (!rankInfo) {
        logger.warn("update_rank_with_delta called with null rankInfo");
        throw new Error("Invalid rankInfo provided");
    }

    const transaction = await sequelize.transaction();

    try {
        const user = await User.findOne({
            where: { puuid },
            transaction,
            lock: transaction.LOCK.UPDATE
        });

        if (!user) {
            await transaction.rollback();
            logger.error(`User not found for rank update: ${puuid.substring(0, 8)}...`);
            throw new Error(`User not found: ${puuid}`);
        }

        const oldRank = {
            solo: {
                tier: user.rank_tier,
                division: user.rank_division,
                lp: user.rank_lp,
            },
            doubleup: {
                tier: user.doubleup_tier,
                division: user.doubleup_division,
                lp: user.doubleup_lp,
            },
        };

        // Calculate deltas
        const oldPoints_s = oldRank.solo?.tier
            ? rankToNumeric(oldRank.solo.tier, oldRank.solo.division || "", oldRank.solo.lp || 0)
            : 0;
        const newPoints_s = rankInfo.solo?.tier
            ? rankToNumeric(rankInfo.solo.tier, rankInfo.solo.division || "", rankInfo.solo.lp || 0)
            : 0;

        const oldPoints_d = oldRank.doubleup?.tier
            ? rankToNumeric(oldRank.doubleup.tier, oldRank.doubleup.division || "", oldRank.doubleup.lp || 0)
            : 0;
        const newPoints_d = rankInfo.doubleup?.tier
            ? rankToNumeric(rankInfo.doubleup.tier, rankInfo.doubleup.division || "", rankInfo.doubleup.lp || 0)
            : 0;

        const deltas = {
            solo: oldPoints_s > 0 ? newPoints_s - oldPoints_s : null,
            doubleup: oldPoints_d > 0 ? newPoints_d - oldPoints_d : null,
        };

        // Update user rank
        await User.update(
            {
                rank_tier: rankInfo.solo?.tier || null,
                rank_division: rankInfo.solo?.division || null,
                rank_lp: rankInfo.solo?.lp || 0,
                doubleup_tier: rankInfo.doubleup?.tier || null,
                doubleup_division: rankInfo.doubleup?.division || null,
                doubleup_lp: rankInfo.doubleup?.lp || 0,
            },
            {
                where: { puuid },
                transaction
            }
        );

        await transaction.commit();

        logger.debug(`Updated rank for ${puuid.substring(0, 8)}...`, {
            soloChange: deltas.solo !== null ? `${deltas.solo > 0 ? '+' : ''}${deltas.solo} LP` : 'N/A',
            doubleupChange: deltas.doubleup !== null ? `${deltas.doubleup > 0 ? '+' : ''}${deltas.doubleup} LP` : 'N/A'
        });

        return { oldRank, newRank: rankInfo, deltas };
    } catch (err) {
        await transaction.rollback();
        logger.error(`Failed to update rank for ${puuid.substring(0, 8)}...`, {
            error: err.message,
            stack: err.stack
        });
        throw err;
    }
}

export async function register_user(puuid, region, plateform, username, tag, lastMatch, rankInfo) {
    if (!puuid || !region || !plateform || !username || !tag) {
        logger.error("register_user called with missing required parameters", {
            puuid: !!puuid,
            region: !!region,
            plateform: !!plateform,
            username: !!username,
            tag: !!tag
        });
        throw new Error("Missing required parameters for user registration");
    }
    try {
        const user = await User.create({
            puuid,
            region,
            plateform,
            username,
            tag,
            last_match: lastMatch || null,
            rank_tier: rankInfo?.solo?.tier || null,
            rank_division: rankInfo?.solo?.division || null,
            rank_lp: rankInfo?.solo?.lp || 0,
            doubleup_tier: rankInfo?.doubleup?.tier || null,
            doubleup_division: rankInfo?.doubleup?.division || null,
            doubleup_lp: rankInfo?.doubleup?.lp || 0,
        });

        logger.info(`Registered new user: ${username}#${tag}`, {
            puuid: puuid.substring(0, 8) + '...',
            region,
            plateform,
            soloRank: rankInfo?.solo ? `${rankInfo.solo.tier} ${rankInfo.solo.division} ${rankInfo.solo.lp}LP` : 'Unranked',
            doubleupRank: rankInfo?.doubleup ? `${rankInfo.doubleup.tier} ${rankInfo.doubleup.division} ${rankInfo.doubleup.lp}LP` : 'Unranked'
        });
        return user;
    } catch (err) {
        if (err.name === 'SequelizeUniqueConstraintError') {
            logger.warn(`User already exists: ${username}#${tag} (${puuid.substring(0, 8)}...)`);
            throw new Error(`User ${username}#${tag} is already registered`);
        }

        if (err.name === 'SequelizeValidationError') {
            logger.error("Validation error during user registration", {
                username: `${username}#${tag}`,
                errors: err.errors.map(e => ({ field: e.path, message: e.message }))
            });
            throw new Error(`Invalid user data: ${err.errors[0].message}`);
        }

        logger.error(`Failed to register user ${username}#${tag}`, {
            error: err.message,
            stack: err.stack
        });
        throw err;
    }
}

export async function user_exists(puuid) {
    if (!puuid) {
        logger.warn("user_exists called with empty puuid");
        return false;
    }

    try {
        const count = await User.count({ where: { puuid } });
        return count > 0;
    } catch (err) {
        logger.error(`Failed to check user existence for ${puuid.substring(0, 8)}...`, {
            error: err.message
        });
        throw err;
    }
}

export async function delete_user(puuid) {
    if (!puuid) {
        logger.warn("delete_user called with empty puuid");
        return false;
    }

    try {
        const deleted = await User.destroy({ where: { puuid } });

        if (deleted > 0) {
            logger.info(`Deleted user: ${puuid.substring(0, 8)}...`);
            return true;
        } else {
            logger.warn(`No user found to delete: ${puuid.substring(0, 8)}...`);
            return false;
        }
    } catch (err) {
        logger.error(`Failed to delete user ${puuid.substring(0, 8)}...`, {
            error: err.message
        });
        throw err;
    }
}

export async function close_database() {
    try {
        await sequelize.close();
        isConnected = false;
        logger.info("Database connection closed");
    } catch (err) {
        logger.error("Error closing database connection", {
            error: err.message
        });
        throw err;
    }
}