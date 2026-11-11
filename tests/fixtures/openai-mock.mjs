// Only loaded explicitly by the API test child process. No external traffic.
globalThis.fetch=async(url,options)=>{
 if(!url.startsWith('https://api.openai.com/'))throw new Error('Unexpected external request in test');
 const key=options.headers.Authorization;
 if(!['Bearer sk-valid-test-key-123456789','Bearer sk-replacement-test-key-12345'].includes(key))return Response.json({error:{message:'Invalid key, never forward this payload'}},{status:401});
 if(url.endsWith('/audio/transcriptions'))return Response.json({text:'Öva filbyten.'});
 return Response.json({status:'completed',output:[{content:[{type:'output_text',text:'Hej! Öva filbyten.'}]}]});
};
