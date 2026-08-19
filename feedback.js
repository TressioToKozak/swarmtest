/* Lightweight Web Audio feedback. It is intentionally procedural: no download
   is required and browsers unlock the context after the first player gesture. */
window.GameFeedback = (()=>{
  let audio;
  function tone(frequency=90,duration=.08,gain=.07,type='sawtooth'){
    audio ||= new (window.AudioContext||window.webkitAudioContext)();
    if(audio.state==='suspended') audio.resume();
    const oscillator=audio.createOscillator(),volume=audio.createGain(),now=audio.currentTime;
    oscillator.type=type;oscillator.frequency.setValueAtTime(frequency,now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(35,frequency*.45),now+duration);
    volume.gain.setValueAtTime(gain,now);volume.gain.exponentialRampToValueAtTime(.001,now+duration);
    oscillator.connect(volume).connect(audio.destination);oscillator.start(now);oscillator.stop(now+duration);
  }
  return {hit:()=>tone(105,.055,.035,'square'),heavy:()=>tone(72,.14,.09),hurt:()=>tone(155,.12,.07,'square'),boss:()=>tone(52,.3,.12)};
})();
