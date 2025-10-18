import { createCanvas, loadImage } from "canvas";
import logger from "./logger.js";

// Cache for loaded images to reduce API calls and improve performance
const imageCache = new Map();
const CACHE_MAX_SIZE = 200;
const CACHE_TTL = 3600000; // 1 hour

function cleanImageCache() {
    if (imageCache.size > CACHE_MAX_SIZE) {
        const entriesToDelete = imageCache.size - CACHE_MAX_SIZE;
        const keys = Array.from(imageCache.keys());
        for (let i = 0; i < entriesToDelete; i++) {
            imageCache.delete(keys[i]);
        }
        logger.debug(`Cleaned ${entriesToDelete} entries from image cache`);
    }
}

async function loadImageWithCache(url, fallbackColor = '#333') {
    try {
        // Check cache first
        if (imageCache.has(url)) {
            const cached = imageCache.get(url);
            if (Date.now() - cached.timestamp < CACHE_TTL) {
                return cached.image;
            } else {
                imageCache.delete(url);
            }
        }

        const image = await loadImage(url);

        // Store in cache
        imageCache.set(url, {
            image,
            timestamp: Date.now()
        });

        cleanImageCache();

        return image;
    } catch (err) {
        logger.warn(`Failed to load image: ${url}`, {
            error: err.message
        });

        // Return a placeholder colored rectangle
        const canvas = createCanvas(60, 60);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = fallbackColor;
        ctx.fillRect(0, 0, 60, 60);
        return canvas;
    }
}

export async function generateMatchCard(
    user,
    data,
    rank,
    lpChange,
    placement,
    teammate = null,
    mode = "solo"
) {
    if (!user || !data || (!rank && mode !== "other")) {
        logger.error("generateMatchCard called with invalid parameters", {
            hasUser: !!user,
            hasData: !!data,
            hasRank: !!rank
        });
        throw new Error("Invalid parameters for match card generation");
    }

    const startTime = Date.now();

    try {
        const champSize = 60;
        const padding = 15;
        const cols = 10;

        // Validate units array
        const userUnits = Array.isArray(data.units) ? data.units : [];
        const teammateUnits = teammate?.data?.units && Array.isArray(teammate.data.units)
            ? teammate.data.units
            : [];

        const rowsUser = Math.ceil(userUnits.length / cols);
        const rowsTeammate = teammate ? Math.ceil(teammateUnits.length / cols) : 0;

        const width = cols * (champSize + padding) + padding;
        const height = 250 + (rowsUser + rowsTeammate) * (champSize + padding) + (rowsTeammate ? 100 : 0);

        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext("2d");

        // Background
        ctx.fillStyle = "#0e0e0e";
        ctx.fillRect(0, 0, width, height);

        // Header
        let gamemode;
        if (mode === "solo")
            gamemode = "Solo Match";
        else if (ode === "doubleup")
            gamemode = "Double Up Match";
        else
            gamemode = "Classic Match";

        ctx.fillStyle = "white";
        ctx.font = "bold 28px Arial";
        ctx.textAlign = "left";
        ctx.fillText(
            gamemode,
            30,
            40
        );

        // Main player info
        await drawPlayerHeader(
            ctx,
            user,
            rank,
            lpChange,
            placement,
            80,
            mode
        );

        // Main player comp
        await drawComp(
            ctx,
            userUnits,
            champSize,
            padding,
            cols,
            mode === "other" ? 140 : 180
        );

        // Teammate (if exists)
        if (teammate) {
            const teammateOffsetY = 250 + rowsUser * (champSize + padding);

            await drawPlayerHeader(
                ctx,
                teammate,
                teammate.rank,
                teammate.lpChange,
                null,
                teammateOffsetY,
                mode
            );

            await drawComp(
                ctx,
                teammateUnits,
                champSize,
                padding,
                cols,
                teammateOffsetY + 70
            );
        }

        const duration = Date.now() - startTime;
        logger.debug(`Generated ${mode} match card in ${duration}ms`, {
            username: user.username,
            placement,
            unitsCount: userUnits.length,
            teammateUnitsCount: teammateUnits.length
        });

        return canvas.toBuffer("image/png");
    } catch (err) {
        logger.error("Failed to generate match card", {
            error: err.message,
            stack: err.stack,
            username: user?.username,
            mode
        });
        throw err;
    }
}

