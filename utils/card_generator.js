import { createCanvas, loadImage } from "canvas";

export async function generateMatchCard(
    user,
    data,
    rank,
    lpChange,
    placement,
    teammate = null // { user, data, rank, lpChange }
) {
    const champSize = 60;
    const padding = 15;
    const cols = 10;

    const rowsUser = Math.ceil(data.units.length / cols);

    const rowsTeammate = teammate
        ? Math.ceil(teammate.data.units.length / cols)
        : 0;

    const width = cols * (champSize + padding) + padding;
    const height =
        250 +
        (rowsUser + rowsTeammate) * (champSize + padding) +
        rowsTeammate * 100;

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    // --- Background
    ctx.fillStyle = "#0e0e0e";
    ctx.fillRect(0, 0, width, height);

    // --- Header (Solo / Double Up)
    ctx.fillStyle = "white";
    ctx.font = "28px Arial";
    ctx.textAlign = "left";
    ctx.fillText(teammate ? "Double Up Match" : "Solo Match", 30, 40);

    // --- Infos joueur principal ---
    await drawPlayerHeader(ctx, user, rank, lpChange, placement, 80);

    // --- Champs du joueur principal ---
    await drawComp(ctx, data.units, champSize, padding, cols, 180);

    if (teammate) {
        // --- Infos teammate ---
        await drawPlayerHeader(
            ctx,
            teammate,
            teammate.rank,
            teammate.lpChange,
            null,
            250 + rowsUser * (champSize + padding)
        );

        // --- Champs teammate ---
        await drawComp(
            ctx,
            teammate.data.units,
            champSize,
            padding,
            cols,
            320 + rowsUser * (champSize + padding)
        );
    }

    return canvas.toBuffer("image/png");
}


async function drawPlayerHeader(ctx, user, rank, lpChange, placement, offsetY) {
    ctx.fillStyle = "white";
    ctx.font = "24px Arial";
    ctx.textAlign = "left";
    ctx.fillText(user.username, 140, offsetY);

    ctx.font = "20px Arial";
    ctx.fillStyle = "#ccc";
    ctx.fillText(
        `${rank.tier} ${rank.division} ${rank.lp} LP${lpChange}`,
        140,
        offsetY + 30
    );

    if (placement) {
        ctx.font = "20px Arial";
        ctx.fillStyle = "yellow";
        ctx.fillText(`Placement: ${placement}`, 140, offsetY + 60);
    }

    let r_caps = rank.tier.toLowerCase();
    r_caps = r_caps.charAt(0).toUpperCase() + r_caps.slice(1);
    const rankIconUrl = `https://c-tft-api.op.gg/img/set/15/tft-regalia/TFT_Regalia_${r_caps}.png`;
    try {
        const icon = await loadImage(rankIconUrl);
        ctx.drawImage(icon, 30, offsetY - 40, 90, 90);
    } catch (err) {
        console.warn("Rank icon not found or could not load:", rankIconUrl);
    }
}

async function drawComp(ctx, units, champSize, padding, cols, offsetY) {
    for (let i = 0; i < units.length; i++) {
        const unit = units[i];
        const x = padding + (i % cols) * (champSize + padding);
        const y = offsetY + Math.floor(i / cols) * (champSize + padding);

        const champId = unit.character_id.toLowerCase();
        const champUrl = `https://c-tft-api.op.gg/img/set/15/tft-champion/tiles/${champId}.tft_set15.png`;

        try {
            const img = await loadImage(champUrl);
            ctx.drawImage(img, x, y, champSize, champSize);
        } catch {
            console.warn("Could not load champ:", champId);
        }

        // Stars
        ctx.fillStyle = "yellow";
        ctx.font = "16px Arial";
        ctx.textAlign = "center";
        ctx.fillText(
            "★".repeat(unit.tier),
            x + champSize / 2,
            y + champSize - 5
        );

        // Items
        for (let j = 0; j < unit.itemNames.length; j++) {
            const item = unit.itemNames[j];
            const itemUrl = `https://c-tft-api.op.gg/img/set/15/tft-item/${item}.png`;
            try {
                const itemImg = await loadImage(itemUrl);
                ctx.drawImage(itemImg, x + j * 20, y + champSize, 20, 20);
            } catch {
                console.warn("Could not load item:", item);
            }
        }
    }
}
