import { clamp } from './utils.mjs';
import { weatherCostMultiplier } from './resource-state.mjs';

export function platformCollision(body, platforms, priorY) {
  const halfW = body.width / 2;
  const bottom = body.y + body.height / 2;
  const priorBottom = priorY + body.height / 2;
  let landed = null;
  for (const platform of platforms) {
    const horizontallyInside = body.x + halfW > platform.x && body.x - halfW < platform.x + platform.width;
    if (!horizontallyInside) continue;
    if (body.vy >= 0 && priorBottom <= platform.y + 3 && bottom >= platform.y) {
      if (!landed || platform.y < landed.y) landed = platform;
    }
  }
  if (landed) {
    body.y = landed.y - body.height / 2;
    body.vy = 0;
    body.onGround = true;
    return true;
  }
  body.onGround = false;
  return false;
}

export function stepPhysicsBody(body, world, dt) {
  if (body.carriedBy) return;
  const priorY = body.y;
  body.vy = Math.min(body.vy + world.laws.gravity * dt, world.laws.maxFallSpeed);
  body.x += body.vx * dt;
  body.y += body.vy * dt;
  platformCollision(body, world.map.platforms, priorY);
  body.x = clamp(body.x, body.width / 2, world.map.width - body.width / 2);
  if (body.y > world.map.height + 100) {
    body.x = world.map.spawn.human.x;
    body.y = world.map.spawn.human.y;
    body.vx = 0;
    body.vy = 0;
  }
}

export function moveMember(member, direction, speed, world, dt, isHuman = false) {
  if (member.body.carriedBy || member.flags.resting) return;
  const weatherMove = world.weather.state === 'RAIN'
    ? world.laws.weather.rainMovementMultiplier
    : world.weather.state === 'SNOW' ? 0.82 : world.weather.state === 'SAND_WIND' ? 0.84 : 1;
  const desired = direction * speed * weatherMove;
  const acceleration = member.body.onGround ? 14 : 6 * world.laws.movement.airControl;
  member.body.vx += (desired - member.body.vx) * Math.min(1, acceleration * dt);
  if (direction !== 0) {
    member.body.facing = Math.sign(direction);
    member.resources.energy -= world.laws.resource.moveCostPerSecond * weatherCostMultiplier(world.weather.state, world.laws) * dt;
  } else if (member.body.onGround) {
    member.body.vx *= Math.pow(world.laws.groundFriction, dt * 60);
    if (Math.abs(member.body.vx) < 0.5) member.body.vx = 0;
  }
  if (isHuman && member.resources.currentBand === 'PROTECTIVE_RETURN_OR_HALT') {
    member.body.vx *= 0.35;
  }
}

export function jumpMember(member, world) {
  if (member.body.onGround && !member.body.carriedBy && member.resources.energy >= world.laws.resource.jumpCost) {
    member.body.vy = world.laws.movement.jumpVelocity;
    member.body.onGround = false;
    member.resources.energy -= world.laws.resource.jumpCost;
    return true;
  }
  return false;
}
