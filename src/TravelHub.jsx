import React, { useState } from "react";
import { Bot, Send, Sparkles, Plane, Hotel, Bell, BellRing, ArrowUpRight, LoaderCircle, GitCompareArrows, CalendarDays, ShieldAlert } from "lucide-react";
import { getWeather } from "./api";
import { weatherLabel, weatherEmoji } from "./utils";

const dateOffset = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0,10); };

export default function TravelHub({ city, current, daily, attractions, savedCities }) {
  const [chatInput,setChatInput]=useState("");
  const [chatMessages,setChatMessages]=useState([{role:"assistant",content:`Hello! I'm your WanderWeather travel assistant. Ask me where to go in ${city.name}, what to pack, or how to plan around the forecast.`}]);
  const [chatBusy,setChatBusy]=useState(false),[aiPlan,setAiPlan]=useState(""),[planBusy,setPlanBusy]=useState(false),[days,setDays]=useState(3);
  const [origin,setOrigin]=useState("DEL"),[depart,setDepart]=useState(dateOffset(14)),[returnDate,setReturnDate]=useState(dateOffset(18));
  const [checkIn,setCheckIn]=useState(dateOffset(14)),[checkOut,setCheckOut]=useState(dateOffset(17)),[adults,setAdults]=useState(1);
  const [travelResults,setTravelResults]=useState(null),[travelBusy,setTravelBusy]=useState(false),[travelError,setTravelError]=useState("");
  const [compareRows,setCompareRows]=useState([]),[compareBusy,setCompareBusy]=useState(false),[alertMessage,setAlertMessage]=useState("");

  const weatherSummary=current&&daily?{
    current:`${Math.round(current.temperature_2m)}°C, ${weatherLabel(current.weather_code)}`,
    feelsLike:`${Math.round(current.apparent_temperature)}°C`,humidity:`${current.relative_humidity_2m}%`,
    wind:`${Math.round(current.wind_speed_10m)} km/h`,rainChance:`${daily.precipitation_probability_max?.[0]??0}%`,
    forecast:daily.time.slice(0,7).map((date,i)=>({date,high:daily.temperature_2m_max[i],low:daily.temperature_2m_min[i],rain:daily.precipitation_probability_max?.[i]??0,condition:weatherLabel(daily.weather_code[i])}))
  }:null;

  async function askAssistant(message=chatInput){
    const prompt=message.trim(); if(!prompt||chatBusy)return;
    const next=[...chatMessages,{role:"user",content:prompt}];setChatMessages(next);setChatInput("");setChatBusy(true);
    try{
      const res=await fetch("/api/assistant",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mode:"chat",message:prompt,city:{name:city.name,country:city.country},weather:weatherSummary,attractions:attractions.slice(0,10).map(a=>a.name),history:next.slice(-8)})});
      const data=await res.json();if(!res.ok)throw new Error(data.error||"Assistant unavailable");
      setChatMessages([...next,{role:"assistant",content:data.reply}]);
    }catch{
      setChatMessages([...next,{role:"assistant",content:`For ${city.name}, conditions are ${weatherSummary?.current||"not available"} with a ${weatherSummary?.rainChance||"unknown"} rain chance today. ${prompt.toLowerCase().includes("rain")?"Keep an indoor alternative such as a museum or gallery, and carry a compact umbrella.":"Check the 7-day outlook before booking outdoor activities. Carry comfortable walking shoes and a light layer."} Add OPENAI_API_KEY in Vercel to enable personalised AI conversations.`}]);
    }finally{setChatBusy(false);}
  }

  async function generatePlan(){
    setPlanBusy(true);setAiPlan("");
    try{
      const res=await fetch("/api/assistant",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mode:"itinerary",days,city:{name:city.name,country:city.country},weather:weatherSummary,attractions:attractions.slice(0,15).map(a=>({name:a.name,category:a.category}))})});
      const data=await res.json();if(!res.ok)throw new Error(data.error||"Could not generate itinerary");setAiPlan(data.reply);
    }catch{
      const spots=attractions.slice(0,Math.max(3,days*2)).map(a=>a.name);
      setAiPlan(Array.from({length:days},(_,i)=>`DAY ${i+1}\nMorning: ${spots[i*2]||"Explore the historic city centre"}\nAfternoon: ${spots[i*2+1]||"Visit a local museum or landmark"}\nEvening: Try a neighbourhood restaurant and a relaxed city walk.`).join("\n\n")+"\n\nStarter plan based on local attractions. Add OPENAI_API_KEY in Vercel for AI-personalised planning.");
    }finally{setPlanBusy(false);}
  }

  async function searchTravel(type){
    setTravelBusy(true);setTravelError("");setTravelResults(null);
    try{
      const body=type==="flights"?{type,origin:origin.trim().toUpperCase(),destination:city.name,departureDate:depart,returnDate,adults}:{type,latitude:city.latitude,longitude:city.longitude,city:city.name,checkIn,checkOut,adults};
      const res=await fetch("/api/travel",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      const data=await res.json();if(!res.ok)throw new Error(data.error||"Travel search failed");setTravelResults({type,...data});
    }catch(e){setTravelError(e.message||"Unable to search travel options.");}finally{setTravelBusy(false);}
  }

  async function compareSaved(){
    const candidates=savedCities.filter(c=>c.id!==city.id).slice(0,3);setCompareBusy(true);
    try{
      const rows=await Promise.all(candidates.map(async c=>{const w=await getWeather(c);return{name:c.name,country:c.country,current:`${Math.round(w.current.temperature_2m)}°C`,condition:weatherLabel(w.current.weather_code),rain:w.daily.precipitation_probability_max?.[0]??0,code:w.current.weather_code};}));
      rows.unshift({name:city.name,country:city.country,current:`${Math.round(current.temperature_2m)}°C`,condition:weatherLabel(current.weather_code),rain:daily.precipitation_probability_max?.[0]??0,code:current.weather_code});setCompareRows(rows);
    }catch{setCompareRows([{name:city.name,current:`${Math.round(current.temperature_2m)}°C`,condition:weatherLabel(current.weather_code),rain:daily.precipitation_probability_max?.[0]??0,code:current.weather_code}]);}
    finally{setCompareBusy(false);}
  }

  async function enableAlerts(){
    setAlertMessage("");
    if(!("Notification"in window)){setAlertMessage("This browser does not support desktop notifications.");return;}
    const permission=Notification.permission==="granted"?"granted":await Notification.requestPermission();
    if(permission!=="granted"){setAlertMessage("Notifications were not enabled. Allow them in browser settings.");return;}
    const rain=daily?.precipitation_probability_max?.[0]??0,severe=current&&[95,96,99].includes(current.weather_code);
    const key=`ww-alert-${city.id}-${daily?.time?.[0]}`;
    if(!localStorage.getItem(key)&&(rain>=50||severe)){
      new Notification(`Weather heads-up for ${city.name}`,{body:severe?"Thunderstorm conditions are in the forecast. Check local guidance before heading out.":`Rain probability is ${rain}% today. Carry an umbrella and keep an indoor option handy.`});
      localStorage.setItem(key,"1");setAlertMessage("Forecast alert sent. This is not an official emergency warning.");
    }else setAlertMessage("Notifications are enabled. No high-rain or thunderstorm trigger is present right now.");
  }

  const flightsFallback=`https://www.google.com/travel/flights?q=${encodeURIComponent(`Flights from ${origin} to ${city.name} on ${depart}`)}`;
  const hotelsFallback=`https://www.booking.com/searchresults.html?ss=${encodeURIComponent(city.name+", "+city.country)}&checkin=${checkIn}&checkout=${checkOut}`;

  return <section className="travel-hub">
    <div className="hub-title"><span className="eyebrow"><Sparkles size={13}/> YOUR PERSONAL TRAVEL DESK</span><h2>Go from forecast to getaway</h2><p>Build a plan, compare destinations, check travel offers and get weather-aware advice.</p></div>
    <div className="hub-grid">
      <article className="hub-card assistant-card">
        <div className="hub-card-title"><span className="hub-icon"><Bot size={19}/></span><div><b>AI travel assistant</b><small>Ask about places, packing, timing and trip ideas</small></div><span className="ai-tag">AI READY</span></div>
        <div className="chat-window">{chatMessages.map((m,i)=><div className={`chat-message ${m.role}`} key={i}><span>{m.role==="assistant"?"WW":"YOU"}</span><p>{m.content}</p></div>)}{chatBusy&&<div className="chat-message assistant"><span>WW</span><p><LoaderCircle className="spin" size={14}/> Thinking…</p></div>}</div>
        <div className="chat-suggestions">{["Is today good for sightseeing?","What should I pack?","Suggest hidden gems and local experiences"].map(q=><button key={q} onClick={()=>askAssistant(q)}>{q}</button>)}</div>
        <form className="chat-compose" onSubmit={e=>{e.preventDefault();askAssistant();}}><input value={chatInput} onChange={e=>setChatInput(e.target.value)} placeholder={`Ask about ${city.name}…`}/><button disabled={!chatInput.trim()||chatBusy} aria-label="Send message"><Send size={16}/></button></form>
        <small className="micro-note">AI replies require OPENAI_API_KEY in Vercel. A weather-aware fallback is provided without it.</small>
      </article>
      <article className="hub-card">
        <div className="hub-card-title"><span className="hub-icon"><CalendarDays size={19}/></span><div><b>AI itinerary builder</b><small>Personalised day-by-day travel plan</small></div></div>
        <div className="inline-controls"><label>Trip length<select value={days} onChange={e=>setDays(Number(e.target.value))}><option value={3}>3 days</option><option value={5}>5 days</option><option value={7}>7 days</option></select></label><button className="primary-small" onClick={generatePlan} disabled={planBusy}>{planBusy?<LoaderCircle className="spin" size={14}/>:<Sparkles size={14}/>} Generate plan</button></div>
        {aiPlan?<pre className="ai-plan">{aiPlan}</pre>:<div className="empty-state"><Sparkles size={24}/><b>Your trip, thoughtfully planned</b><span>Generate an itinerary using the city's attractions and forecast.</span></div>}
        <small className="micro-note">Verify attraction opening hours, ticket rules and local transport before departure.</small>
      </article>
      <article className="hub-card travel-search-card">
        <div className="hub-card-title"><span className="hub-icon"><Plane size={19}/></span><div><b>Flight price search</b><small>Search live offers through Amadeus</small></div></div>
        <div className="travel-form"><label>Origin airport code (IATA)<input value={origin} onChange={e=>setOrigin(e.target.value.toUpperCase().slice(0,3))} maxLength={3} placeholder="e.g. DEL"/></label><label>Departure<input type="date" min={dateOffset(0)} value={depart} onChange={e=>setDepart(e.target.value)}/></label><label>Return (optional)<input type="date" min={depart} value={returnDate} onChange={e=>setReturnDate(e.target.value)}/></label><label>Travellers<select value={adults} onChange={e=>setAdults(Number(e.target.value))}><option value={1}>1 adult</option><option value={2}>2 adults</option><option value={3}>3 adults</option><option value={4}>4 adults</option><option value={5}>5 adults</option></select></label><button className="primary-small full" onClick={()=>searchTravel("flights")} disabled={travelBusy||origin.length!==3||!depart}>{travelBusy?<LoaderCircle className="spin" size={14}/>:<Plane size={14}/>} Search flight offers</button></div>
        <a className="fallback-link" href={flightsFallback} target="_blank" rel="noreferrer">Compare on Google Flights <ArrowUpRight size={13}/></a>
      </article>
      <article className="hub-card travel-search-card">
        <div className="hub-card-title"><span className="hub-icon"><Hotel size={19}/></span><div><b>Hotel price search</b><small>Nearby hotel offers by destination</small></div></div>
        <div className="travel-form"><label>Check-in<input type="date" min={dateOffset(0)} value={checkIn} onChange={e=>setCheckIn(e.target.value)}/></label><label>Check-out<input type="date" min={checkIn} value={checkOut} onChange={e=>setCheckOut(e.target.value)}/></label><label>Guests<select value={adults} onChange={e=>setAdults(Number(e.target.value))}><option value={1}>1 guest</option><option value={2}>2 guests</option><option value={3}>3 guests</option><option value={4}>4 guests</option></select></label><button className="primary-small" onClick={()=>searchTravel("hotels")} disabled={travelBusy||!checkIn||!checkOut||checkOut<=checkIn}>{travelBusy?<LoaderCircle className="spin" size={14}/>:<Hotel size={14}/>} Search hotels</button></div>
        <a className="fallback-link" href={hotelsFallback} target="_blank" rel="noreferrer">Compare on Booking.com <ArrowUpRight size={13}/></a>
      </article>
      {travelError&&<div className="hub-notice warning">{travelError} You can still use the comparison links above. Add Amadeus API credentials to enable live offers.</div>}
      {travelResults&&<article className="hub-card results-card"><div className="hub-card-title"><span className="hub-icon">{travelResults.type==="flights"?<Plane size={19}/>:<Hotel size={19}/>}</span><div><b>{travelResults.type==="flights"?"Flight offers":"Hotel offers"} for {city.name}</b><small>{travelResults.source||"Amadeus"} · prices and availability can change</small></div></div>{travelResults.offers?.length?<div className="offer-list">{travelResults.offers.map((o,i)=><div className="offer-row" key={o.id||i}><div><b>{o.name||o.airline||`Option ${i+1}`}</b><small>{o.details||"Provider offer"}</small></div><strong>{o.currency} {o.price}</strong></div>)}</div>:<p className="micro-note">No offers returned. Try different dates or a nearby airport.</p>}</article>}
      <article className="hub-card compare-card">
        <div className="hub-card-title"><span className="hub-icon"><GitCompareArrows size={19}/></span><div><b>Compare destinations</b><small>Weather across your saved cities</small></div></div>
        <p className="hub-description">Compare temperature, conditions and rain chance for this city and up to three saved destinations.</p>
        <button className="secondary-small" onClick={compareSaved} disabled={compareBusy}>{compareBusy?<LoaderCircle className="spin" size={14}/>:<GitCompareArrows size={14}/>} Compare saved destinations</button>
        {compareRows.length>0&&<div className="compare-list">{compareRows.map(r=><div className="compare-row" key={r.name}><span>{weatherEmoji(r.code||1)} <b>{r.name}</b></span><strong>{r.current}</strong><small>{r.condition} · {r.rain}% rain</small></div>)}</div>}
        {savedCities.length===0&&<small className="micro-note">Save cities with the bookmark control near the current weather to compare them here.</small>}
      </article>
      <article className="hub-card alert-card">
        <div className="hub-card-title"><span className="hub-icon"><BellRing size={19}/></span><div><b>Weather forecast alerts</b><small>Browser notifications for rain and storms</small></div></div>
        <p className="hub-description">Enable a heads-up when the current forecast indicates a high chance of rain or thunderstorm conditions.</p>
        <button className="primary-small" onClick={enableAlerts}><Bell size={14}/> Enable notifications</button>
        {alertMessage&&<p className="alert-message"><ShieldAlert size={14}/>{alertMessage}</p>}
        <small className="micro-note">App-generated forecast notices, not official emergency alerts. Browser permission is required.</small>
      </article>
    </div>
  </section>;
}
