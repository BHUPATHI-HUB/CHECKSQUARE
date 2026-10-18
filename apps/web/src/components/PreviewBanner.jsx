import React from 'react';
import { isDemoMode, getDemoUser } from '@/lib/previewMode.js';
export default function PreviewBanner() {
  if (!isDemoMode) return null;
  const current=getDemoUser();
  const selectRole=(role)=>{
    sessionStorage.setItem('checksquare-preview-role',role);
    window.location.assign(role==='customer'?'/customer':`/${role}/dashboard`);
  };
  return <aside className="sticky top-0 z-[100] border-b border-amber-300 bg-amber-50 px-4 py-3 text-amber-950 flex flex-wrap items-center justify-center gap-3 text-xs" aria-label="Sample data preview">
    <span><strong>APP PREVIEW</strong> · Sample data only · No live database</span>
    <div className="flex gap-1">{['admin','inspector','customer'].map((role)=><button key={role} type="button" onClick={()=>selectRole(role)} aria-pressed={current.role===role} className={`rounded px-3 py-1.5 capitalize ${current.role===role?'bg-amber-900 text-white':'border border-amber-300 hover:bg-amber-100'}`}>{role}</button>)}</div>
  </aside>;
}
