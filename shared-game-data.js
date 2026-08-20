(function(root,factory){const data=factory();if(typeof module==='object'&&module.exports)module.exports=data;else root.SWARM_SHARED_DATA=data})(typeof globalThis!=='undefined'?globalThis:this,()=>{
  const characters={scout:{hp:100,speed:250,damage:14,fireRate:.62,projectileSpeed:570},warrior:{hp:130,speed:220,damage:18,fireRate:.7,projectileSpeed:500},druid:{hp:110,speed:235,damage:12,fireRate:.7,projectileSpeed:470}};
  const enemies={melee:{hp:34,speed:83,r:13,damage:9,xp:3},brute:{hp:105,speed:54,r:22,damage:16,xp:6},shooter:{hp:48,speed:62,r:14,damage:10,xp:4},charger:{hp:62,speed:72,r:16,damage:16,xp:5},exploder:{hp:42,speed:88,r:15,damage:18,xp:4},swarm:{hp:13,speed:125,r:8,damage:5,xp:1},boss:{hp:900,speed:46,r:42,damage:24,xp:40}};
  const items={speed:{max:6},vital:{max:6},rapid:{max:6},power:{max:6},multi:{max:6},cooldown:{max:6},magnet:{max:6},lifesteal:{max:6},scope:{max:6},crystal:{max:6},blade:{max:6},powder:{max:6},spikes:{max:6},adrenaline:{max:6},bottle:{max:6},lens:{max:6},totem:{max:6},vault:{max:1}};
  const augments=['executor','giant_hunter','last_chance','glass_cannon','perfectionist','recycling','blood_price','second_chamber','gambler','greed_curse','parasite'];
  return Object.freeze({characters,enemies,items,augments})
});
