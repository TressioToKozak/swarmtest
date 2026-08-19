/* Lightweight Web Audio feedback. It is intentionally procedural: no download
   is required and browsers unlock the context after the first player gesture. */
window.GameFeedback = (()=>{
  let audio,lastHit=0,voices=0;
  function tone(frequency=90,duration=.08,gain=.07,type='sawtooth'){
    let voiceStarted=false;try{
      const AudioEngine=window.AudioContext||window.webkitAudioContext;
      if(!AudioEngine||voices>=8)return;
      audio ||= new AudioEngine();
      if(audio.state==='suspended'){const resumed=audio.resume();if(resumed?.catch)resumed.catch(()=>{})}
      const oscillator=audio.createOscillator(),volume=audio.createGain(),now=audio.currentTime;
      voices++;voiceStarted=true;oscillator.type=type;oscillator.frequency.setValueAtTime(frequency,now);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(35,frequency*.45),now+duration);
      volume.gain.setValueAtTime(gain,now);volume.gain.exponentialRampToValueAtTime(.001,now+duration);
      oscillator.connect(volume).connect(audio.destination);oscillator.start(now);oscillator.stop(now+duration);oscillator.onended=()=>{voices=Math.max(0,voices-1);oscillator.disconnect();volume.disconnect()};
    }catch(error){if(voiceStarted)voices=Math.max(0,voices-1);console.warn('Pomijam niedostępny efekt audio.',error)}
  }
  function hit(){const now=performance.now();if(now-lastHit<45)return;lastHit=now;tone(105,.055,.035,'square')}
  return {hit,heavy:()=>tone(72,.14,.09),hurt:()=>tone(155,.12,.07,'square'),boss:()=>tone(52,.3,.12)};
})();
