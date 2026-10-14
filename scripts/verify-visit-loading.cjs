// Local browser fixture using the real components and React transitions.
// No Supabase/Meta requests or credentials. Run: node scripts/verify-visit-loading.cjs
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const http=require('node:http');
const webpack=require('next/dist/compiled/webpack/webpack').webpack;
const root=path.resolve(__dirname,'..');
(async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'zecole-loading-'));
  const runtime=path.join(dir,'runtime.js');
  await fs.writeFile(runtime,`
    import {createContext,useContext} from 'react';
    export const RouterContext=createContext(null);
    export const useRouter=()=>useContext(RouterContext);
    export const control={ready:true};
    export function runVisitRefresh(id,{signal,onStatus}) {
      control.onStatus=onStatus;
      return new Promise((resolve,reject)=>{
        control.finish=resolve;
        signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true});
      });
    }
  `);
  await fs.writeFile(path.join(dir,'entry.js'),`
    import React,{useState,useMemo,Suspense} from 'react';
    import {createRoot} from 'react-dom/client';
    import GameVisitRefresh from '${path.join(root,'components/GameVisitRefresh.js').replaceAll('\\','/')}';
    import {RouterContext,control} from './runtime';
    function Price({version}) {
      if(version && !control.ready) throw control.renderPromise;
      return <main className="container detail-page"><h1>로딩 검증용 게임</h1>
        <p data-testid="price">{version?'최신 가격 20,000원':'저장된 가격 10,000원'}</p>
        <button>구매하기</button></main>;
    }
    function App(){
      const [epoch,setEpoch]=useState(0),[version,setVersion]=useState(0);
      const router=useMemo(()=>({refresh:()=>setVersion(1)}),[]);
      function finish(result){control.finish(result);}
      return <RouterContext.Provider value={router}>
        <nav style={{position:'relative',zIndex:10001,padding:12,background:'#222',display:'flex',gap:8,flexWrap:'wrap'}}>
          <button onClick={()=>{control.ready=true;setVersion(0);setEpoch(x=>x+1);}}>다시 시작</button>
          <button onClick={()=>control.onStatus('waiting')}>순서 대기</button>
          <button onClick={()=>{control.ready=false;control.renderPromise=new Promise(r=>control.commit=r);finish({shouldRefresh:true});}}>API 완료 · 화면 대기</button>
          <button onClick={()=>{control.ready=true;control.commit?.();}}>화면 반영 완료</button>
          <button onClick={()=>finish({})}>변경 없음</button>
          <button onClick={()=>finish({deferred:true})}>한도 초과</button>
          <button onClick={()=>finish({failed:true})}>갱신 실패</button>
          <button onClick={()=>finish({priceUnavailable:true})}>가격 확인 불가</button>
        </nav>
        <Suspense fallback={<p>테스트 화면 준비</p>}>
          <GameVisitRefresh key={epoch} gameId={'fixture-'+epoch}><Price version={version}/></GameVisitRefresh>
        </Suspense>
      </RouterContext.Provider>;
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
        '@':root,'next/navigation':runtime,[path.join(root,'lib/visit-refresh-client.mjs')]:runtime,
        '@/lib/visit-refresh-client.mjs':runtime,
      }},
      module:{rules:[{test:/\.m?js$/,exclude:/node_modules/,use:path.join(dir,'loader.cjs')}]},
    });
    compiler.run((err,stats)=>compiler.close(()=>err||stats.hasErrors()?reject(err||new Error(stats.toString({all:false,errors:true}))):resolve()));
  });
  const server=http.createServer(async(req,res)=>{
    if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(await fs.readFile(path.join(dir,'bundle.js')));}
    else if(req.url==='/style.css'){res.setHeader('Content-Type','text/css');res.end(await fs.readFile(path.join(root,'app/globals.css')));}
    else {res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="ko"><meta charset="utf-8"><title>Visit loading verification</title><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/bundle.js"></script></html>');}
  });
  server.listen(4399,'127.0.0.1',()=>console.log('Loading verification fixture: http://127.0.0.1:4399'));
})().catch(err=>{console.error(err);process.exitCode=1;});
