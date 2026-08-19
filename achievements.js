/* Persistent, one-time achievements. Rewards are paid by game.js so the
   currency remains in the existing save/stat system. */
window.Achievements=(()=>{
  const KEY='swarmfall-achievements-v1';
  const definitions=Object.freeze([
    {id:'field_guide',name:'Pełny bestiariusz',description:'Pokonaj każdy rodzaj zwykłego przeciwnika podczas jednej gry.',reward:3},
    {id:'boss_1',name:'Pierwszy strażnik',description:'Pokonaj pierwszego bossa.',reward:5},
    {id:'boss_2',name:'Głębiej w ruiny',description:'Pokonaj drugiego bossa.',reward:10},
    {id:'boss_3',name:'Serce ruin',description:'Pokonaj trzeciego bossa.',reward:15},
    {id:'map_1',name:'Ruiny oczyszczone',description:'Ukończ pierwszą mapę.',reward:5},
    {id:'item_6',name:'Pełny potencjał',description:'Ulepsz dowolny przedmiot do 6. poziomu.',reward:15},
    {id:'hard_clear',name:'Bez taryfy ulgowej',description:'Ukończ mapę na poziomie Hard.',reward:15},
    {id:'nightmare_clear',name:'Przebudzenie z koszmaru',description:'Ukończ mapę na poziomie Nightmare.',reward:30}
  ]);
  function load(){try{return new Set(JSON.parse(localStorage.getItem(KEY)||'[]'))}catch{return new Set()}}
  const completed=load();
  function unlock(id){const achievement=definitions.find(entry=>entry.id===id);if(!achievement||completed.has(id))return null;completed.add(id);try{localStorage.setItem(KEY,JSON.stringify([...completed]))}catch(error){console.warn('Nie udało się zapisać osiągnięcia.',error)}return achievement}
  return {definitions,completed,unlock,isComplete:id=>completed.has(id)};
})();
