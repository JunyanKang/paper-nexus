import Cocoa
import CryptoKit
import Foundation
import Darwin
import CoreText

let resources = Bundle.main.resourceURL!
for name in ["NexusSans-Regular.ttf","NexusSans-SemiBold.ttf"]{CTFontManagerRegisterFontsForURL(resources.appendingPathComponent(name) as CFURL,.process,nil)}
func nexusFont(_ size:CGFloat,_ weight:NSFont.Weight = .regular)->NSFont{NSFont(name:weight.rawValue>=NSFont.Weight.medium.rawValue ? "NexusSans-SemiBold":"NexusSans-Regular",size:size) ?? .systemFont(ofSize:size,weight:weight)}
let config = try! JSONSerialization.jsonObject(with: Data(contentsOf: resources.appendingPathComponent("installer.json"))) as! [String:Any]
let modelRows = config["models"] as! [[String:Any]]
let productVersion = config["version"] as! String
func argument(_ name: String) -> String? { let a=CommandLine.arguments; guard let i=a.firstIndex(of:name),i+1<a.count else{return nil};return a[i+1] }
func failure(_ text: String) -> NSError { NSError(domain:"PaperNexus",code:1,userInfo:[NSLocalizedDescriptionKey:text]) }
func sha(_ url: URL) throws -> String { let file=try FileHandle(forReadingFrom:url);defer{try? file.close()};var hash=SHA256();while let bytes=try file.read(upToCount:1024*1024),!bytes.isEmpty {hash.update(data:bytes)};return hash.finalize().map{String(format:"%02x",$0)}.joined() }
func defaultData() -> URL {
 let fm=FileManager.default,home=fm.homeDirectoryForCurrentUser,profiles=home.appendingPathComponent("Library/Application Support/Zotero/Profiles")
 if let folders=try? fm.contentsOfDirectory(at:profiles,includingPropertiesForKeys:nil) {
  for folder in folders.sorted(by:{$0.path<$1.path}) {
   if let text=try? String(contentsOf:folder.appendingPathComponent("prefs.js"),encoding:.utf8),let re=try? NSRegularExpression(pattern:#"user_pref\("extensions\.zotero\.dataDir",\s*("(?:\\.|[^"\\])*")"#),let match=re.firstMatch(in:text,range:NSRange(text.startIndex...,in:text)),let range=Range(match.range(at:1),in:text),let value=try? JSONDecoder().decode(String.self,from:Data(text[range].utf8)) {
    let path=URL(fileURLWithPath:value);if fm.fileExists(atPath:path.appendingPathComponent("zotero.sqlite").path){return path}
   }
  }
 }
 return home.appendingPathComponent("Zotero")
}
final class Transfer: NSObject, URLSessionDownloadDelegate {
 private var task: URLSessionDownloadTask?; private var session: URLSession?; private let done=DispatchSemaphore(value:0)
 var cancelled=false; var error: Error?;var destination:URL!;var expected:Int64=0;var progress:((Double)->Void)?
 func cancel(){cancelled=true;task?.cancel()}
 func download(_ asset:[String:Any],to target:URL) throws {
  if cancelled{throw failure("已取消 / Cancelled")};destination=target;expected=(asset["bytes"] as! NSNumber).int64Value
  let cfg=URLSessionConfiguration.ephemeral;cfg.timeoutIntervalForRequest=60;cfg.timeoutIntervalForResource=600
  session=URLSession(configuration:cfg,delegate:self,delegateQueue:nil);task=session!.downloadTask(with:URL(string:asset["url"] as! String)!);task!.resume();if cancelled{task!.cancel()};done.wait();session?.finishTasksAndInvalidate();session=nil;task=nil
  if let e=error{throw e};if cancelled{throw failure("已取消 / Cancelled")}
  let size=(try target.resourceValues(forKeys:[.fileSizeKey])).fileSize ?? 0
  guard size==expected,try sha(target)==asset["sha256"] as! String else {throw failure("文件校验失败，请重试 / File verification failed")}
 }
 func urlSession(_ session: URLSession,downloadTask:URLSessionDownloadTask,didWriteData bytesWritten:Int64,totalBytesWritten:Int64,totalBytesExpectedToWrite:Int64){if totalBytesWritten>expected{error=failure("文件大小不符 / Unexpected file size");downloadTask.cancel()};progress?(min(1,Double(totalBytesWritten)/Double(max(1,expected))))}
 func urlSession(_ session:URLSession,downloadTask:URLSessionDownloadTask,didFinishDownloadingTo location:URL){do{guard let response=downloadTask.response as? HTTPURLResponse,response.statusCode==200 else{throw failure("下载暂不可用 / Download unavailable")};try FileManager.default.moveItem(at:location,to:destination)}catch{self.error=error}}
 func urlSession(_ session:URLSession,task:URLSessionTask,didCompleteWithError error:Error?){if self.error==nil{self.error=error};done.signal()}
 func urlSession(_ session:URLSession,task:URLSessionTask,willPerformHTTPRedirection response:HTTPURLResponse,newRequest request:URLRequest,completionHandler:@escaping(URLRequest?)->Void){completionHandler(request.url?.scheme=="https" ? request:nil)}
}
final class Engine {
 var cancelled=false;var transfer:Transfer?;var progress:((String,Double)->Void)?
 func cancel(){cancelled=true;transfer?.cancel()}
 func check() throws {if cancelled{throw failure("已取消 / Cancelled")}}
 func verify(_ folder:URL,_ manifest:[String:Any]) throws {
  for file in manifest["files"] as! [[String:Any]] {try check();let path=folder.appendingPathComponent(file["name"] as! String),size=(try path.resourceValues(forKeys:[.fileSizeKey])).fileSize ?? -1
   guard size==(file["bytes"] as! NSNumber).intValue,try sha(path)==file["sha256"] as! String else{throw failure("模型校验失败 / Model verification failed")}}
 }
 func install(_ model:[String:Any],data:URL,downloads:URL) throws -> URL {
  let fm=FileManager.default;guard fm.fileExists(atPath:data.appendingPathComponent("zotero.sqlite").path) else{throw failure("请选择包含 zotero.sqlite 的 Zotero 数据目录 / Choose a Zotero data directory containing zotero.sqlite")}
  let root=data.appendingPathComponent("paper-nexus-models");try fm.createDirectory(at:root,withIntermediateDirectories:true)
  let fd=open(root.appendingPathComponent(".installer.lock").path,O_CREAT|O_RDWR,0o600);guard fd>=0 else{throw failure("无法写入目录 / Cannot write to folder")};defer{flock(fd,LOCK_UN);close(fd)}
  guard flock(fd,LOCK_EX|LOCK_NB)==0 else{throw failure("另一个安装器正在运行 / Another installer is running")}
  let work=root.appendingPathComponent(".setup-"+UUID().uuidString);try fm.createDirectory(at:work,withIntermediateDirectories:true);defer{try? fm.removeItem(at:work)}
  try fm.createDirectory(at:downloads,withIntermediateDirectories:true)
  let plugin=config["plugin"] as! [String:Any],manifest=model["manifest"] as! [String:Any],id=model["id"] as! String,modelVersion=manifest["version"] as! String,target=root.appendingPathComponent(id).appendingPathComponent(modelVersion)
  let xpi=downloads.appendingPathComponent(plugin["name"] as! String)
  func fetch(_ asset:[String:Any],_ path:URL,_ phase:String,_ offset:Double,_ span:Double) throws {try check();let t=Transfer();transfer=t;t.progress={[weak self] value in self?.progress?(phase,offset+value*span)};try t.download(asset,to:path);transfer=nil}
  if !fm.fileExists(atPath:xpi.path) || (try? sha(xpi)) != plugin["sha256"] as? String {
   let downloaded=work.appendingPathComponent("plugin.xpi");progress?("plugin",0.04);try fm.copyItem(at:resources.appendingPathComponent("plugin.xpi"),to:downloaded);guard try sha(downloaded)==plugin["sha256"] as! String else{throw failure("插件校验失败 / Plugin verification failed")};try check()
   if fm.fileExists(atPath:xpi.path){_ = try fm.replaceItemAt(xpi,withItemAt:downloaded)}else{try fm.moveItem(at:downloaded,to:xpi)}
  }
  var usable=false
  if fm.fileExists(atPath:target.path){progress?("verify",0.08);usable=(try? verify(target,manifest)) != nil}
  try check()
  if !usable {
   let archive=work.appendingPathComponent("model.pnmodel"),asset=model["package"] as! [String:Any]
   if let local=argument("--package-dir"){try fm.copyItem(at:URL(fileURLWithPath:local).appendingPathComponent(asset["name"] as! String),to:archive);progress?("model",0.88);guard try sha(archive)==asset["sha256"] as! String else{throw failure("文件校验失败 / File verification failed")}}else{try fetch(asset,archive,"model",0.08,0.80)};try check();progress?("verify",0.89)
   let extracted=work.appendingPathComponent("verified"),process=Process();process.executableURL=URL(fileURLWithPath:"/usr/bin/ditto");process.arguments=["-x","-k",archive.path,extracted.path];process.standardOutput=FileHandle.nullDevice;process.standardError=FileHandle.nullDevice;try process.run();process.waitUntilExit();guard process.terminationStatus==0 else{throw failure("模型解压失败 / Unable to extract model")}
   let actual=try JSONSerialization.jsonObject(with:Data(contentsOf:extracted.appendingPathComponent("manifest.json"))) as! [String:Any];guard NSDictionary(dictionary:actual).isEqual(to:manifest) else{throw failure("模型清单不匹配 / Model manifest mismatch")};try verify(extracted,manifest);try check();progress?("install",0.97)
   try fm.createDirectory(at:target.deletingLastPathComponent(),withIntermediateDirectories:true)
   let backup=work.appendingPathComponent("previous");if fm.fileExists(atPath:target.path){try fm.moveItem(at:target,to:backup)}
   do{try fm.moveItem(at:extracted,to:target)}catch{if fm.fileExists(atPath:backup.path){try? fm.moveItem(at:backup,to:target)};throw error}
  }
  let pointer=target.deletingLastPathComponent().appendingPathComponent("active.json");try JSONSerialization.data(withJSONObject:manifest,options:[.sortedKeys]).write(to:pointer,options:.atomic)
  progress?("done",1);return xpi
 }
}
if CommandLine.arguments.contains("--quiet") {
 do{guard let target=argument("--data-dir"),let downloads=argument("--download-dir"),let firstModel=modelRows.first(where:{$0["id"] as? String==(argument("--model") ?? "minilm").components(separatedBy:",").first}) else{throw failure("Missing explicit destination or unknown model")};let engine=Engine();if CommandLine.arguments.contains("--cancel-test"){engine.progress={phase,value in if phase=="model"&&value>0.08{engine.cancel()}}};let ids=(argument("--model") ?? (firstModel["id"] as! String)).components(separatedBy:",");for id in ids{guard let model=modelRows.first(where:{$0["id"] as? String==id}) else{throw failure("Unknown model")};let xpi=try engine.install(model,data:URL(fileURLWithPath:target),downloads:URL(fileURLWithPath:downloads));print(xpi.path)};exit(0)}catch{fputs(error.localizedDescription+"\n",stderr);exit(1)}
}
let app=NSApplication.shared
final class Track:NSView {
 var doubleValue:Double=0{didSet{needsDisplay=true}};var maxValue:Double=1;var isIndeterminate=false;var tint=NSColor(calibratedRed:0.07,green:0.29,blue:0.31,alpha:1){didSet{needsDisplay=true}}
 override func draw(_ dirtyRect:NSRect){NSColor(calibratedRed:0.91,green:0.925,blue:0.91,alpha:1).setFill();NSBezierPath(roundedRect:bounds,xRadius:bounds.height/2,yRadius:bounds.height/2).fill();if doubleValue>0{tint.setFill();NSBezierPath(roundedRect:NSRect(x:0,y:0,width:max(bounds.height,bounds.width*min(1,doubleValue/maxValue)),height:bounds.height),xRadius:bounds.height/2,yRadius:bounds.height/2).fill()}}
}
final class UI:NSObject,NSApplicationDelegate,NSWindowDelegate {
 var window:NSWindow!,status:NSTextField!,heading:NSTextField!,intro:NSTextField!,targetLabel:NSTextField!,targetButton:NSButton!,action:NSButton!,cancel:NSButton!,help:NSButton!,languageMenu:NSPopUpButton!,bar:Track!
 var options:[NSButton]=[],details:[NSTextField]=[],modelBars:[Track]=[],completed=Set<Int>(),downloadBegan=Date(),working=false,complete=false,selected=Set([0]),language=(argument("--lang") ?? ((Locale.preferredLanguages.first ?? "en").hasPrefix("zh") ? "zh":"en")),data=defaultData(),engine:Engine?,xpi:URL?
 func tr(_ zh:String,_ en:String)->String{language=="zh" ? zh:en}
 func label(_ text:String,_ size:CGFloat,_ weight:NSFont.Weight,_ frame:NSRect)->NSTextField{let l=NSTextField(wrappingLabelWithString:text);l.font = nexusFont(size,weight);l.frame=frame;window.contentView!.addSubview(l);return l}
 func refresh(){window.title=tr("Paper Nexus 安装助手","Paper Nexus Installer");heading.stringValue=tr("把文献，连成研究线索。","Connect your research.");intro.stringValue=tr("选择至少一个本地模型，可多选。以后仅更新插件。","Choose one or more models. Update the plugin independently.")
  for i in 0..<options.count{options[i].title=modelRows[i][language=="zh" ? "titleZh":"titleEn"] as! String;options[i].state=selected.contains(i) ? .on:.off;details[i].stringValue=completed.contains(i) ? tr("已安装 · 可在插件中切换","Installed · Available in plugin settings"):(modelRows[i][language=="zh" ? "detailZh":"detailEn"] as! String)}
  action.isEnabled = !working && !selected.isEmpty;targetLabel.stringValue=tr("Zotero 数据目录","Zotero data folder");targetButton.title=data.path;help.title=tr("安装帮助","Help");action.title=complete ? tr("打开插件文件夹","Show plugin file"):tr("下载并安装","Download & install");cancel.title=tr("取消","Cancel")
  status.stringValue=complete ? tr("模型已就绪。在 Zotero 中从文件安装 XPI，然后在设置中启用所选模型。","Model ready. Install the XPI from file in Zotero, then enable your chosen model in Settings."):tr("无需账户或管理员权限。文献内容保留在本机。","No account or administrator access. Library content stays local.")
 }
 func applicationDidFinishLaunching(_ notification:Notification){app.setActivationPolicy(.regular);window=NSWindow(contentRect:NSRect(x:0,y:0,width:620,height:570),styleMask:[.titled,.closable,.miniaturizable],backing:.buffered,defer:false);window.delegate=self;window.appearance=NSAppearance(named:.aqua);window.backgroundColor=NSColor(calibratedRed:0.975,green:0.97,blue:0.95,alpha:1);window.contentView!.wantsLayer=true;window.contentView!.layer?.backgroundColor=window.backgroundColor.cgColor
  let teal=NSColor(calibratedRed:0.07,green:0.25,blue:0.28,alpha:1);let brand=label("PAPER NEXUS  /  FOR ZOTERO",11,.semibold,NSRect(x:32,y:521,width:430,height:20));brand.textColor=teal
  let image=NSImageView(frame:NSRect(x:523,y:467,width:64,height:64));image.image=NSImage(contentsOf:resources.appendingPathComponent("nexus.png"));image.imageScaling = .scaleProportionallyUpOrDown;window.contentView!.addSubview(image)
  heading=label("",27,.semibold,NSRect(x:32,y:468,width:478,height:40));heading.textColor=teal;intro=label("",13,.regular,NSRect(x:32,y:420,width:556,height:38));intro.textColor = .secondaryLabelColor
  for i in 0..<modelRows.count{let y=CGFloat(304-i*99),card=NSView(frame:NSRect(x:30,y:y,width:560,height:92));card.wantsLayer=true;card.layer?.backgroundColor=NSColor.white.withAlphaComponent(0.75).cgColor;card.layer?.cornerRadius=12;window.contentView!.addSubview(card)
   let button=NSButton(checkboxWithTitle:"",target:self,action:#selector(selectModel(_:)));button.tag=i;button.frame=NSRect(x:46,y:y+57,width:520,height:25);button.font = nexusFont(15,.semibold);window.contentView!.addSubview(button);options.append(button)
   let detail=label("",12,.regular,NSRect(x:69,y:y+12,width:493,height:41));detail.textColor = .secondaryLabelColor;details.append(detail)
   let track=Track(frame:NSRect(x:69,y:y+6,width:493,height:4));track.isIndeterminate=false;track.maxValue=1;track.isHidden=true;window.contentView!.addSubview(track);modelBars.append(track)
  }
  targetLabel=label("",12,.medium,NSRect(x:34,y:172,width:230,height:19));targetButton=NSButton(title:"",target:self,action:#selector(chooseFolder));targetButton.bezelStyle = .rounded;targetButton.frame=NSRect(x:30,y:132,width:561,height:33);targetButton.cell?.lineBreakMode = .byTruncatingMiddle;window.contentView!.addSubview(targetButton)
  status=label("",12,.regular,NSRect(x:34,y:81,width:554,height:41));status.textColor = .secondaryLabelColor
  bar=Track(frame:NSRect(x:34,y:69,width:553,height:5));bar.isIndeterminate=false;bar.maxValue=1;bar.isHidden=true;window.contentView!.addSubview(bar)
  help=NSButton(title:"",target:self,action:#selector(openHelp));help.bezelStyle = .inline;help.frame=NSRect(x:28,y:26,width:88,height:25);window.contentView!.addSubview(help)
  languageMenu=NSPopUpButton(frame:NSRect(x:126,y:24,width:112,height:29),pullsDown:false);languageMenu.addItems(withTitles:["简体中文","English"]);languageMenu.selectItem(at:language=="zh" ? 0:1);languageMenu.target=self;languageMenu.action=#selector(changeLanguage);window.contentView!.addSubview(languageMenu)
  cancel=NSButton(title:"",target:self,action:#selector(cancelWork));cancel.bezelStyle = .rounded;cancel.frame=NSRect(x:296,y:22,width:94,height:33);cancel.isHidden=true;window.contentView!.addSubview(cancel)
  action=NSButton(title:"",target:self,action:#selector(start));action.bezelStyle = .rounded;action.frame=NSRect(x:402,y:19,width:187,height:39);action.keyEquivalent="\r";action.isBordered=false;action.wantsLayer=true;action.layer?.cornerRadius=8;action.layer?.backgroundColor=teal.cgColor;action.contentTintColor = .white;window.contentView!.addSubview(action)
  func fonts(_ view:NSView){if let c=view as? NSControl,let f=c.font{c.font=nexusFont(f.pointSize,NSFontManager.shared.traits(of:f).contains(.boldFontMask) ? .semibold:.regular)};view.subviews.forEach{fonts($0)}};fonts(window.contentView!)
  refresh();window.center();window.makeKeyAndOrderFront(nil);app.activate(ignoringOtherApps:true)
  if CommandLine.arguments.contains("--progress-preview"){for option in options{option.state = .on;option.isEnabled=false};action.isEnabled=false;targetButton.isEnabled=false;languageMenu.isEnabled=false;cancel.isHidden=false;let first=modelRows[0];updateCard(first,"done",1);if modelRows.count>1{downloadBegan=Date().addingTimeInterval(-2);updateCard(modelRows[1],"model",0.42)};bar.isHidden=false;bar.doubleValue=0.65;status.stringValue=tr("1 个模型已安装 · 正在下载下一个","1 model installed · Downloading the next")}
  if let path=argument("--screenshot"){DispatchQueue.main.asyncAfter(deadline:.now()+0.8){let view=self.window.contentView!,rep=view.bitmapImageRepForCachingDisplay(in:view.bounds)!;view.cacheDisplay(in:view.bounds,to:rep);try! rep.representation(using:.png,properties:[:])!.write(to:URL(fileURLWithPath:path));app.terminate(nil)}}
 }
 func updateCard(_ model:[String:Any],_ phase:String,_ value:Double){guard let i=modelRows.firstIndex(where:{$0["id"] as? String==model["id"] as? String}) else{return};modelBars[i].isHidden=false;modelBars[i].doubleValue=value
  if phase=="model"{let total=(model["package"] as! [String:Any])["bytes"] as! Double,bytes=max(0,(value-0.08)/0.80)*total,seconds=max(0.1,Date().timeIntervalSince(downloadBegan)),rate=bytes/seconds;details[i].stringValue=tr("下载中","Downloading")+" · "+String(format:"%.1f / %.1f MB · %.1f MB/s",bytes/1e6,total/1e6,rate/1e6)}
  else{let names=["plugin":tr("准备插件","Preparing plugin"),"verify":tr("校验中","Verifying"),"install":tr("安装中","Installing"),"done":tr("已安装 · 可在插件中切换","Installed · Available in plugin settings")];details[i].stringValue=names[phase] ?? phase}
  if phase=="done"{completed.insert(i);details[i].textColor=NSColor(calibratedRed:0.12,green:0.48,blue:0.36,alpha:1);modelBars[i].tint=details[i].textColor!}
 }
 @objc func selectModel(_ sender:NSButton){if sender.state == .on{selected.insert(sender.tag)}else{selected.remove(sender.tag)};complete=false;refresh()}
 @objc func chooseFolder(){let panel=NSOpenPanel();panel.canChooseDirectories=true;panel.canChooseFiles=false;panel.directoryURL=data;panel.beginSheetModal(for:window){answer in if answer == .OK,let url=panel.url{self.data=url;self.complete=false;self.refresh()}}}
 @objc func changeLanguage(){language=languageMenu.indexOfSelectedItem==0 ? "zh":"en";refresh()}
 @objc func openHelp(){NSWorkspace.shared.open(URL(string:"https://github.com/JunyanKang/paper-nexus/blob/main/docs/INSTALL.md")!)}
 @objc func cancelWork(){engine?.cancel();cancel.isEnabled=false;status.stringValue=tr("正在取消…","Cancelling…")}
 func busy(_ value:Bool){working=value;options.forEach{$0.isEnabled = !value};languageMenu.isEnabled = !value;targetButton.isEnabled = !value;action.isEnabled = !value;cancel.isHidden = !value;cancel.isEnabled=true;bar.isHidden = !value}
 @objc func start(){if complete,let file=xpi{NSWorkspace.shared.activateFileViewerSelecting([file]);return};let worker=Engine();engine=worker;completed.removeAll();for i in selected{modelBars[i].doubleValue=0;modelBars[i].isHidden=false;details[i].textColor = .secondaryLabelColor;details[i].stringValue=tr("等待下载","Waiting to download")};busy(true);bar.doubleValue=0;status.stringValue=tr("正在准备…","Preparing…");guard !selected.isEmpty else{return};let target=data,chosen=selected.sorted().map{modelRows[$0]},downloads=FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Caches/PaperNexusInstaller/"+productVersion)
  DispatchQueue.global(qos:.userInitiated).async{do{var file:URL?;for (index,model) in chosen.enumerated(){self.downloadBegan=Date();worker.progress={[weak self] phase,value in DispatchQueue.main.async{guard let self=self,self.working else{return};self.bar.doubleValue=(Double(index)+value)/Double(chosen.count);self.updateCard(model,phase,value);let names=["plugin":self.tr("准备插件","Preparing plugin"),"model":self.tr("下载模型","Downloading model"),"verify":self.tr("校验模型","Verifying model"),"install":self.tr("安装模型","Installing model"),"done":self.tr("完成","Done")];self.status.stringValue=String(index+1)+"/"+String(chosen.count)+" · "+(model[self.language=="zh" ? "titleZh":"titleEn"] as! String)+" · "+(names[phase] ?? phase)+" "+String(Int(value*100))+"%"}};file=try worker.install(model,data:target,downloads:downloads)};DispatchQueue.main.async{self.xpi=file;self.complete=true;self.busy(false);self.refresh()}}catch{DispatchQueue.main.async{self.busy(false);self.status.stringValue=worker.cancelled ? self.tr("已取消，已安装的模型保留。","Cancelled. Installed models retained."):self.tr("未完成，可重试或更换 Zotero 数据目录。","Not completed. Retry or choose the Zotero data folder.");if !worker.cancelled{let alert=NSAlert();alert.messageText=self.tr("安装未完成","Installation not completed");alert.informativeText=error.localizedDescription;alert.beginSheetModal(for:self.window)}}}}

 }
 func windowShouldClose(_ sender:NSWindow)->Bool{return !working}
 func applicationShouldTerminate(_ sender:NSApplication)->NSApplication.TerminateReply{return working ? .terminateCancel:.terminateNow}
 func applicationShouldTerminateAfterLastWindowClosed(_ sender:NSApplication)->Bool{return true}
}
let delegate=UI();app.delegate=delegate;app.run()
