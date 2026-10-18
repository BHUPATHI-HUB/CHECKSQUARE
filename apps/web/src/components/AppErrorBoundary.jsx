import React from 'react';
import { reportClientError } from '@/lib/clientMonitoring.js';
export default class AppErrorBoundary extends React.Component {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  componentDidCatch(){reportClientError('render_error');}
  render(){
    if(this.state.failed)return <main className="min-h-screen flex flex-col items-center justify-center gap-5 p-8 text-center">
      <h1 className="font-display text-3xl">We couldn’t open this page.</h1>
      <p>Your saved work remains on this device. Reload to try again.</p>
      <button type="button" className="rounded bg-primary px-5 py-3 text-primary-foreground" onClick={()=>window.location.reload()}>Reload app</button>
    </main>;
    return this.props.children;
  }
}
