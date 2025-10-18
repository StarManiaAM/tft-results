const divisionValues = {I: 300, II: 200, III: 100, IV: 0};

const tierValues = [
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
    const tierBase = tierValues.indexOf(tier.toUpperCase()) * 400;
    const divisionBase = divisionValues[division.toUpperCase()] || 0;
    return tierBase + divisionBase + lp;
}