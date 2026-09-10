import { clamp, lerp } from '../core/utils.mjs';
import { getCompanions, getHuman } from '../core/party.mjs';

function roundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
}

function hexAlpha(hex, alpha) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  return `${hex}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`;
}

function drawCloud(ctx, x, y, scale, alpha = 0.72) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x, y, 22 * scale, 0, Math.PI * 2);
  ctx.arc(x + 27 * scale, y - 9 * scale, 29 * scale, 0, Math.PI * 2);
  ctx.arc(x + 61 * scale, y, 23 * scale, 0, Math.PI * 2);
  ctx.rect(x - 2 * scale, y, 67 * scale, 22 * scale);
  ctx.fill();
  ctx.restore();
}

function drawBackground(ctx, state, world, cameraX, width, height) {
  const palette = world.expressions.environments[state.environment] || world.expressions.environments.GARDEN_MEADOW;
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, palette.sky[0]);
  gradient.addColorStop(1, palette.sky[1]);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  const cloudOffset = -(cameraX * 0.08) % 700;
  for (let i = -1; i < 4; i += 1) drawCloud(ctx, cloudOffset + i * 430 + 80, 95 + (i % 2) * 35, 1 + (i % 3) * 0.15, 0.6);

  ctx.fillStyle = palette.far;
  ctx.beginPath();
  ctx.moveTo(0, 440);
  for (let x = -100; x <= width + 160; x += 170) {
    const worldX = x + cameraX * 0.18;
    const peak = 285 + Math.sin(worldX * 0.003) * 45;
    ctx.quadraticCurveTo(x + 85, peak, x + 170, 440);
  }
  ctx.lineTo(width, height); ctx.lineTo(0, height); ctx.closePath(); ctx.fill();

  ctx.fillStyle = palette.mid;
  ctx.beginPath(); ctx.moveTo(0, 500);
  for (let x = -120; x <= width + 200; x += 140) {
    const worldX = x + cameraX * 0.34;
    const peak = 375 + Math.sin(worldX * 0.006 + 1.4) * 34;
    ctx.quadraticCurveTo(x + 70, peak, x + 140, 500);
  }
  ctx.lineTo(width, height); ctx.lineTo(0, height); ctx.closePath(); ctx.fill();

  if (state.environment === 'COAST' || state.environment === 'ISLAND') {
    ctx.fillStyle = '#56b9cdaa';
    ctx.fillRect(0, 470, width, 100);
    ctx.strokeStyle = '#dcffffaa';
    for (let i = 0; i < 6; i += 1) {
      ctx.beginPath();
      const y = 480 + i * 14;
      ctx.moveTo(0, y);
      for (let x = 0; x <= width; x += 40) ctx.lineTo(x, y + Math.sin((x + state.nowMs * 0.03) * 0.025) * 4);
      ctx.stroke();
    }
  }
}

function drawPlatform(ctx, platform, cameraX, palette) {
  const x = platform.x - cameraX;
  if (x > 1320 || x + platform.width < -40) return;
  const isGround = platform.id.includes('ground');
  ctx.fillStyle = isGround ? palette.ground : '#6f9555';
  roundedRect(ctx, x, platform.y, platform.width, platform.height, isGround ? 0 : 10);
  ctx.fill();
  ctx.fillStyle = isGround ? '#8fbd61' : '#a7d877';
  ctx.fillRect(x, platform.y, platform.width, Math.min(12, platform.height));
  if (isGround) {
    ctx.fillStyle = '#425f38';
    for (let px = x + 20; px < x + platform.width; px += 46) {
      ctx.fillRect(px, platform.y + 25 + ((px + platform.x) % 27), 5, 7);
    }
  }
}

