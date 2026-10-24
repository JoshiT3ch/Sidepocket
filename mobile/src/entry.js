import {Capacitor} from '@capacitor/core';
import {App} from '@capacitor/app';
import {Browser} from '@capacitor/browser';
import {createNativeRuntime} from './runtime.js';

if(Capacitor.isNativePlatform()){
  window.sideoutNative=createNativeRuntime({App,Browser,window,document,storage:localStorage});
  document.documentElement.classList.add('native-app');
  const networkStatus=()=>{document.getElementById('connection-status').hidden=navigator.onLine!==false;};
  window.addEventListener('online',networkStatus);
  window.addEventListener('offline',networkStatus);
  networkStatus();
}
