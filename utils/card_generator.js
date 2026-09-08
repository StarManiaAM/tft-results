import {createCanvas, loadImage} from "canvas";
import logger from "./logger.js";

// Cache for loaded images to reduce API calls and improve performance
const imageCache = new Map();
const CACHE_MAX_SIZE = 200;
const CACHE_TTL = 3600000; // 1 hour

// Icône SVG op.gg convertie en Data URL (aucune requête réseau requise)
const GOLD_ICON_SVG = `data:image/svg+xml;base64,${Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 16 16">
  <path fill="#EAB308" fill-rule="evenodd" d="M14 7.299c0 .917-.965 1.758-2.4 2.213V10.9c0 1.368-2.148 2.568-4.8 2.568S2 12.267 2 10.899V8.835c0-.917.965-1.759 2.4-2.214V5.235c0-1.368 2.148-2.568 4.8-2.568s4.8 1.2 4.8 2.568zM9.2 9.867c-1.783 0-3.339-.543-4.167-1.314a4.8 4.8 0 0 0-1.113.534v1.56a4.8 4.8 0 0 0 2.88.768 4.8 4.8 0 0 0 2.88-.768v-.794a9 9 0 0 1-.48.014" clip-rule="evenodd"/>
</svg>
`).toString('base64')}`;

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
    mode = "solo",
    set
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
        let gameMode;
        if (mode === "solo")
            gameMode = "Solo Match";
        else if (mode === "doubleup")
            gameMode = "Double Up Match";
        else
            gameMode = "Classic Match";

        ctx.fillStyle = "white";
        ctx.font = "bold 28px Arial";
        ctx.textAlign = "left";
        ctx.fillText(
            gameMode,
            30,
            40
        );

        // Calcul des coûts
        const userCompCost = calculateCompCost(userUnits);

        // Main player info
        await drawPlayerHeader(
            ctx,
            user,
            rank,
            lpChange,
            placement,
            80,
            mode,
            set,
            userCompCost
        );

        // Main player comp
        await drawComp(
            ctx,
            userUnits,
            champSize,
            padding,
            cols,
            mode === "other" ? 140 : 180,
            set
        );

        // Teammate (if exists)
        if (teammate) {
            const teammateOffsetY = 250 + rowsUser * (champSize + padding);
            const teammateCompCost = calculateCompCost(teammateUnits);

            await drawPlayerHeader(
                ctx,
                teammate,
                teammate.rank,
                teammate.lpChange,
                null,
                teammateOffsetY,
                mode,
                set,
                teammateCompCost
            );

            await drawComp(
                ctx,
                teammateUnits,
                champSize,
                padding,
                cols,
                teammateOffsetY + 70,
                set
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

async function drawPlayerHeader(ctx, user, rank, lpChange, placement, offsetY, mode, set, compCost = 0) {
    try {
        const x = mode === "other" ? 30 : 140;

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
            const rankIconUrl = `https://c-tft-api.op.gg/img/set/${set}/tft-regalia/TFT_Regalia_${tierCaps}.png`;

            const icon = await loadImageWithCache(rankIconUrl, '#1a1a1a');

            ctx.drawImage(icon, 30, offsetY - 40, 90, 90);
        }

        // --- AFFICHAGE PLACEMENT ET COÛT EN GOLD ---
        const infoY = offsetY + (mode === 'other' ? 30 : 60);

        // 1. Placement (s'il existe)
        let currentX = x;
        if (placement !== null && placement !== undefined) {
            ctx.font = "20px Arial";
            ctx.fillStyle = placement <= 4 ? "#FFD700" : "yellow";
            const placementText = `Placement: #${placement}`;
            ctx.fillText(placementText, currentX, infoY);

            // On décale le X pour afficher les golds juste à côté s'il y a un placement
            currentX += ctx.measureText(placementText).width + 25;
        }

        // 2. Icône et valeur des Golds (CommunityDragon CDN asset officiel TFT)
        // Chargement immédiat sans appel réseau
        const goldIcon = await loadImageWithCache(GOLD_ICON_SVG, '#FFD700');
        const iconSize = 20;

        // Affichage de l'icône SVG et du texte
        ctx.drawImage(goldIcon, currentX, infoY - 16, iconSize, iconSize);

        ctx.font = "bold 20px Arial";
        ctx.fillStyle = "#FFD700";
        ctx.fillText(`${compCost}g`, currentX + iconSize + 6, infoY);

    } catch (err) {
        logger.error("Error drawing player header", {
            error: err.message,
            username: user?.username
        });
        // Continue despite error - partial render is better than failure
    }
}

