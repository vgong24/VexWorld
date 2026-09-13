import { clamp, distance } from './utils.mjs';

export function weatherCostMultiplier(weather, laws) {
  if (weather === 'RAIN') return laws.resource.rainMultiplier ?? 1.35;
  if (weather === 'SNOW') return 1.45;
  if (weather === 'SAND_WIND') return 1.55;
  if (weather === 'MIST') return 1.1;
  if (weather === 'UPDRAFT') {
    const multiplier = laws.resource.updraftMultiplier;
    if (!(multiplier > 0)) throw new TypeError('UPDRAFT requires positive laws.resource.updraftMultiplier');
    return multiplier;
  }
  return 1;
}

export function nearestCompatibleRestoration(member, restorationPoints) {
  const compatible = restorationPoints
    .filter((point) => point.methods.some((method) => member.resources.restorationMethods.includes(method)))
    .map((point) => ({ ...point, distance: distance(member.body, point) }))
    .sort((a, b) => a.distance - b.distance);
  return compatible[0] || null;
}

export function classifyReturnMargin({ margin, maxEnergy, requiredReserve }) {
  if (margin <= 0) return 'PROTECTIVE_RETURN_OR_HALT';
  const ratio = margin / Math.max(1, maxEnergy);
  if (margin <= requiredReserve * 0.65 || ratio <= 0.08) return 'RETURN_MARGIN_LOW';
  if (ratio <= 0.2) return 'RESTORATION_RECOMMENDED';
  if (ratio <= 0.38) return 'RESTORATION_AWARE';
  return 'AVAILABLE_MARGIN';
}

export function updateResourceProjection(member, world) {
  const nearest = nearestCompatibleRestoration(member, world.map.restorationPoints);
  const weatherMultiplier = weatherCostMultiplier(world.weather.state, world.laws);
  const terrainMultiplier = world.weather.state === 'RAIN' ? 1.15 : world.weather.state === 'SNOW' ? 1.25 : 1;
  const distanceCost = nearest
    ? (nearest.distance / Math.max(1, world.laws.movement.companionSpeed)) * world.laws.resource.moveCostPerSecond * 3.2
    : Number.POSITIVE_INFINITY;
  const predictedReturnCost = Number.isFinite(distanceCost)
    ? distanceCost * weatherMultiplier * terrainMultiplier
    : member.resources.maxEnergy;
  const contingency = Math.max(3, predictedReturnCost * 0.2);
  const margin = member.resources.energy - predictedReturnCost - contingency - member.resources.reserveRequired;
  member.resources.predictedReturnCost = Number(predictedReturnCost.toFixed(2));
  member.resources.returnMargin = Number(margin.toFixed(2));
  member.resources.currentBand = classifyReturnMargin({
    margin,
    maxEnergy: member.resources.maxEnergy,
    requiredReserve: member.resources.reserveRequired
  });
  member.resources.energy = clamp(member.resources.energy, 0, member.resources.maxEnergy);
  return {
    nearest,
    predictedReturnCost: member.resources.predictedReturnCost,
    returnMargin: member.resources.returnMargin,
    band: member.resources.currentBand
  };
}
