import {Temporal} from 'temporal-polyfill';
const number = value => value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
const text = value => typeof value === 'string' ? value.slice(0, 100) : null;
const boolean = value => [true, 1, '1', 'true'].includes(value) ? true : [false, 0, '0', 'false'].includes(value) ? false : null;
export function chargePower(data) {
  const reported=number(data.charger_power);
  if(reported>0)return {chargerPowerKw:reported,chargerPowerEstimated:false};
  const current=number(data.charger_actual_current),voltage=number(data.charger_voltage);
  // AC phases are not universally reported the same way. Only estimate the known single-phase case.
  if(data.charging_state==='Charging'&&number(data.charger_phases)===1&&boolean(data.fast_charger_present)===false&&current>0&&voltage>0){
    return {chargerPowerKw:current*voltage/1000,chargerPowerEstimated:true};
  }
  return {chargerPowerKw:reported===0&&data.charging_state==='Charging'?null:reported,chargerPowerEstimated:false};
}
export function normalizeVehicle(data,timezone=process.env.TESLAFI_TIMEZONE||process.env.TZ||'America/Chicago') {
  if (!data || typeof data !== 'object' || Array.isArray(data) || data.error || data.response?.result === false) throw new Error('Invalid vehicle data');
  const battery = number(data.battery_level);
  if (battery === null || battery < 0 || battery > 100) throw new Error('No usable vehicle data');
  const rawTime = data.timestamp ?? data.Date ?? data.date;
  let recordedAt = null;
  if (number(rawTime) > 1000000000) recordedAt = new Date(number(rawTime) < 100000000000 ? number(rawTime) * 1000 : number(rawTime)).toISOString();
  if(!recordedAt&&typeof rawTime==='string'){
    try{if(/(?:Z|[+-]\d{2}:\d{2})$/.test(rawTime)&&Number.isFinite(Date.parse(rawTime)))recordedAt=new Date(rawTime).toISOString();else if(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(rawTime))recordedAt=Temporal.PlainDateTime.from(rawTime.replace(' ','T')).toZonedDateTime(timezone).toInstant().toString();}catch{}
  }
  const chargingState=text(data.charging_state);
  const pluggedIn=chargingState==='Disconnected'?false:['Charging','Complete','Stopped','NoPower','Starting'].includes(chargingState)?true:null;
  return {
    pluggedIn,driving:number(data.speed)>0||['D','R'].includes(data.shift_state)||String(data.state).toLowerCase()==='driving',
    name: text(data.display_name) || 'Tesla', battery,
    rangeMiles: number(data.battery_range), estimatedRangeMiles: number(data.est_battery_range),
    insideCelsius: number(data.inside_temp), outsideCelsius: number(data.outside_temp),
    locked: boolean(data.locked), chargingState: text(data.charging_state),
    ...chargePower(data),
    chargeRateMilesPerHour:number(data.charge_rate), odometerMiles: number(data.odometer),
    locationLabel:text(data.location)?.trim()||null,
    state: text(data.state), recordedAt,
    recordedLabel: typeof rawTime === 'string' && !recordedAt ? text(rawTime) : null,
    stale: recordedAt ? Date.now() - Date.parse(recordedAt) > 900000 : null,
    fetchedAt: new Date().toISOString(), source: 'TeslaFi lastGood',
  };
}
export function createTeslaService(fetcher = fetch, now = Date.now) {
  let cached = null, nextAttempt = 0, pending = null;
  return async function vehicle(key) {
    if (!key) return { status: 503, body: { connected: false, error: 'TeslaFi is not configured. Add TESLAFI_API_KEY on the server.' } };
    if (now() < nextAttempt && cached) return cached;
    if (pending) return pending;
    pending = (async () => {
      nextAttempt = now() + 60000;
      try {
        const url = new URL('https://www.teslafi.com/feed.php');
        url.searchParams.set('token', key);
        url.searchParams.set('command', 'lastGood');
        const response = await fetcher(url, { signal: AbortSignal.timeout(10000), redirect: 'error', headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error('Upstream failed');
        const result = normalizeVehicle(await response.json());
        cached = { status: 200, body: { connected: true, vehicle: result } };
      } catch {
        // Never return upstream errors, URLs, tokens, raw vehicle data or a fabricated fallback.
        cached = { status: 502, body: { connected: false, error: 'TeslaFi could not return vehicle data. Check the server key and TeslaFi API settings.' } };
      }
      return cached;
    })();
    try { return await pending; } finally { pending = null; }
  };
}
