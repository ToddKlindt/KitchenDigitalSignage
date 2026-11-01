export function chargingReminder(vehicle,settings,now=Date.now()) {
 const off=reason=>({active:false,reason});
 if(!settings.chargingReminderEnabled)return off('Disabled');
 if(!vehicle)return off('Vehicle data unavailable');
 const age=now-Date.parse(vehicle.recordedAt);
 if(!Number.isFinite(age)||age>24*60*60000||age< -5*60000)return off('Waiting for recent vehicle data');
 if(vehicle.driving===true)return off('Vehicle is driving');
 if(String(vehicle.locationLabel||'').trim().toLowerCase()!==settings.chargingHome.trim().toLowerCase())return off('Vehicle is not at the configured home location');
 if(vehicle.pluggedIn!==false)return off(vehicle.pluggedIn===true?'Vehicle is plugged in':'Plug status unknown');
 if(typeof vehicle.battery!=='number'||vehicle.battery>=settings.chargingTarget)return off('Battery is at or above target');
 if(age>15*60000)return {active:false,advisory:true,reason:'Last reported at home, unplugged, with '+Math.round(vehicle.battery)+'% battery. If still unplugged, consider charging. Vehicle data is over 15 minutes old.'};
 return {active:true,reason:'Plug in '+(vehicle.name||'your Tesla')+' — battery '+Math.round(vehicle.battery)+'%, below your '+settings.chargingTarget+'% target.'};
}
