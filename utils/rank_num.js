const divisionValues = {I: 300, II: 200, III: 100, IV: 0};

const tierValues = [
    "UNRANKED",  // Index 0 = 0 points
    "IRON",
    "BRONZE",
    "SILVER",
    "GOLD",
    "PLATINUM",
    "EMERALD",
    "DIAMOND",
    "MASTER",
    "GRANDMASTER",
    "CHALLENGER",
];

export function rankToNumeric(tier, division, lp) {
    // Treat null/empty tier as UNRANKED
    if (!tier || tier.trim() === "") {
        tier = "UNRANKED";
    }

    const tierIndex = tierValues.indexOf(tier.toUpperCase());

    // If tier not found in array, treat as UNRANKED (0 points)
    if (tierIndex === -1) {
        return 0;
    }

    const tierBase = tierIndex * 400;
    const divisionBase = division ? (divisionValues[division.toUpperCase()] || 0) : 0;
    return tierBase + divisionBase + (lp || 0);
}