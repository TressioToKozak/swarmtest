/* Shared enemy balance and presentation data. Kept outside the game loop so new
   enemy families can be added without growing game.js. */
window.SWARM_ENEMIES = Object.freeze({
  melee:{r:13,hp:22,speed:76}, brute:{r:24,hp:70,speed:49},
  shooter:{r:16,hp:32,speed:62}, charger:{r:19,hp:48,speed:67},
  exploder:{r:17,hp:35,speed:61}, swarm:{r:7,hp:7,speed:132},
  toxic:{r:18,hp:48,speed:72}, trapper:{r:17,hp:42,speed:68}
});
window.SWARM_TOXIC_BOSSES = Object.freeze({
  1:{name:'Zarodniowy Kolos',type:'toxic_boss_spore',r:62,hp:1900,speed:51,color:'#9cff45'},
  2:{name:'Władca Oparów',type:'toxic_boss_fog',r:70,hp:4100,speed:45,color:'#42e89d'},
  3:{name:'Rdzeń Skażenia',type:'toxic_boss_core',r:82,hp:7600,speed:39,color:'#d5ff4d'}
});
window.SWARM_BOSSES = Object.freeze({
  1:{name:'Tytan Ruin',type:'boss_titan',r:58,hp:1500,speed:48,color:'#ff5f72'},
  2:{name:'Strażnik Burzy',type:'boss_warden',r:67,hp:3300,speed:42,color:'#65b9ff'},
  3:{name:'Serce Otchłani',type:'boss_void',r:78,hp:6200,speed:36,color:'#c36cff'}
});
