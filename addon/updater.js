/* Zotero owns update discovery, SHA-512 verification, download and installation. */
var CiteLensUpdater = {
  phase:'idle',message:'',errorKind:'',automatic:true,globallyEnabled:true,subscribers:new Set(),epoch:0,dead:true,
  manager(){return ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs').AddonManager;},
  snapshot(){return {phase:this.phase,message:this.message,errorKind:this.errorKind,automatic:this.automatic,globallyEnabled:this.globallyEnabled,version:this.owner?.version||this.installedVersion||'',availableVersion:this.install?.version||''};},
  emit(){if(this.dead)return;for(const listener of [...this.subscribers])try{listener(this.snapshot());}catch(e){Zotero.logError(e);}},
  set(phase,message='',errorKind=''){this.phase=phase;this.message=message;this.errorKind=errorKind;this.emit();},
  subscribe(listener){this.subscribers.add(listener);listener(this.snapshot());return ()=>this.subscribers.delete(listener);},
  async start(owner){this.owner=owner;this.host=Zotero.getMainWindow();this.dead=false;this.epoch++;this.phase='idle';this.message='';this.install=null;await this.load();},
  async load(){
    const ticket=this.epoch;
    try{const manager=this.manager(),addon=await manager.getAddonByID(this.owner.id);if(this.dead||ticket!==this.epoch)return;if(!addon)throw Error('Plugin unavailable');
      this.installedVersion=addon.version;this.globallyEnabled=manager.updateEnabled!==false;
      this.automatic=Number(addon.applyBackgroundUpdates)===manager.AUTOUPDATE_DEFAULT?manager.shouldAutoUpdate(addon):Number(addon.applyBackgroundUpdates)===manager.AUTOUPDATE_ENABLE;
      this.emit();
    }catch(_){if(!this.dead&&ticket===this.epoch)this.set('error','暂时无法读取更新设置');}
  },
  async setAutomatic(enabled){
    if(this.dead)return;const ticket=this.epoch;
    try{const manager=this.manager(),addon=await manager.getAddonByID(this.owner.id);if(this.dead||ticket!==this.epoch)return;if(!addon)throw Error('Plugin unavailable');addon.applyBackgroundUpdates=enabled?manager.AUTOUPDATE_ENABLE:manager.AUTOUPDATE_DISABLE;if(!['checking','installing','available'].includes(this.phase)){this.phase='idle';this.message='';}await this.load();}
    catch(_){if(!this.dead&&ticket===this.epoch)this.set('error','未能保存更新设置，请重试');}
  },
  checkTimeout:20000,retryDelay:800,installTimeout:120000,
  discovery(ticket){
    // Each native attempt has its own deadline and ignores late callbacks.
    return new Promise((resolve,reject)=>{
      let finished=false,addon,timer,started=false,install=null;
      const finish=error=>{if(finished)return;finished=true;this.host.clearTimeout(timer);if(this.cancelCheck===cancel)this.cancelCheck=null;error?reject(error):resolve(install);};
      const cancel=()=>{finish(Object.assign(Error('Cancelled'),{code:-6}));try{addon?.cancelUpdate();}catch(_){}};
      this.cancelCheck=cancel;
      timer=this.host.setTimeout(()=>{finish(Object.assign(Error('Timed out'),{code:-1,retryable:started}));try{addon?.cancelUpdate();}catch(_){}},this.checkTimeout);
      Promise.resolve().then(async()=>{
        const manager=this.manager();addon=await manager.getAddonByID(this.owner.id);
        if(finished||this.dead||ticket!==this.epoch)return;
        if(!addon)throw Error('Plugin unavailable');
        started=true;
        addon.findUpdates({
          onUpdateAvailable:(_addon,value)=>{if(!finished&&!this.dead&&ticket===this.epoch)install=value;},
          onUpdateFinished:(_addon,code)=>finish(code?Object.assign(Error('Native update check failed'),{code,retryable:code===-1||code===-2}):null),
        },manager.UPDATE_WHEN_USER_REQUESTED);
      }).catch(finish);
    });
  },
  pauseRetry(){return new Promise(resolve=>{let timer;const done=()=>{this.host.clearTimeout(timer);if(this.cancelCheck===done)this.cancelCheck=null;resolve();};this.cancelCheck=done;timer=this.host.setTimeout(done,this.retryDelay);});},
  async check(){
    if(this.dead||['checking','installing'].includes(this.phase))return;
    const ticket=++this.epoch;this.install=null;this.set('checking','正在检查更新…');
    try{
      for(let attempt=0;attempt<2;attempt++){
        try{const install=await this.discovery(ticket);if(this.dead||ticket!==this.epoch)return;this.install=install;break;}
        catch(error){
          if(this.dead||ticket!==this.epoch)return;
          // Keep native error codes in diagnostics, never include credentials or library data.
          Zotero.logError(Error('[Paper Nexus updater] check '+(attempt+1)+' failed: '+(error.code??'lookup')));
          if(attempt||!error.retryable)throw error;
          await this.pauseRetry();if(this.dead||ticket!==this.epoch)return;
        }
      }
      this.set(this.install?'available':'current',this.install?'发现新版本 '+this.install.version:'已是最新版本');
    }catch(error){if(!this.dead&&ticket===this.epoch){this.install=null;const kind=error.code===-1?'timeout':error.code===-2?'network':[-3,-4].includes(error.code)?'manifest':error.code===-5?'security':error.code===-6?'cancelled':'unavailable';this.set('error',kind==='timeout'?'检查超时，请重试':'暂时无法完成更新检查',kind);}}
  },
  async apply(){
    if(this.dead||this.phase!=='available'||!this.install)return;
    const install=this.install,ticket=this.epoch;this.set('installing','正在下载并校验…');
    await new Promise(resolve=>{
      let finished=false,timer;
      const clear=()=>{if(finished)return false;finished=true;this.host.clearTimeout(timer);try{install.removeListener(listener);}catch(_){}if(this.installCleanup===clear)this.installCleanup=null;resolve();return true;};
      const fail=()=>{if(clear()&&!this.dead&&ticket===this.epoch){this.install=null;this.set('error','更新未完成，请重新检查','install');}};
      const listener={
        onDownloadProgress:()=>{if(!finished&&!this.dead&&ticket===this.epoch&&install.maxProgress>0)this.set('installing','正在下载 '+Math.round(install.progress/install.maxProgress*100)+'%');},
        onDownloadFailed:fail,onDownloadCancelled:fail,onInstallFailed:fail,onInstallCancelled:fail,
        onInstallEnded:()=>{if(clear()&&!this.dead&&ticket===this.epoch){this.install=null;this.set('current','更新已安装');}},
      };
      this.installCleanup=clear;
      timer=this.host.setTimeout(()=>{if(finished)return;fail();try{install.cancel();}catch(_){}},this.installTimeout);
      try{install.addListener(listener);Promise.resolve(install.install()).catch(fail);}catch(_){fail();}
    });
  },
  stop(){this.dead=true;this.epoch++;this.cancelCheck?.();this.cancelCheck=null;this.installCleanup?.();this.install=null;this.subscribers.clear();}
};