async function drawPlayerHeader(ctx, user, rank, lpChange, placement, offsetY, mode) {
    try {
        const x = mode === "other" ?  30 : 140;
        // Validate rank object
        const safeRank = {
            tier: rank?.tier || "UNRANKED",
            division: rank?.division || "",
            lp: rank?.lp || 0
        };

        // Username
        ctx.fillStyle = "white";
        ctx.font = "bold 24px Arial";
        ctx.textAlign = "left";
        const username = user.username || "Unknown Player";
        ctx.fillText(username, x, offsetY);

        // Rank info
        if (mode !== "other") {
            ctx.font = "20px Arial";
            ctx.fillStyle = "#ccc";
            ctx.fillText(
                `${safeRank.tier} ${safeRank.division} ${safeRank.lp} LP${lpChange || ""}`,
                140,
                offsetY + 30
            );

            // Rank icon
            const tierLower = safeRank.tier.toLowerCase();
            const tierCaps = tierLower.charAt(0).toUpperCase() + tierLower.slice(1);
            const rankIconUrl = `https://c-tft-api.op.gg/img/set/15/tft-regalia/TFT_Regalia_${tierCaps}.png`;

            const icon = await loadImageWithCache(rankIconUrl, '#1a1a1a');
            ctx.drawImage(icon, 30, offsetY - 40, 90, 90);
        }

        // Placement (if provided)
        if (placement !== null && placement !== undefined) {
            ctx.font = "20px Arial";
            ctx.fillStyle = placement <= 4 ? "#FFD700" : "yellow";
            ctx.fillText(`Placement: #${placement}`, x, offsetY + (mode === 'other' ? 30 : 60));
        }

    } catch (err) {
        logger.error("Error drawing player header", {
            error: err.message,
            username: user?.username
        });
        // Continue despite error - partial render is better than failure
    }
}

async function drawComp(ctx, units, champSize, padding, cols, offsetY) {
    if (!Array.isArray(units) || units.length === 0) {
        logger.debug("No units to draw");
        return;
    }

    const drawPromises = units.map(async (unit, i) => {
        try {
            if (!unit || !unit.character_id) {
                logger.warn(`Invalid unit at index ${i}`, { unit });
                return;
            }

            const x = padding + (i % cols) * (champSize + padding);
            const y = offsetY + Math.floor(i / cols) * (champSize + padding);

            const champId = unit.character_id.toLowerCase();
            const champUrl = `https://c-tft-api.op.gg/img/set/15/tft-champion/tiles/${champId}.tft_set15.png`;

            // Draw champion
            const img = await loadImageWithCache(champUrl, '#2a2a2a');
            ctx.drawImage(img, x, y, champSize, champSize);

            // Draw stars
            const tier = Math.min(Math.max(unit.tier || 1, 1), 3);
            ctx.fillStyle = "#FFD700";
            ctx.font = "bold 16px Arial";
            ctx.textAlign = "center";
            ctx.fillText("★".repeat(tier), x + champSize / 2, y + champSize - 5);

            // Draw items
            if (Array.isArray(unit.itemNames)) {
                const itemPromises = unit.itemNames.slice(0, 3).map(async (item, j) => {
                    if (!item) return;

                    const itemUrl = `https://c-tft-api.op.gg/img/set/15/tft-item/${item}.png`;
                    try {
                        const itemImg = await loadImageWithCache(itemUrl, '#444');
                        ctx.drawImage(itemImg, x + j * 20, y + champSize, 20, 20);
                    } catch (itemErr) {
                        logger.debug(`Failed to load item: ${item}`);
                    }
                });

                await Promise.all(itemPromises);
            }
        } catch (unitErr) {
            logger.warn(`Error drawing unit at index ${i}`, {
                error: unitErr.message,
                characterId: unit?.character_id
            });
            // Continue with next unit
        }
    });

    await Promise.allSettled(drawPromises);
}

// Clear cache on demand (useful for testing or memory management)
export function clearImageCache() {
    imageCache.clear();
    logger.info("Image cache cleared");
}

export function getImageCacheStats() {
    return {
        size: imageCache.size,
        maxSize: CACHE_MAX_SIZE,
        ttl: CACHE_TTL
    };
}