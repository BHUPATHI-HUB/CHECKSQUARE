import React, { useEffect, useState } from 'react';

// Mounts once per full load, not on ordinary route changes. A short CSS intro
// also works offline and yields immediately to reduced-motion preferences.
export default function ReloadIntro() {
  const [visible,setVisible]=useState(()=>!window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(()=>{
    if(!visible)return undefined;
    const timer=setTimeout(()=>setVisible(false),1450);
    return ()=>clearTimeout(timer);
  },[visible]);
  if(!visible)return null;
  return <div className="checksquare-intro" role="status" aria-label="Opening CheckSquare">
    <div className="checksquare-intro-mark">
      <img src="/logo.svg" alt="CheckSquare" width="180" height="108" />
      <span aria-hidden="true" className="checksquare-intro-line" />
    </div>
  </div>;
}
