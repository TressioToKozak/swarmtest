/* Persistent, local-only single-player achievements. Account currency and
   multiplayer entitlements remain server-authoritative. */
window.Achievements=(()=>{
  const BASE_KEY='achievements-v1',LEGACY_KEYS=['swarmfall-singleplayer-achievements-v1','swarmfall-achievements-v1'];
  const definitions=Object.freeze([
    {id:'field_guide',name:'Pełny bestiariusz',description:'Pokonaj każdy rodzaj zwykłego przeciwnika podczas jednej gry.'},
    {id:'boss_1',name:'Pierwszy strażnik',description:'Pokonaj pierwszego bossa.'},
    {id:'boss_2',name:'Głębiej w ruiny',description:'Pokonaj drugiego bossa.'},
    {id:'boss_3',name:'Serce ruin',description:'Pokonaj trzeciego bossa.'},
    {id:'map_1',name:'Ruiny oczyszczone',description:'Ukończ pierwszą mapę.'},
    {id:'item_6',name:'Pełny potencjał',description:'Ulepsz dowolny przedmiot do 6. poziomu.'},
    {id:'hard_clear',name:'Bez taryfy ulgowej',description:'Ukończ mapę na poziomie Hard.'},
    {id:'nightmare_clear',name:'Przebudzenie z koszmaru',description:'Ukończ mapę na poziomie Nightmare.'}
  ]);
  const english={field_guide:['Complete Bestiary','Defeat every normal enemy type during one run.'],boss_1:['First Guardian','Defeat the first boss.'],boss_2:['Deeper into the Ruins','Defeat the second boss.'],boss_3:['Heart of the Ruins','Defeat the third boss.'],map_1:['Ruins Cleansed','Complete the first map.'],item_6:['Full Potential','Upgrade any item to level 6.'],hard_clear:['No Easy Way Out','Complete a map on Hard.'],nightmare_clear:['Awaken from the Nightmare','Complete a map on Nightmare.']};for(const definition of definitions){definition.nameEn=english[definition.id][0];definition.descriptionEn=english[definition.id][1]}
  const knownIds=new Set(definitions.map(entry=>entry.id)),stored=SwarmSingleplayerProgress.array(localStorage,sessionStorage,BASE_KEY,LEGACY_KEYS,knownIds),KEY=stored.key,completed=new Set(stored.value);
  function unlock(id){const achievement=definitions.find(entry=>entry.id===id);if(!achievement||completed.has(id))return null;completed.add(id);try{localStorage.setItem(KEY,JSON.stringify([...completed]))}catch(error){console.warn('Nie udało się zapisać osiągnięcia.',error)}return achievement}
  return {definitions,completed,unlock,isComplete:id=>completed.has(id)};
})();
