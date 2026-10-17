import { useEffect, useState } from 'react';
import { api } from './api';

// Feature switches come from the API, so they can be flipped on Render without redeploying the site.
let cache = null;
let pending = null;

export function useFeatures() {
  const [features, setFeatures] = useState(cache || { matchmaking: false, loaded: false });
  useEffect(() => {
    if (cache) return;
    pending ||= api('/features')
      .then((f) => (cache = { ...f, loaded: true }))
      .catch(() => ({ matchmaking: false, loaded: true }));
    pending.then(setFeatures);
  }, []);
  return features;
}
