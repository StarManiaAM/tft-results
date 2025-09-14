import { Sequelize, DataTypes } from "sequelize";
import { rankToNumeric } from "./rank_num.js";

const sequelize = new Sequelize({
  dialect: "sqlite",
  storage: "database/database.sqlite",
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
      type: DataTypes.TEXT,
      allowNull: false,
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
    attributes: [
      "puuid",
      "username",
      "tag",
      "region",
      "last_match",
      "rank_tier",
      "rank_division",
      "rank_lp",
      "doubleup_tier",
      "doubleup_division",
      "doubleup_lp",
    ],
  });
}

export async function get_user(puuid) {
  return await User.findOne({ where: { puuid: puuid } });
}

export async function update_last_match(puuid, last) {
  await User.update(
    { last_match: last },
    {
      where: {
        puuid: puuid,
      },
    }
  );
}

export async function update_rank_with_delta(puuid, rankInfo) {
  const user = await User.findOne({ where: { puuid } });

  let oldRank = {
    solo: {
      tier: user.rank_tier,
      division: user.rank_division,
      lp: user.lp,
    },
    doubleup: {
      tier: user.doubleup_tier,
      division: user.doubleup_division,
      lp: user.doubleup_lp,
    },
  };

  await User.update(
    {
      rank_tier: rankInfo.solo?.tier,
      rank_division: rankInfo.solo?.division,
      lp: rankInfo.solo?.lp,
      doubleup_tier: rankInfo.doubleup?.tier,
      doubleup_division: rankInfo.doubleup?.division,
      doubleup_lp: rankInfo.doubleup?.lp,
    },
    { where: { puuid } }
  );

  const oldPoints_s = rankToNumeric(
    oldRank.solo.tier,
    oldRank.solo.division,
    oldRank.solo.lp
  );
  const newPoints_s = rankToNumeric(
    rankInfo.solo.tier,
    rankInfo.solo.division,
    rankInfo.solo.lp
  );

  const oldPoints_d = rankToNumeric(
    oldRank.doubleup.tier,
    oldRank.doubleup.division,
    oldRank.doubleup.lp
  );
  const newPoints_d = rankToNumeric(
    rankInfo.doubleup.tier,
    rankInfo.doubleup.division,
    rankInfo.doubleup.lp
  );

  const deltas = {
    solo: newPoints_s - oldPoints_s,
    doubleup: newPoints_d - oldPoints_d,
  };

  return { oldRank, newRank: rankInfo, deltas };
}

export async function register_user(
  puuid,
  region,
  username,
  tag,
  lastMatch,
  rankInfo
) {
  try {
    await User.create({
      puuid,
      region,
      username,
      tag,
      last_match: lastMatch,
      rank_tier: rankInfo.solo?.tier || null,
      rank_division: rankInfo.solo?.division || null,
      rank_lp: rankInfo.solo?.lp,
      doubleup_tier: rankInfo.doubleup?.tier || null,
      doubleup_division: rankInfo.doubleup?.division || null,
      doubleup_lp: rankInfo.doubleup?.lp,
    });
  } catch (err) {
    console.error("Error registering user:", err);
    throw err;
  }
}

export async function user_exists(puuid) {
  const user = await User.findOne({
    where: { puuid },
  });
  return user !== null;
}
