// Local browser fixture using the real components and React transitions.
// No Supabase/Meta requests or credentials. Run: node scripts/verify-visit-loading.cjs
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const http=require('node:http');
const webpack=require('next/dist/compiled/webpack/webpack').webpack;
const root=path.resolve(__dirname,'..');
(async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'zecole-sale-expiry-'));
  await fs.writeFile(path.join(dir,'link.js'),`import React from 'react';export const useLinkStatus=()=>({pending:false});export default function Link({children,prefetch,...props}){return <a {...props}>{children}</a>;}`);
  await fs.writeFile(path.join(dir,'entry.js'),`
    import React,{useState} from 'react';
    import {createRoot} from 'react-dom/client';
    import GameCardContent from '${path.join(root,'components/GameCardContent.js').replaceAll('\\','/')}';
    import GamePurchasePanel from '${path.join(root,'components/GamePurchasePanel.js').replaceAll('\\','/')}';
    function App(){
      const [start,setStart]=useState(Date.now());
      const game={id:'fixture',slug:'fixture',name:'할인 종료 검증 게임',pricing_type:'paid',krw_price:4000,currency:'KRW',meta_store_original_price:10000,meta_store_offer_ends_at:new Date(start+12000).toISOString(),meta_store_show_timer:true,affiliate_url:'https://example.com/affiliate',meta_store_url:'https://example.com/store',affiliate_discount_percent:10,krw_store_available:true,rating:4.5,review_count:20};
      return <main className="container"><button onClick={()=>setStart(Date.now())}>12초 행사 다시 시작</button>
        <div style={{display:'grid',gridTemplateColumns:'300px 1fr',gap:48,paddingTop:24}}>
          <GameCardContent game={game} renderedAt={start}/>
          <GamePurchasePanel game={game} renderedAt={start}/>
        </div></main>;
    }
    createRoot(document.getElementById('root')).render(<App/>);
  `);
  await fs.writeFile(path.join(dir,'loader.cjs'),`
    const {transformSync}=require(${JSON.stringify(require.resolve('next/dist/build/swc'))});
    module.exports=function(source){return transformSync(source,{filename:this.resourcePath,
      jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'automatic'}},target:'es2020'},
      module:{type:'es6'}}).code;};
  `);
  await new Promise((resolve,reject)=>{
    const compiler=webpack({mode:'development',context:root,entry:path.join(dir,'entry.js'),
      output:{path:dir,filename:'bundle.js'},devtool:false,
      resolve:{extensions:['.js','.mjs'],modules:[path.join(root,'node_modules')],alias:{
        '@':root,'next/link':path.join(dir,'link.js'),
      }},
      module:{rules:[{test:/\.m?js$/,exclude:/node_modules/,use:path.join(dir,'loader.cjs')}]},
    });
    compiler.run((err,stats)=>compiler.close(()=>err||stats.hasErrors()?reject(err||new Error(stats.toString({all:false,errors:true}))):resolve()));
  });
  const server=http.createServer(async(req,res)=>{
    if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(await fs.readFile(path.join(dir,'bundle.js')));}
    else if(req.url==='/style.css'){res.setHeader('Content-Type','text/css');res.end(await fs.readFile(path.join(root,'app/globals.css')));}
    else {res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="ko"><meta charset="utf-8"><title>Sale expiry verification</title><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/bundle.js"></script></html>');}
  });
  server.listen(4400,'127.0.0.1',()=>console.log('Sale expiry fixture: http://127.0.0.1:4400'));
})().catch(err=>{console.error(err);process.exitCode=1;});

