// Seoul forwards upstream errors as JSON with HTTP 400; inspect only the known code.
export async function snapshotFailure(response, region) {
  if (region === 'KRW') {
    const body=await response.json().catch(()=>null);
    if (/^meta_(403|429)$/.test(body?.error || '')) return body.error;
  }
  return `${region==='KRW'?'kr':'us'}_snapshot_${response.status}`;
}

export function metaWasBlocked(error) {
  return /^(?:meta|us_snapshot|kr_snapshot)_(?:403|429)$/.test(error?.message || '');
}