function drawTree(ctx, item, cameraX, palette) {
  const x = item.x - cameraX;
  if (x < -180 || x > 1450) return;
  const s = item.scale || 1;
  ctx.save(); ctx.translate(x, item.y); ctx.scale(s, s);
  ctx.fillStyle = '#6c4931'; roundedRect(ctx, -15, 54, 30, 138, 11); ctx.fill();
  ctx.fillStyle = '#7bbb58';
  for (const [dx, dy, r] of [[-40,38,48],[12,10,58],[57,43,42],[-5,-24,47]]) {
    ctx.beginPath(); ctx.arc(dx, dy, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = hexAlpha(palette.accent, 0.8);
  for (const [dx,dy] of [[-28,24],[30,0],[53,50],[-2,-30]]) { ctx.beginPath(); ctx.arc(dx,dy,5,0,Math.PI*2); ctx.fill(); }
  ctx.restore();
}

function drawRock(ctx, item, cameraX, palette) {
  const x = item.x - cameraX;
  if (x < -120 || x > 1400) return;
  const s = item.scale || 1;
  ctx.save(); ctx.translate(x, item.y); ctx.scale(s, s);
  ctx.fillStyle = '#71817d';
  ctx.beginPath(); ctx.moveTo(-38,30); ctx.quadraticCurveTo(-28,-22,7,-30); ctx.quadraticCurveTo(46,-14,42,30); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = hexAlpha(palette.accent, 0.75); ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(-10,8); ctx.lineTo(5,-8); ctx.lineTo(15,13); ctx.stroke();
  ctx.restore();
}

function drawRestPoint(ctx, point, cameraX, palette, state) {
  const x = point.x - cameraX;
  if (x < -100 || x > 1380) return;
  const pulse = 1 + Math.sin(state.nowMs * 0.004) * 0.08;
  ctx.save(); ctx.translate(x, point.y);
  const glow = ctx.createRadialGradient(0, -20, 5, 0, -20, 65 * pulse);
  glow.addColorStop(0, hexAlpha(palette.accent, 0.9)); glow.addColorStop(1, hexAlpha(palette.accent, 0));
  ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0,-20,70*pulse,0,Math.PI*2);ctx.fill();
  ctx.fillStyle = '#72503a'; roundedRect(ctx,-34,10,68,18,8);ctx.fill();
  ctx.fillStyle = palette.accent;
  for (let i=0;i<7;i+=1){ctx.save();ctx.rotate(i*Math.PI*2/7);ctx.beginPath();ctx.ellipse(0,-25,9,22,0,0,Math.PI*2);ctx.fill();ctx.restore();}
  ctx.fillStyle='#fff6a8';ctx.beginPath();ctx.arc(0,0,12,0,Math.PI*2);ctx.fill();
  ctx.restore();
}

function drawPortal(ctx, portal, cameraX, palette, state) {
  const x = portal.x - cameraX;
  if (x < -140 || x > 1420) return;
  const revealed = state.quest.echoGateState === 'REVEALED';
  ctx.save(); ctx.translate(x, portal.y);
  ctx.globalAlpha = revealed ? 1 : 0.32;
  ctx.strokeStyle = revealed ? palette.accent : '#88968e';
  ctx.lineWidth = 13;
  ctx.beginPath(); ctx.arc(0,0,52,Math.PI,0); ctx.lineTo(52,65); ctx.moveTo(-52,65);ctx.lineTo(-52,0);ctx.stroke();
  if(revealed){
    ctx.strokeStyle='#fff9';ctx.lineWidth=3;
    const r=38+Math.sin(state.nowMs*.004)*5;ctx.beginPath();ctx.arc(0,6,r,0,Math.PI*2);ctx.stroke();
  }
  ctx.restore();
}

function drawHuman(ctx, member, x, y, state) {
  const c = member.avatarExpression.color;
  ctx.save(); ctx.translate(x, y); ctx.scale(member.body.facing,1);
  if (member.body.invulnerableUntil > state.nowMs && Math.floor(state.nowMs / 80) % 2 === 0) ctx.globalAlpha = .35;
  ctx.fillStyle='#fff0db';ctx.beginPath();ctx.arc(0,-29,17,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=c; roundedRect(ctx,-18,-18,36,42,13);ctx.fill();
  ctx.fillStyle='#3b453f'; roundedRect(ctx,-16,20,12,22,6);ctx.fill();roundedRect(ctx,4,20,12,22,6);ctx.fill();
  ctx.fillStyle='#303b35';ctx.beginPath();ctx.arc(6,-31,2.2,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(-6,-31,2.2,0,Math.PI*2);ctx.fill();
  if(member.avatarExpression.form==='WANDERER'){ctx.fillStyle='#66754e';ctx.beginPath();ctx.ellipse(0,-45,22,7,0,0,Math.PI*2);ctx.fill();roundedRect(ctx,-12,-57,24,16,7);ctx.fill();}
  if(member.avatarExpression.form==='STARLING'){ctx.fillStyle='#f8f1b0';ctx.beginPath();ctx.moveTo(-17,-45);ctx.lineTo(0,-65);ctx.lineTo(17,-45);ctx.closePath();ctx.fill();}
  ctx.restore();
}

function drawCompanion(ctx, member, x, y, state) {
  const c = member.avatarExpression.color;
  ctx.save(); ctx.translate(x,y); ctx.scale(member.body.facing,1);
  if (member.body.invulnerableUntil > state.nowMs && Math.floor(state.nowMs / 80) % 2 === 0) ctx.globalAlpha=.35;
  if(member.avatarExpression.form==='WISP'){
    const glow=ctx.createRadialGradient(0,-9,2,0,-9,36);glow.addColorStop(0,hexAlpha(c,.7));glow.addColorStop(1,hexAlpha(c,0));ctx.fillStyle=glow;ctx.beginPath();ctx.arc(0,-9,38,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=c;ctx.beginPath();ctx.moveTo(0,-31);ctx.bezierCurveTo(28,-30,28,6,0,23);ctx.bezierCurveTo(-28,6,-28,-30,0,-31);ctx.fill();
  } else if(member.avatarExpression.form==='SPROUTLING'){
    ctx.fillStyle=c;ctx.beginPath();ctx.ellipse(0,-5,22,27,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#4a7854';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(0,-28);ctx.quadraticCurveTo(8,-43,20,-40);ctx.stroke();
  } else {
    ctx.fillStyle=c;roundedRect(ctx,-20,-25,40,48,15);ctx.fill();ctx.fillStyle='#f8e1c6';ctx.beginPath();ctx.arc(0,-29,15,0,Math.PI*2);ctx.fill();
  }
  ctx.fillStyle='#20352b';ctx.beginPath();ctx.arc(-6,-9,2.4,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(6,-9,2.4,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#20352b';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(0,-4,5,0.15*Math.PI,.85*Math.PI);ctx.stroke();
  ctx.restore();
}

function drawParty(ctx, state, cameraX) {
  const human = getHuman(state.party);
  const carried = getCompanions(state.party).find((c)=>c.body.carriedBy===human.participantRef);
  if(carried){
    const x=human.body.x-cameraX-human.body.facing*42, y=human.body.y+24;
    ctx.save();ctx.translate(x,y);ctx.strokeStyle='#5d422d';ctx.lineWidth=5;ctx.beginPath();ctx.arc(0,11,12,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(-30,-18);ctx.lineTo(20,0);ctx.lineTo(45,-23);ctx.stroke();ctx.fillStyle='#8e6541';ctx.beginPath();ctx.moveTo(-28,-18);ctx.lineTo(19,-4);ctx.lineTo(12,14);ctx.lineTo(-20,3);ctx.closePath();ctx.fill();ctx.restore();
  }
  for(const member of state.party.members){
    const x=member.body.x-cameraX, y=member.body.y;
    if(x<-100||x>1380) continue;
    if(member.participantType==='HUMAN') drawHuman(ctx,member,x,y,state); else drawCompanion(ctx,member,x,y,state);
    const companionOffsets = [0, 0, -30, 34];
    const labelOffset = member.participantType === 'HUMAN' ? 0 : companionOffsets[member.partySlot] || 0;
    const labelY = y - member.body.height / 2 - 18 - (member.partySlot === 2 ? 10 : member.partySlot === 3 ? 23 : 0);
    ctx.save();
    ctx.font='700 13px system-ui';
    ctx.textAlign='center';
    const width = Math.max(34, ctx.measureText(member.displayName).width + 10);
    ctx.fillStyle='#ffffffc9';
    roundedRect(ctx, x + labelOffset - width / 2, labelY - 13, width, 18, 8);
    ctx.fill();
    ctx.fillStyle='#163024';
    ctx.fillText(member.displayName, x + labelOffset, labelY);
    ctx.restore();
  }
}

function drawEnemy(ctx, enemy, cameraX, state) {
  if(!enemy.alive) return;
  const x=enemy.body.x-cameraX,y=enemy.body.y;
  if(x<-120||x>1400) return;
  ctx.save();ctx.translate(x,y);ctx.scale(enemy.body.facing,1);
  if(enemy.flashUntil>state.nowMs) ctx.globalAlpha=.45;
  if(enemy.kind==='MOSSBACK'){
    ctx.fillStyle='#618c4f';ctx.beginPath();ctx.ellipse(0,-4,36,28,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#849456';for(let i=-2;i<=2;i++){ctx.beginPath();ctx.arc(i*12,-26-Math.abs(i)*2,10,0,Math.PI*2);ctx.fill();}
  } else {
    ctx.fillStyle='#8ad66f';ctx.beginPath();ctx.moveTo(0,-27);ctx.bezierCurveTo(30,-25,30,22,0,25);ctx.bezierCurveTo(-30,22,-30,-25,0,-27);ctx.fill();ctx.fillStyle='#6daa55';ctx.beginPath();ctx.ellipse(-7,-29,6,13,-.8,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.ellipse(7,-29,6,13,.8,0,Math.PI*2);ctx.fill();
  }
  ctx.fillStyle='#263b2e';ctx.beginPath();ctx.arc(-7,-7,2.5,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(7,-7,2.5,0,Math.PI*2);ctx.fill();ctx.restore();
  const ratio=enemy.health/enemy.maxHealth;ctx.fillStyle='#1a241c66';roundedRect(ctx,x-28,y-enemy.body.height/2-15,56,6,3);ctx.fill();ctx.fillStyle='#ef715f';roundedRect(ctx,x-28,y-enemy.body.height/2-15,56*ratio,6,3);ctx.fill();
}

function drawWeather(ctx, state, width, height) {
  if(state.weather.state==='RAIN'){
    ctx.strokeStyle='#d9f3ff99';ctx.lineWidth=2;const offset=(state.nowMs*.4)%45;for(let x=-60;x<width+60;x+=34){for(let y=-60;y<height;y+=90){ctx.beginPath();ctx.moveTo(x+(y%68),y+offset);ctx.lineTo(x-8+(y%68),y+20+offset);ctx.stroke();}}
  } else if(state.weather.state==='SNOW'){
    ctx.fillStyle='#fffbbb';const offset=(state.nowMs*.04)%70;for(let x=15;x<width;x+=52){for(let y=-70;y<height;y+=100){ctx.beginPath();ctx.arc(x+Math.sin((y+state.nowMs*.02)*.03)*14,y+offset,3,0,Math.PI*2);ctx.fill();}}
  } else if(state.weather.state==='SAND_WIND'){
    ctx.strokeStyle='#f7d49988';for(let y=90;y<height;y+=55){ctx.beginPath();ctx.moveTo(0,y+Math.sin(state.nowMs*.002+y)*12);ctx.bezierCurveTo(width*.35,y-16,width*.7,y+16,width,y);ctx.stroke();}
  } else if(state.weather.state==='MIST'){
    const g=ctx.createLinearGradient(0,0,width,0);g.addColorStop(0,'#ffffff10');g.addColorStop(.5,'#ffffff70');g.addColorStop(1,'#ffffff10');ctx.fillStyle=g;ctx.fillRect(0,340,width,240);
  }
}

function drawParticles(ctx,state,cameraX){
  for(const p of state.particles){const t=clamp((p.expiresAt-state.nowMs)/900,0,1);const x=p.x-cameraX,y=p.y-(1-t)*50;ctx.save();ctx.globalAlpha=Math.min(1,t*2);if(p.kind==='DASH'){ctx.strokeStyle=p.color||'#fff';ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(x-80,y);ctx.lineTo(x+20,y);ctx.stroke();}else if(p.kind==='HORIZON'){ctx.strokeStyle='#fff4a7';ctx.lineWidth=10;ctx.beginPath();ctx.arc(x,y,260*(1-t)+30,0,Math.PI*2);ctx.stroke();}else{ctx.font=p.kind==='COMBO'?'900 20px system-ui':'800 18px system-ui';ctx.textAlign='center';ctx.fillStyle=p.kind==='COMBO'?'#fff2a1':'#fff';ctx.strokeStyle='#234';ctx.lineWidth=4;ctx.strokeText(p.text||'',x,y);ctx.fillText(p.text||'',x,y);}ctx.restore();}
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  let cameraX = 0;
  return {
    render(state, world) {
      const human = getHuman(state.party);
      const target = clamp(human.body.x - canvas.width * .36, 0, world.map.width - canvas.width);
      cameraX = lerp(cameraX, target, .08);
      const palette = world.expressions.environments[state.environment] || world.expressions.environments.GARDEN_MEADOW;
      drawBackground(ctx,state,world,cameraX,canvas.width,canvas.height);
      for(const platform of world.map.platforms) drawPlatform(ctx,platform,cameraX,palette);
      for(const decoration of world.map.decorations){if(decoration.archetypeRef.endsWith('.tree'))drawTree(ctx,decoration,cameraX,palette);else drawRock(ctx,decoration,cameraX,palette);}
      for(const point of world.map.restorationPoints) drawRestPoint(ctx,point,cameraX,palette,state);
      for(const portal of world.map.portals) drawPortal(ctx,portal,cameraX,palette,state);
      for(const enemy of state.enemies) drawEnemy(ctx,enemy,cameraX,state);
      drawParty(ctx,state,cameraX);
      drawParticles(ctx,state,cameraX);
      drawWeather(ctx,state,canvas.width,canvas.height);
      ctx.fillStyle='#10251a99';ctx.font='600 13px system-ui';ctx.textAlign='left';ctx.fillText(`x ${Math.round(human.body.x)}  •  ${state.realityContext.realityClass.replaceAll('_',' ')}`,18,canvas.height-18);
    },
    get cameraX(){return cameraX;}
  };
}
