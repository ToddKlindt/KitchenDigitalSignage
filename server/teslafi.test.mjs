import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeVehicle, createTeslaService,chargePower } from './teslafi.mjs';
test('normalizes types and strips secrets and location', () => {
  const v=normalizeVehicle({battery_level:'0',locked:'0',inside_temp:'0',battery_range:'12.5',token:'SECRET',latitude:42,vin:'PRIVATE'});
  assert.equal(v.battery,0); assert.equal(v.locked,false); assert.equal(v.insideCelsius,0); assert.equal(v.rangeMiles,12.5);
  assert.ok(!JSON.stringify(v).includes('SECRET')); assert.ok(!('vin' in v)); assert.ok(!('latitude' in v)); assert.equal(v.stale,null);
});
test('missing credentials make no network call',async()=>{const s=createTeslaService(()=>{throw Error('should not fetch')});assert.equal((await s()).status,503)});
test('caches and coalesces requests with read-only command',async()=>{let count=0;const s=createTeslaService(async url=>{count++;assert.equal(url.searchParams.get('command'),'lastGood');return Response.json({battery_level:78})});await Promise.all([s('test'),s('test')]);await s('test');assert.equal(count,1)});
test('upstream errors are sanitized and cached',async()=>{let calls=0;const s=createTeslaService(async()=>{calls++;throw Error('SECRET')});const r=await s('SECRET');assert.equal(r.status,502);assert.ok(!JSON.stringify(r).includes('SECRET'));await s('SECRET');assert.equal(calls,1)});
test('rejects error and empty payloads instead of inventing numbers',()=>{assert.throws(()=>normalizeVehicle({response:{result:false}}));assert.throws(()=>normalizeVehicle({battery_level:''}))});
test('marks old records stale and preserves unknown lock state',()=>{const v=normalizeVehicle({battery_level:80,timestamp:1600000000000});assert.equal(v.stale,true);assert.equal(v.locked,null)});
test('recovers known single-phase AC power and preserves reported mileage charge rate',()=>{
 const v=normalizeVehicle({battery_level:'90.47',charging_state:'Charging',charger_power:'0',charger_actual_current:'48.0000007',charger_voltage:'235.058998',charger_phases:'1',fast_charger_present:'0',charge_rate:'43.5403292',odometer:'58809.143039248',location:'Home'});
 assert.ok(Math.abs(v.chargerPowerKw-11.2828)<.001);assert.equal(v.chargerPowerEstimated,true);assert.equal(v.chargeRateMilesPerHour,43.5403292);assert.equal(v.odometerMiles,58809.143039248);assert.equal(v.locationLabel,'Home');
});
test('prefers reported power and never guesses DC or ambiguous multiphase power',()=>{
 assert.deepEqual(chargePower({charger_power:'12',charging_state:'Charging'}),{chargerPowerKw:12,chargerPowerEstimated:false});
 for(const extra of [{charger_phases:3,fast_charger_present:0},{charger_phases:1,fast_charger_present:1},{charger_phases:1,fast_charger_present:0,charger_actual_current:null}]){
 const v=chargePower({charging_state:'Charging',charger_power:0,charger_actual_current:48,charger_voltage:235,...extra});assert.equal(v.chargerPowerKw,null);assert.equal(v.chargerPowerEstimated,false);
 }
 assert.equal(chargePower({charging_state:'Disconnected',charger_power:0}).chargerPowerKw,0);
});
test('exposes only the requested tagged location without raw coordinates or VIN',()=>{
 const v=normalizeVehicle({battery_level:80,location:' Office ',latitude:42.123,longitude:-93.456,vin:'PRIVATE',token:'SECRET'});assert.equal(v.locationLabel,'Office');assert.ok(!('latitude' in v));assert.ok(!('longitude' in v));assert.ok(!('vin' in v));assert.ok(!JSON.stringify(v).includes('SECRET'));
});
