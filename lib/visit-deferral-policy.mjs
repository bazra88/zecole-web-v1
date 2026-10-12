const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const time = value => Date.parse(value) || 0;

// Read-only estimate. The existing atomic database claim remains authoritative.
export function visitDeferral(state, expired, control, attempts, now = Date.now()) {
  const dailyDue = time(state?.daily_attempted_at) + DAY;
  const mediaDue = expired ? time(state?.attempted_at) + HOUR : Infinity;
  if (state && dailyDue > now && mediaDue > now) {
    if (!expired) return {};
    return {deferred:true, retryAfter:Math.ceil((Math.min(dailyDue, mediaDue)-now)/1000)};
  }
  if (!control) return {deferred:true, retryAfter:3600};
  let due = Math.max(now + 1000, time(control.paused_until));
  const recent = attempts.map(a=>({...a, at:time(a.started_at)})).sort((a,b)=>b.at-a.at);
  if (recent.length) due = Math.max(due, recent[0].at + control.min_interval_seconds*1000);
  for (const [window, limit] of [[HOUR, control.hourly_limit], [DAY, control.daily_limit]]) {
    const inWindow = recent.filter(a=>a.at>now-window);
    if (limit <= 0) due = Math.max(due, now+window);
    else if (inWindow.length >= limit) due = Math.max(due, inWindow[limit-1].at+window);
  }
  const lastThree = recent.filter(a=>a.at>now-HOUR).slice(0,3);
  if (lastThree.length===3 && lastThree.every(a=>a.success===false)) due=Math.max(due,now+HOUR);
  return {deferred:true, retryAfter:Math.max(1,Math.ceil((due-now)/1000))};
}
