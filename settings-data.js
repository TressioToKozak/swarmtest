window.SWARM_DIFFICULTIES=Object.freeze({
 normal:{name:{pl:'Normalny',en:'Normal'},hp:1,speed:1,damage:1,spawn:1,heal:1,xp:1,coins:1},
 hard:{name:{pl:'Trudny',en:'Hard'},hp:1.25,speed:1.1,damage:1,spawn:1.15,heal:.85,xp:1,coins:1.5},
 nightmare:{name:{pl:'Koszmar',en:'Nightmare'},hp:1.6,speed:1.2,damage:1.2,spawn:1.3,heal:.65,xp:.9,coins:2.25},
 endless:{name:{pl:'Nieskończony',en:'Endless'},hp:1,speed:1,damage:1,spawn:1.08,heal:1,xp:1,coins:1.25,endless:true}
});
window.SWARM_ELITE_AFFIXES=Object.freeze({
 swift:{pl:'Szybki',en:'Swift',color:'#62c8ff'},vampiric:{pl:'Wampiryczny',en:'Vampiric',color:'#ff5577'},splitting:{pl:'Rozszczepiający',en:'Splitting',color:'#d990ff'},armored:{pl:'Opancerzony',en:'Armored',color:'#b9c7d8'},toxic:{pl:'Toksyczny',en:'Toxic',color:'#9cff54'},teleporter:{pl:'Teleportujący',en:'Teleporter',color:'#ffe274'}
});
window.SWARM_EVENT_DEFS=Object.freeze([
 ['elite_hunt','Łowca Elity','Elite Hunter',45],['corrupted_zone','Skażona Strefa','Corrupted Zone',40],['supply_drop','Zrzut Zaopatrzenia','Supply Drop',40],['blood_altar','Ołtarz Krwi','Blood Altar',45],['hunt','Polowanie','The Hunt',60],['red_wave','Czerwona Fala','Red Wave',30],['hunter_night','Noc Łowców','Hunter Night',45],['time_anomaly','Anomalia Czasowa','Time Anomaly',45],['cursed_treasure','Przeklęty Skarb','Cursed Treasure',50],['bullet_storm','Burza Pocisków','Bullet Storm',30],['closed_arena','Zamknięta Arena','Closed Arena',25]
].map(([id,pl,en,duration])=>({id,pl,en,duration})));
