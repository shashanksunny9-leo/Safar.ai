const API_HOST=process.env.AMADEUS_ENV==="production"?"https://api.amadeus.com":"https://test.api.amadeus.com";
async function getToken(){
  const id=process.env.AMADEUS_CLIENT_ID,secret=process.env.AMADEUS_CLIENT_SECRET;
  if(!id||!secret)throw new Error("Live travel pricing is not configured. Add AMADEUS_CLIENT_ID and AMADEUS_CLIENT_SECRET in Vercel.");
  const r=await fetch(`${API_HOST}/v1/security/oauth2/token`,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"client_credentials",client_id:id,client_secret:secret})});
  const d=await r.json();if(!r.ok)throw new Error(d.error_description||"Travel provider authentication failed.");return d.access_token;
}
async function apiGet(path,token){
  const r=await fetch(`${API_HOST}${path}`,{headers:{Authorization:`Bearer ${token}`}});const d=await r.json();
  if(!r.ok)throw new Error(d.errors?.[0]?.detail||d.error_description||"Travel provider search failed.");return d;
}
const validDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||""));
export default async function handler(req,res){
  if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
  try{
    const b=req.body||{},token=await getToken();
    if(b.type==="flights"){
      const origin=String(b.origin||"").toUpperCase();
      if(!/^[A-Z]{3}$/.test(origin))return res.status(400).json({error:"Enter a valid three-letter origin airport code, such as DEL."});
      if(!validDate(b.departureDate))return res.status(400).json({error:"Choose a valid departure date."});
      const loc=await apiGet(`/v1/reference-data/locations?subType=CITY,AIRPORT&keyword=${encodeURIComponent(b.destination||"")}&page[limit]=8`,token);
      const dest=(loc.data||[]).find(x=>x.subType==="CITY")||(loc.data||[])[0];
      if(!dest?.iataCode)return res.status(404).json({error:"Could not identify a destination airport/city code. Try another city name."});
      const p=new URLSearchParams({originLocationCode:origin,destinationLocationCode:dest.iataCode,departureDate:b.departureDate,adults:String(Math.max(1,Math.min(9,Number(b.adults)||1))),currencyCode:"USD",max:"8"});
      if(validDate(b.returnDate)&&b.returnDate>=b.departureDate)p.set("returnDate",b.returnDate);
      const result=await apiGet(`/v2/shopping/flight-offers?${p}`,token);
      const offers=(result.data||[]).slice(0,8).map((o,i)=>{
        const seg=(o.itineraries||[]).flatMap(x=>x.segments||[]),air=[...new Set(seg.map(x=>x.carrierCode).filter(Boolean))].join(", ");
        const route=seg.length?`${seg[0].departure.iataCode} → ${seg[seg.length-1].arrival.iataCode}`:"Flight itinerary";
        const duration=(o.itineraries||[]).map(x=>x.duration).filter(Boolean).join(" / ");
        return{id:o.id||String(i),name:air||"Flight option",airline:air,price:o.price?.grandTotal||o.price?.total,currency:o.price?.currency||"USD",details:`${route}${duration?` · ${duration}`:""}`};
      });
      return res.status(200).json({source:"Amadeus",offers,destinationCode:dest.iataCode});
    }
    if(b.type==="hotels"){
      const lat=Number(b.latitude),lon=Number(b.longitude);
      if(!Number.isFinite(lat)||!Number.isFinite(lon)||!validDate(b.checkIn)||!validDate(b.checkOut)||b.checkOut<=b.checkIn)return res.status(400).json({error:"Provide valid hotel coordinates and check-in/check-out dates."});
      const list=await apiGet(`/v1/reference-data/locations/hotels/by-geocode?latitude=${lat}&longitude=${lon}&radius=8&radiusUnit=KM&hotelSource=ALL`,token);
      const ids=(list.data||[]).slice(0,15).map(x=>x.hotelId).filter(Boolean);
      if(!ids.length)return res.status(200).json({source:"Amadeus",offers:[]});
      const p=new URLSearchParams({hotelIds:ids.join(","),checkInDate:b.checkIn,checkOutDate:b.checkOut,adults:String(Math.max(1,Math.min(9,Number(b.adults)||1))),roomQuantity:"1",currency:"USD"});
      const result=await apiGet(`/v3/shopping/hotel-offers?${p}`,token);
      const offers=(result.data||[]).slice(0,10).map((item,i)=>{const offer=item.offers?.[0];return{id:item.hotel?.hotelId||String(i),name:item.hotel?.name||"Hotel",price:offer?.price?.total||offer?.price?.variations?.average?.total||"Price unavailable",currency:offer?.price?.currency||"USD",details:[item.hotel?.cityCode,item.hotel?.rating?`${item.hotel.rating}-star rating`:"",offer?.room?.typeEstimated?.category].filter(Boolean).join(" · ")};});
      return res.status(200).json({source:"Amadeus",offers});
    }
    return res.status(400).json({error:"Unsupported travel search type."});
  }catch(e){return res.status(502).json({error:e.message||"Travel provider is temporarily unavailable."});}
}
