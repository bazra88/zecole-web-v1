'use client';
import {useState} from 'react';
import {needsMediaRenewal} from '@/lib/shared-media-policy.mjs';
import {useMediaRefreshStatus} from './GameVisitRefresh';
export default function RemoteGameMedia({url,type='image',className='',alt=''}) {
  const [failedUrl,setFailedUrl]=useState(null);
  const status=useMediaRefreshStatus();
  if(needsMediaRenewal(url)||failedUrl===url) return <div className={`${className} detail-media-placeholder`} role="status">{status==='checking'?'미디어를 갱신하고 있어요…':status==='waiting'?'순서를 기다리고 있어요. 잠시 후 자동으로 갱신합니다…':'미디어를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.'}</div>;
  return type==='video'
    ? <video className={className} autoPlay loop muted playsInline preload="metadata" src={url} onError={()=>setFailedUrl(url)} />
    : <img className={className} src={url} alt={alt} loading="lazy" onError={()=>setFailedUrl(url)} />;
}
