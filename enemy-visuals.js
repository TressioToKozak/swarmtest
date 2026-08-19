/* Procedural enemy models. Movement, combat and balance stay in game.js; this
   file owns silhouettes and animation so visual iterations remain isolated. */
(()=>{
  const TAU=Math.PI*2;
  function ellipse(ctx,x,y,rx,ry,color){ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,TAU);ctx.fill()}
  function organic(ctx,r,points=12,wobble=0){
    ctx.beginPath();
    for(let i=0;i<=points;i++){const a=i/points*TAU,rr=r*(1+Math.sin(i*2.37+wobble)*.09),x=Math.cos(a)*rr,y=Math.sin(a)*rr*.82;i?ctx.quadraticCurveTo(Math.cos(a-TAU/points/2)*rr,y,x,y):ctx.moveTo(x,y)}
    ctx.closePath();
  }
  function eye(ctx,x,size,color='#fff'){ellipse(ctx,x,0,size,size*.72,color);ellipse(ctx,x+size*.2,0,size*.38,size*.38,'#07101a')}
  function legs(ctx,r,color,time,count=3){ctx.strokeStyle=color;ctx.lineWidth=Math.max(1.5,r*.11);ctx.lineCap='round';for(let side of [-1,1])for(let i=0;i<count;i++){const y=side*(r*.25+i*r*.26),step=Math.sin(time*9+i*1.7+side)*r*.18;ctx.beginPath();ctx.moveTo(-r*.3,y*.72);ctx.quadraticCurveTo(-r*.8+step,y,-r*1.2+step,y*1.18);ctx.stroke()}}
  function swarm(ctx,e,time,hit){
    const flap=Math.sin(time*18+e.phase),r=e.r;ctx.shadowColor='#ed83ff';ctx.shadowBlur=13;
    ctx.fillStyle='rgba(237,131,255,.28)';for(const side of [-1,1]){ctx.beginPath();ctx.moveTo(-r*.1,side*r*.25);ctx.quadraticCurveTo(-r*1.8,side*r*(1.25+flap*.28),-r*2.15,side*r*.18);ctx.quadraticCurveTo(-r*1.1,side*r*.03,-r*.1,side*r*.25);ctx.fill()}
    legs(ctx,r,'#d67ce8',time,2);ctx.fillStyle=hit?'#fff':'#61236f';ctx.strokeStyle='#f1a2ff';ctx.lineWidth=1.4;organic(ctx,r,9,time*3);ctx.fill();ctx.stroke();eye(ctx,r*.42,r*.24,'#ffd8ff');
  }
  function shooter(ctx,e,time,hit){
    // attackCd may stay negative while the shooter has no clear line of fire.
    // Never feed that unbounded value into the muzzle ellipse: older saves could
    // otherwise grow it to thousands of pixels and stall the canvas renderer.
    const r=e.r,recoil=e.attackCd>1.55?Math.max(-8,Math.min(8,(1.75-e.attackCd)*8)):0,charge=e.attackCd>=0?Math.max(0,Math.min(1,1-e.attackCd/.5)):0;ctx.shadowColor='#ffb45e';ctx.shadowBlur=17;
    legs(ctx,r,'#a75935',time,3);ctx.fillStyle=hit?'#fff':'#43251f';ctx.strokeStyle='#ff9f59';ctx.lineWidth=2.2;organic(ctx,r,12,time*.9);ctx.fill();ctx.stroke();
    ctx.fillStyle='#24120e';ctx.beginPath();ctx.moveTo(-r*.75,-r*.45);ctx.lineTo(-r*1.2,-r*.85);ctx.lineTo(-r*.95,-r*.1);ctx.moveTo(-r*.75,r*.45);ctx.lineTo(-r*1.2,r*.85);ctx.lineTo(-r*.95,r*.1);ctx.fill();
    ctx.save();ctx.translate(-recoil,0);ctx.fillStyle='#d57d3e';ctx.beginPath();ctx.roundRect(r*.1,-r*.34,r*1.25,r*.68,r*.25);ctx.fill();ctx.stroke();ellipse(ctx,r*1.35,0,r*.28,r*.42,'#1b0d09');ctx.restore();eye(ctx,-r*.05,r*.25,'#ffe0a8');
    if(charge){ctx.globalAlpha=.35+charge*.55;ellipse(ctx,r*1.65,0,3+charge*6,3+charge*6,'#fff2bd')}
  }
  function charger(ctx,e,time,hit){
    const r=e.r,wind=e.windup||0,surge=e.charging?1:.0,pulse=1+Math.sin(time*28)*wind*.12;ctx.scale(pulse,1/pulse);ctx.shadowColor='#62a4ff';ctx.shadowBlur=22;
    if(surge){ctx.globalAlpha=.28;for(let i=0;i<3;i++){ctx.fillStyle='#7fc4ff';ctx.beginPath();ctx.moveTo(-r*(1+i*.45),-r*.55);ctx.lineTo(-r*(2.4+i*.55),0);ctx.lineTo(-r*(1+i*.45),r*.55);ctx.fill()}ctx.globalAlpha=1}
    legs(ctx,r,'#497ebc',time,3);ctx.fillStyle=hit?'#fff':'#162d4d';ctx.strokeStyle=wind?'#d8efff':'#68b1ff';ctx.lineWidth=2.6;ctx.beginPath();ctx.moveTo(r*1.42,0);ctx.bezierCurveTo(r*.85,-r*.95,-r*.45,-r*1.08,-r*.88,-r*.55);ctx.quadraticCurveTo(-r*1.2,0,-r*.88,r*.55);ctx.bezierCurveTo(-r*.45,r*1.08,r*.85,r*.95,r*1.42,0);ctx.fill();ctx.stroke();
    ctx.fillStyle='#6eb8ff';for(const side of [-1,1]){ctx.beginPath();ctx.moveTo(r*.1,side*r*.7);ctx.quadraticCurveTo(-r*.25,side*r*1.45,-r*.85,side*r*1.2);ctx.lineTo(-r*.55,side*r*.58);ctx.fill()}eye(ctx,r*.48,r*.3,'#cdeaff');
    if(wind){ctx.globalAlpha=.25+.25*Math.sin(time*30);ctx.strokeStyle='#bfe7ff';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,r*(1.35+wind*.6),0,TAU);ctx.stroke()}
  }
  function exploder(ctx,e,time,hit){
    const r=e.r,beat=(Math.sin(time*7+e.phase)+1)/2;ctx.shadowColor='#ff7938';ctx.shadowBlur=18+beat*9;legs(ctx,r,'#a84828',time,3);
    ctx.fillStyle=hit?'#fff':'#4b231b';ctx.strokeStyle='#ff8240';ctx.lineWidth=2.2;organic(ctx,r*(1+beat*.05),14,time*1.5);ctx.fill();ctx.stroke();
    ctx.strokeStyle='#ffb052';ctx.lineWidth=2;for(let i=0;i<5;i++){ctx.save();ctx.rotate(i/5*TAU+time*.08);ctx.beginPath();ctx.moveTo(r*.42,0);ctx.quadraticCurveTo(r*.62,-r*.2,r*.9,0);ctx.stroke();ctx.restore()}
    ellipse(ctx,0,0,r*(.34+beat*.08),r*(.34+beat*.08),'#ffd46b');ellipse(ctx,0,0,r*.15,r*.15,'#fff4ba');
  }
  function boss(ctx,e,time,hit,data){
    const r=e.r,color=data[e.bossTier].color,pulse=1+Math.sin(time*3+e.phase)*.035;ctx.scale(pulse,pulse);ctx.shadowColor=color;ctx.shadowBlur=38;ctx.lineCap='round';
    if(e.bossTier===1){
      legs(ctx,r,'#8d3040',time,4);ctx.fillStyle=hit?'#fff':'#401720';ctx.strokeStyle=color;ctx.lineWidth=4;organic(ctx,r,18,time*.35);ctx.fill();ctx.stroke();
      ctx.fillStyle='#842c3e';for(const side of [-1,1]){ctx.beginPath();ctx.moveTo(-r*.2,side*r*.65);ctx.bezierCurveTo(-r*.55,side*r*1.45,-r*1.45,side*r*1.32,-r*1.65,side*r*.65);ctx.bezierCurveTo(-r*.95,side*r*.82,-r*.65,side*r*.3,-r*.2,side*r*.65);ctx.fill();ctx.stroke()}eye(ctx,r*.28,r*.22,'#ffd2b1');
    }else if(e.bossTier===2){
      ctx.strokeStyle=color;for(let i=0;i<6;i++){ctx.save();ctx.rotate(i/6*TAU+time*.16);ctx.lineWidth=8;ctx.beginPath();ctx.moveTo(r*.35,0);ctx.bezierCurveTo(r*.75,-r*.35,r*1.2,-r*.25,r*1.42,0);ctx.stroke();ctx.restore()}
      ctx.fillStyle=hit?'#fff':'#102b4b';ctx.lineWidth=4;organic(ctx,r*.78,16,time*.25);ctx.fill();ctx.stroke();ctx.save();ctx.rotate(-time*.35);ctx.strokeStyle='#9de4ff';ctx.lineWidth=3;ctx.setLineDash([18,10]);ctx.beginPath();ctx.arc(0,0,r*.56,0,TAU);ctx.stroke();ctx.restore();eye(ctx,0,r*.22,'#dff7ff');
    }else{
      ctx.strokeStyle=color;ctx.lineWidth=9;for(let i=0;i<10;i++){const a=i/10*TAU+time*.13,wave=Math.sin(time*2+i)*r*.22;ctx.beginPath();ctx.moveTo(Math.cos(a)*r*.42,Math.sin(a)*r*.42);ctx.bezierCurveTo(Math.cos(a+.32)*(r*.8+wave),Math.sin(a+.32)*(r*.8+wave),Math.cos(a-.22)*r*1.1,Math.sin(a-.22)*r*1.1,Math.cos(a)*r*1.42,Math.sin(a)*r*1.42);ctx.stroke()}
      ctx.fillStyle=hit?'#fff':'#260e3b';ctx.lineWidth=4;organic(ctx,r*.72,20,time*.45);ctx.fill();ctx.stroke();ellipse(ctx,0,0,r*.28+Math.sin(time*4)*3,r*.22+Math.sin(time*4)*3,'#dca0ff');ellipse(ctx,0,0,r*.1,r*.1,'#fff');
    }
  }
  window.drawEnemyModel=(ctx,e,{time,hit,bossData})=>{
    if(e.bossTier)boss(ctx,e,time,hit,bossData);else if(e.type==='swarm')swarm(ctx,e,time,hit);else if(e.type==='shooter')shooter(ctx,e,time,hit);else if(e.type==='charger')charger(ctx,e,time,hit);else if(e.type==='exploder')exploder(ctx,e,time,hit);else return false;return true;
  };
})();
