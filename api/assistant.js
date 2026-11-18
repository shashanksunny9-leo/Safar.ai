export default async function handler(req,res){
  if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
  const {mode="chat",message="",city={},weather={},attractions=[],history=[],days=3}=req.body||{};
  if(!process.env.OPENAI_API_KEY)return res.status(503).json({error:"AI is not configured. Add OPENAI_API_KEY in Vercel environment variables."});
  const instructions="You are WanderWeather, a concise practical travel assistant. Use only supplied destination, forecast and attraction context for factual claims. Never invent current prices, opening hours, availability, transport schedules or safety advisories. State uncertainty and suggest checking official sources. Tailor advice to weather.";
  const input=mode==="itinerary"
    ?`Create a practical ${Math.max(1,Math.min(10,Number(days)||3))}-day itinerary for ${city.name||"the destination"}, ${city.country||""}. For each day include morning, afternoon, evening and one weather-aware tip. Prioritise supplied attractions; do not claim verified opening hours. Context: ${JSON.stringify({city,weather,attractions})}`
    :`Destination: ${JSON.stringify(city)}\nWeather: ${JSON.stringify(weather)}\nKnown attractions: ${JSON.stringify(attractions)}\nConversation: ${JSON.stringify(history.slice(-8))}\nUser question: ${String(message).slice(0,2000)}`;
  try{
    const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${process.env.OPENAI_API_KEY}`},body:JSON.stringify({model:process.env.OPENAI_MODEL||"gpt-4.1-mini",instructions,input,max_output_tokens:mode==="itinerary"?1400:650})});
    const data=await response.json();if(!response.ok)return res.status(response.status).json({error:data.error?.message||"AI provider request failed."});
    const reply=data.output_text||(data.output||[]).flatMap(x=>x.content||[]).map(x=>x.text||"").join("\n").trim();
    return res.status(200).json({reply:reply||"I couldn't prepare a response. Please try again."});
  }catch{return res.status(502).json({error:"Could not connect to the AI service."});}
}