function calculateCompCost(units) {
    if (!Array.isArray(units)) return 0;

    return units.reduce((total, unit) => {
        if (!unit) return total;

        const rarity = (unit.rarity !== undefined && unit.rarity !== null) ? unit.rarity : 0;
        const unitCost = rarity + 1; // Rareté 0 = 1 gold, Rareté 1 = 2 gold, etc.
        const tier = unit.tier || 1;

        let multiplier = 1;
        if (tier === 1) multiplier = 1;
        else if (tier === 2) multiplier = 3;
        else if (tier === 3) multiplier = 9;
        else if (tier === 24) multiplier = 27; // Pour les unités spéciales à 4 étoiles / 24

        return total + (unitCost * multiplier);
    }, 0);
}

async function drawComp(ctx, units, champSize, padding, cols, offsetY, set) {
    if (!Array.isArray(units) || units.length === 0) {
        logger.debug("No units to draw");
        return;
    }

    // Copie et tri du tableau selon la rareté (rarity) du champion
    // Ordre croissant : (a.rarity || 0) - (b.rarity || 0)  [Ex: Rareté 0 -> 5]
    // (Pour un ordre décroissant, inversez : b.rarity - a.rarity)
    const sortedUnits = [...units].sort((a, b) => {
        const rarityA = a?.rarity ?? 0;
        const rarityB = b?.rarity ?? 0;
        return rarityA - rarityB; 
    });

    const drawPromises = sortedUnits.map(async (unit, i) => {
        try {
            if (!unit || !unit.character_id) {
                logger.warn(`Invalid unit at index ${i}`, {unit});
                return;
            }

            const x = padding + (i % cols) * (champSize + padding);
            const y = offsetY + Math.floor(i / cols) * (champSize + padding);

            let champId = unit.character_id.toLowerCase().slice(3);
            if (set === 18) {
                champId = champId
                    .replace(new RegExp(`^18_`), '')
                    .replace(new RegExp(`_[a-zA-Z]+$`), '')
                    .replace(new RegExp(`18$`), '');
                champId = '18_' + champId;
            }
            if (champId === 'tft17_rhaast')
                champId = 'tft17_kayn_slay';
            if (champId === '18_gnarsmall')
                champId = '18_gnar';
            if (champId === '18_crimsonraptor')
                champId = '18_raptor';
            let champUrl = `https://c-tft-api.op.gg/img/set/${set}/tft-champion/tiles/tft${champId}.tft_set${set}.jpg`;
            if (champId === 'tft17_pve_elderdragon')
                champUrl = 'https://c-tft-api.op.gg/img/set/17/tft-champion/skills/TFT17_PVE_ElderDragon.png';
            if (champId === 'tft17_diana')
                champUrl = 'https://c-tft-api.op.gg/img/set/17/tft-champion/tiles/tft17_diana_teamplanner_splash.tft_set17.png';

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

                    const itemUrl = `https://c-tft-api.op.gg/img/set/${set}/tft-item/${item}.png`;
                    try {
                        const itemImg = await loadImageWithCache(itemUrl, '#444');
                        ctx.drawImage(itemImg, x + j * 20, y + champSize, 20, 20);
                    } catch (itemErr) {
                        logger.debug(`Failed to load item: ${item}`);
                        throw itemErr;
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
