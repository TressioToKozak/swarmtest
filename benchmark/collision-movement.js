'use strict';
const {performance}=require('node:perf_hooks'),collision=require('../shared-collision'),maps=require('../shared-map-data');
const ITERATIONS=100000;
function measure(name,run){for(let i=0;i<2000;i++)run();const start=performance.now();for(let i=0;i<ITERATIONS;i++)run();const ms=performance.now()-start;console.log(JSON.stringify({name,iterations:ITERATIONS,ms,solvesPerSecond:ITERATIONS*1000/ms}))}
measure('open-space',()=>collision.moveCircleWithCollision('ruins',1500,1100,15,5,3));
const rock=collision.rockCollider('ruins',maps.ruins.terrain.find(item=>item.type==='rock'));
measure('single-rock-contact',()=>collision.moveCircleWithCollision('ruins',rock.x+rock.radius+15.5,rock.y,15,-2,6));
measure('water-corner',()=>collision.moveCircleWithCollision('ruins',1551.4454460330307,1194.733024686575,15,-2.383356633001603,14.035813712911198));
const contacts=new Float64Array([1,0,0,1,.999999,.000001]),out=new Float64Array(2);
measure('two-contact-constraint',()=>collision.solveContactVelocity(-8,8,contacts,3,out));
console.log(JSON.stringify({contactOverflow:collision.contactStats.overflow}));
