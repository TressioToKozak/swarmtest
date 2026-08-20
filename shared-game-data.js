(function(root,factory){const data=factory();if(typeof module==='object'&&module.exports)module.exports=data;else root.SWARM_SHARED_DATA=data})(typeof globalThis!=='undefined'?globalThis:this,()=>{
  const characters={
    scout:{hp:100,speed:250,damage:14,fireRate:.62,projectileSpeed:570,attack:'projectile',abilities:{q:{cooldown:5,damage:30,radius:0},e:{cooldown:9,damage:35,radius:190},r:{cooldown:28,damage:110,radius:500}}},
    warrior:{hp:130,speed:220,damage:18,fireRate:.62,projectileSpeed:0,attack:'melee',abilities:{q:{cooldown:5,damage:48,radius:145},e:{cooldown:9,damage:0,radius:0},r:{cooldown:28,damage:0,radius:0}}},
    druid:{hp:110,speed:235,damage:12,fireRate:.62,projectileSpeed:470,attack:'boomerang',abilities:{q:{cooldown:5,heal:28,radius:175},e:{cooldown:9,duration:6,radius:0},r:{cooldown:28,heal:'full',radius:260}}}
  };
  const enemies={melee:{hp:22,speed:76,r:13,damage:9,xp:3,ai:'melee'},brute:{hp:70,speed:49,r:24,damage:16,xp:6,ai:'melee'},shooter:{hp:32,speed:62,r:16,damage:10,xp:4,ai:'shooter'},charger:{hp:48,speed:67,r:19,damage:16,xp:5,ai:'charger'},exploder:{hp:35,speed:61,r:17,damage:18,xp:4,ai:'exploder'},swarm:{hp:7,speed:132,r:7,damage:5,xp:1,ai:'swarm'},toxic:{hp:48,speed:72,r:18,damage:8,xp:5,ai:'toxic'},trapper:{hp:42,speed:68,r:17,damage:8,xp:5,ai:'trapper'},boss:{hp:1500,speed:48,r:58,damage:24,xp:40,ai:'boss'}};
  const items={speed:{max:6},vital:{max:6},rapid:{max:6},power:{max:6},multi:{max:6},cooldown:{max:6},magnet:{max:6},lifesteal:{max:6},scope:{max:6},crystal:{max:6},blade:{max:6},powder:{max:6},spikes:{max:6},adrenaline:{max:6},bottle:{max:6},lens:{max:6},totem:{max:6},vault:{max:1}};
  const augments=['executor','giant_hunter','last_chance','glass_cannon','perfectionist','recycling','blood_price','second_chamber','gambler','greed_curse','parasite'];
  return Object.freeze({characters,enemies,items,augments})
});
