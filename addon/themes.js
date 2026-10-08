/* Palette and artwork adapted from Paper Voice, MIT, Junyan Kang.
 * Only namespaced tokens are placed on the document; Zotero chrome is untouched. */
var CiteLensThemes = {
  themes: [
    {id:'tidal',name:'天际',paper:'#edf4f8',surface:'#f8fcfe',ink:'#20384b',muted:'#3e5261',accent:'#245d85',soft:'#d4e5ef',line:'#bfd6e4',focus:'#245d85',highlight:'#5fa1d838',art:'horizon.jpg',mask:.50},
    {id:'silver',name:'银翼',paper:'#f0f3f5',surface:'#fbfcfd',ink:'#2d3742',muted:'#46515c',accent:'#455c73',soft:'#dbe3ea',line:'#c6d0d9',focus:'#455c73',highlight:'#7f9dbb38',art:'silver.jpg',mask:.70},
    {id:'inkstone',name:'墨竹',paper:'#f3f2ee',surface:'#fbfaf6',ink:'#2c3332',muted:'#454d49',accent:'#85443b',soft:'#e8dcd7',line:'#cfcfc5',focus:'#85443b',highlight:'#b1aaa03a',art:'inkstone.jpg',mask:.72},
    {id:'porcelain',name:'织麦',paper:'#f6f1e7',surface:'#fffaf0',ink:'#3e372b',muted:'#544a3b',accent:'#72552e',soft:'#e9ddc7',line:'#d7c9af',focus:'#72552e',highlight:'#c5a46438',art:'linen.jpg',mask:.54},
    {id:'amber',name:'赤陶',paper:'#f6eee8',surface:'#fff7f0',ink:'#48342e',muted:'#60463e',accent:'#874935',soft:'#eed9cc',line:'#dec4b6',focus:'#874935',highlight:'#cb907238',art:'terracotta.jpg',mask:.56},
    {id:'sakura',name:'樱雾',paper:'#faf2f4',surface:'#fffafc',ink:'#4c2d3a',muted:'#634453',accent:'#85405b',soft:'#f0dce5',line:'#dfc5d0',focus:'#85405b',highlight:'#d991b238',art:'sakura.jpg',mask:.64},
    {id:'velvet',name:'酒绒',paper:'#2e222c',surface:'#3e2d3a',ink:'#fff2f5',muted:'#edd3df',accent:'#f1bfc8',soft:'#513644',line:'#745465',focus:'#f1bfc8',highlight:'#d39aa83c',art:'velvet.jpg',mask:.68,dark:true},
    {id:'midnight',name:'月岩',paper:'#25292e',surface:'#32383f',ink:'#f5f3ee',muted:'#dddad2',accent:'#e2cdab',soft:'#43443f',line:'#666962',focus:'#e2cdab',highlight:'#b7ae943c',art:'lunar.jpg',mask:.54,dark:true},
    {id:'botanical',name:'靛蓝',paper:'#172c49',surface:'#223c5f',ink:'#f2f6fd',muted:'#ceddf4',accent:'#b7d6fb',soft:'#2d4769',line:'#4b6484',focus:'#b7d6fb',highlight:'#8caedd40',art:'indigo.jpg',mask:.52,dark:true},
    {id:'aurora',name:'极光',paper:'#14292d',surface:'#1d383e',ink:'#ecf9f6',muted:'#c2e2dc',accent:'#8adccb',soft:'#29464b',line:'#426469',focus:'#8adccb',highlight:'#71c2ae3c',art:'aurora.jpg',mask:.55,dark:true}
  ],
  customImage:null,
  imagePath(){return PathUtils.join(PathUtils.parent(CiteLensServices.path),'background.jpg');},
  async initialize(){
    const s=CiteLensServices.state.settings;
    if(!s.theme||s.theme==='system')s.theme=this.resolve('system',Zotero.getMainWindow().matchMedia('(prefers-color-scheme: dark)').matches).id;
    try{const path=this.imagePath();if(await IOUtils.exists(path)){const bytes=await IOUtils.read(path,{maxBytes:2097152});if(bytes.length>=2097152)throw Error('Image too large');this.customImage='data:image/jpeg;base64,'+Zotero.getMainWindow().btoa(Array.from(bytes,b=>String.fromCharCode(b)).join(''));}}catch(_){this.customImage=null;}
    await CiteLensServices.persist();
  },
  async importImage(path){
    if((await IOUtils.stat(path)).size>12*1024*1024)throw Error('请选择小于 12 MB 的图片');
    const bytes=await IOUtils.read(path),png=bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71,jpg=bytes[0]===255&&bytes[1]===216,webp=String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
    if(!png&&!jpg&&!webp)throw Error('请选择 PNG、JPG 或 WebP 图片');
    const win=Zotero.getMainWindow(),url=win.URL.createObjectURL(new win.Blob([bytes],{type:png?'image/png':jpg?'image/jpeg':'image/webp'}));
    try{const image=new win.Image();image.src=url;await image.decode();if(!image.width||!image.height||image.width*image.height>24000000)throw Error('图片不能超过 2400 万像素');
      const canvas=win.document.createElementNS('http://www.w3.org/1999/xhtml','canvas');canvas.width=768;canvas.height=1024;const ctx=canvas.getContext('2d'),scale=Math.max(canvas.width/image.width,canvas.height/image.height),w=canvas.width/scale,h=canvas.height/scale;ctx.fillStyle=this.resolve(CiteLensServices.state.settings.theme).paper;ctx.fillRect(0,0,768,1024);ctx.drawImage(image,(image.width-w)/2,(image.height-h)/2,w,h,0,0,768,1024);
      const data=canvas.toDataURL('image/jpeg',.86),out=Uint8Array.from(win.atob(data.split(',')[1]),x=>x.charCodeAt(0));await IOUtils.write(this.imagePath(),out,{tmpPath:this.imagePath()+'.tmp'});this.customImage=data;CiteLensServices.state.settings.customThemeImage=true;await CiteLensServices.persist();this.refresh();
    }finally{win.URL.revokeObjectURL(url);}
  },
  async removeImage(){await IOUtils.remove(this.imagePath(),{ignoreAbsent:true});this.customImage=null;CiteLensServices.state.settings.customThemeImage=false;await CiteLensServices.persist();this.refresh();},
  documents:new Map(),
  resolve(id,dark=false) {
    const alias={light:'silver',paper:'porcelain',dark:'midnight'};
    return this.themes.find(t=>t.id===(alias[id]||id))||this.themes.find(t=>t.id===(dark?'midnight':'silver'));
  },
  apply(doc) {
    let state=this.documents.get(doc);
    if(!state){
      const win=doc.defaultView,media=win.matchMedia('(prefers-color-scheme: dark)'),reduce=win.matchMedia('(prefers-reduced-transparency: reduce)');
      const change=()=>this.apply(doc),leave=e=>{if(e.target===doc||e.target===win)this.release(doc);};
      media.addEventListener('change',change);reduce.addEventListener('change',change);win.addEventListener('pagehide',leave);
      state={media,reduce,change,leave};this.documents.set(doc,state);
    }
    const settings=CiteLensServices.state.settings,t=this.resolve(settings.theme,state.media.matches),html=doc.documentElement;
    html.dataset.clTheme=t.id;html.dataset.clTone=t.dark?'dark':'light';
    const rgb=t.paper.match(/\w\w/g).map(x=>parseInt(x,16)).join(',');
    const tokens={'edge-mask':t.id==='porcelain'&&!settings.customThemeImage?'linear-gradient(to right,transparent 91%, '+t.surface+' 97%)':'linear-gradient(transparent,transparent)',bg:t.surface,paper:t.paper,ink:t.ink,muted:t.muted,line:t.line,soft:t.soft,accent:t.accent,'on-accent':t.dark?t.paper:'#fff',error:t.dark?'#ffb5ac':'#a32d27',shadow:t.dark?'0 12px 32px #080d1859,0 2px 6px #080d183d':'0 12px 32px #18273824,0 2px 6px #18273824','surface-rim':t.dark?'#ffffff26':t.ink+'24','rim-light':t.dark?'#ffffff22':'#ffffffd9',veil:t.dark?'#0007':'#182d264d',knob:t.surface,scheme:t.dark?'dark':'light',art:!state.reduce.matches&&(settings.customThemeImage&&this.customImage||CiteLens.assetURI)?'url("'+(settings.customThemeImage&&this.customImage||CiteLens.assetURI+'themes/'+t.art)+'")':'none',mask:'rgba('+rgb+','+(settings.customThemeImage ? .94 : t.mask)+')','surface-opacity':state.reduce.matches?'1':String(1-Math.max(0,Math.min(80,Number(settings.transparency)||0))/100)};
    for(const [key,value] of Object.entries(tokens))html.style.setProperty('--cl-'+key,value);
  },
  refresh(){if(typeof CiteLensI18n!=='undefined')CiteLensI18n.refresh();for(const doc of this.documents.keys())try{CiteLensUI.appearance(doc);}catch(_){this.release(doc);}},
  release(doc){
    if(typeof CiteLensI18n!=='undefined')CiteLensI18n.release(doc);
    try{doc._clScrollEdges?.dispose();}catch(_){}if(typeof CiteLensControls!=='undefined')CiteLensControls.release(doc);
    const state=this.documents.get(doc);if(!state)return;this.documents.delete(doc);
    try{state.media.removeEventListener('change',state.change);state.reduce.removeEventListener('change',state.change);doc.defaultView.removeEventListener('pagehide',state.leave);const html=doc.documentElement;html.removeAttribute('data-cl-theme');html.removeAttribute('data-cl-tone');for(const name of [...html.style])if(name.startsWith('--cl-'))html.style.removeProperty(name);}catch(_){}
  },
  stop(){for(const doc of [...this.documents.keys()])this.release(doc);}
};
