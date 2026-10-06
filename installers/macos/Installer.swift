import Cocoa
import CryptoKit
import Foundation
import Darwin
import CoreText

let resources = Bundle.main.resourceURL!
for name in ["NexusSans-Regular.ttf","NexusSans-SemiBold.ttf"]{CTFontManagerRegisterFontsForURL(resources.appendingPathComponent(name) as CFURL,.process,nil)}
func nexusFont(_ size:CGFloat,_ weight:NSFont.Weight = .regular)->NSFont{NSFont(name:weight.rawValue>=NSFont.Weight.medium.rawValue ? "NexusSans-SemiBold":"NexusSans-Regular",size:size) ?? .systemFont(ofSize:size,weight:weight)}
let config = try! JSONSerialization.jsonObject(with: Data(contentsOf: resources.appendingPathComponent("installer.json"))) as! [String:Any]
func color(_ name:String)->NSColor{let hex=(config["appearance"] as! [String:String])[name]!,value=UInt32(hex.dropFirst(),radix:16)!;return NSColor(srgbRed:CGFloat((value>>16)&255)/255,green:CGFloat((value>>8)&255)/255,blue:CGFloat(value&255)/255,alpha:1)}
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
func modelRoot(_ data:URL)->URL {
 if let bytes=try? Data(contentsOf:data.appendingPathComponent("paper-nexus-model-location.json")),bytes.count<16384,let record=(try? JSONSerialization.jsonObject(with:bytes)) as? [String:Any],record["schema"] as? Int==1,let path=record["root"] as? String,path.hasPrefix("/"){return URL(fileURLWithPath:path)}
 return data.appendingPathComponent("paper-nexus-models")
}
func isDirectory(_ url:URL)->Bool{var directory:ObjCBool=false;return FileManager.default.fileExists(atPath:url.path,isDirectory:&directory)&&directory.boolValue}
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
 func fetch(_ asset:[String:Any],_ path:URL,_ phase:String,_ offset:Double,_ span:Double) throws {let fm=FileManager.default;try check();let t=Transfer();transfer=t;t.progress={[weak self] value in self?.progress?(phase,offset+value*span)};defer{transfer=nil};if let local=(phase=="plugin" ? argument("--plugin-dir"):nil) ?? argument("--package-dir"){try fm.copyItem(at:URL(fileURLWithPath:local).appendingPathComponent(asset["name"] as! String),to:path);guard try sha(path)==asset["sha256"] as! String,(try path.resourceValues(forKeys:[.fileSizeKey])).fileSize==(asset["bytes"] as! NSNumber).intValue else{throw failure("文件校验失败 / File verification failed")};progress?(phase,offset+span)}else{try t.download(asset,to:path)}}
 func downloadPlugin(downloads:URL) throws -> URL {
  let fm=FileManager.default;try fm.createDirectory(at:downloads,withIntermediateDirectories:true)
  let plugin=config["plugin"] as! [String:Any],xpi=downloads.appendingPathComponent(plugin["name"] as! String)
  if !fm.fileExists(atPath:xpi.path) || (try? sha(xpi)) != plugin["sha256"] as? String {
   let downloaded=downloads.appendingPathComponent(".plugin-"+UUID().uuidString);defer{try? fm.removeItem(at:downloaded)};progress?("plugin",0);try fetch(plugin,downloaded,"plugin",0,1);try check()
   if fm.fileExists(atPath:xpi.path){_ = try fm.replaceItemAt(xpi,withItemAt:downloaded)}else{try fm.moveItem(at:downloaded,to:xpi)}
  }
  try check();progress?("plugin",1);return xpi
 }
 func install(_ model:[String:Any],data:URL,downloads:URL,modelDirectory:URL?=nil) throws -> URL {
  let fm=FileManager.default;guard fm.fileExists(atPath:data.appendingPathComponent("zotero.sqlite").path) else{throw failure("请选择包含 zotero.sqlite 的 Zotero 数据目录 / Choose a Zotero data directory containing zotero.sqlite")}
  let root=modelDirectory ?? modelRoot(data);if root==data.appendingPathComponent("paper-nexus-models"){try fm.createDirectory(at:root,withIntermediateDirectories:true)};guard isDirectory(root) else{throw failure("模型目录不可用，请重新选择 / Model folder unavailable; choose an existing folder")}
  let fd=open(root.appendingPathComponent(".installer.lock").path,O_CREAT|O_RDWR,0o600);guard fd>=0 else{throw failure("无法写入目录 / Cannot write to folder")};defer{flock(fd,LOCK_UN);close(fd)}
  guard flock(fd,LOCK_EX|LOCK_NB)==0 else{throw failure("另一个安装器正在运行 / Another installer is running")}
  let work=root.appendingPathComponent(".setup-"+UUID().uuidString);try fm.createDirectory(at:work,withIntermediateDirectories:true);defer{try? fm.removeItem(at:work)}
  try fm.createDirectory(at:downloads,withIntermediateDirectories:true)
  let manifest=model["manifest"] as! [String:Any],id=model["id"] as! String,modelVersion=manifest["version"] as! String,target=root.appendingPathComponent(id).appendingPathComponent(modelVersion)
  let xpi=try downloadPlugin(downloads:downloads)

  var usable=false
  if fm.fileExists(atPath:target.path){progress?("verify",0.08);usable=(try? verify(target,manifest)) != nil}
  try check()
  if !usable {
   let asset=model["package"] as! [String:Any],archive=downloads.appendingPathComponent(asset["name"] as! String)
   if !fm.fileExists(atPath:archive.path) || (try? sha(archive)) != asset["sha256"] as? String {let partial=downloads.appendingPathComponent(".model-"+UUID().uuidString);defer{try? fm.removeItem(at:partial)};try fetch(asset,partial,"model",0.08,0.80);if fm.fileExists(atPath:archive.path){_ = try fm.replaceItemAt(archive,withItemAt:partial)}else{try fm.moveItem(at:partial,to:archive)}};try check();progress?("verify",0.89)
   let extracted=work.appendingPathComponent("verified"),process=Process();process.executableURL=URL(fileURLWithPath:"/usr/bin/ditto");process.arguments=["-x","-k",archive.path,extracted.path];process.standardOutput=FileHandle.nullDevice;process.standardError=FileHandle.nullDevice;try process.run();process.waitUntilExit();guard process.terminationStatus==0 else{throw failure("模型解压失败 / Unable to extract model")}
   let actual=try JSONSerialization.jsonObject(with:Data(contentsOf:extracted.appendingPathComponent("manifest.json"))) as! [String:Any];var actualIdentity=actual,expectedIdentity=manifest;actualIdentity.removeValue(forKey:"name");expectedIdentity.removeValue(forKey:"name");guard NSDictionary(dictionary:actualIdentity).isEqual(to:expectedIdentity) else{throw failure("模型清单不匹配 / Model manifest mismatch")};try verify(extracted,manifest);try check();progress?("install",0.97)
   try fm.createDirectory(at:target.deletingLastPathComponent(),withIntermediateDirectories:true)
   let backup=work.appendingPathComponent("previous");if fm.fileExists(atPath:target.path){try fm.moveItem(at:target,to:backup)}
   do{try fm.moveItem(at:extracted,to:target)}catch{if fm.fileExists(atPath:backup.path){try? fm.moveItem(at:backup,to:target)};throw error}
  }
  let pointer=target.deletingLastPathComponent().appendingPathComponent("active.json");try JSONSerialization.data(withJSONObject:manifest,options:[.sortedKeys]).write(to:pointer,options:.atomic)
  try JSONSerialization.data(withJSONObject:["schema":1,"root":root.standardizedFileURL.path],options:[.sortedKeys]).write(to:data.appendingPathComponent("paper-nexus-model-location.json"),options:.atomic)
  progress?("done",1);return xpi
 }
}
if CommandLine.arguments.contains("--quiet") {
 do{if CommandLine.arguments.contains("--plugin-only"){guard let downloads=argument("--download-dir") else{throw failure("Missing download directory")};let engine=Engine();if CommandLine.arguments.contains("--cancel-test"){engine.progress={_,value in if value>0{engine.cancel()}}};print(try engine.downloadPlugin(downloads:URL(fileURLWithPath:downloads)).path);exit(0)};guard let target=argument("--data-dir"),let downloads=argument("--download-dir"),let firstModel=modelRows.first(where:{$0["id"] as? String==(argument("--model") ?? "minilm").components(separatedBy:",").first}) else{throw failure("Missing explicit destination or unknown model")};let engine=Engine();if CommandLine.arguments.contains("--cancel-test"){engine.progress={phase,value in if phase=="model"&&value>0.08{engine.cancel()}}};let ids=(argument("--model") ?? (firstModel["id"] as! String)).components(separatedBy:",");for id in ids{guard let model=modelRows.first(where:{$0["id"] as? String==id}) else{throw failure("Unknown model")};let xpi=try engine.install(model,data:URL(fileURLWithPath:target),downloads:URL(fileURLWithPath:downloads),modelDirectory:argument("--model-dir").map{URL(fileURLWithPath:$0)});print(xpi.path)};exit(0)}catch{fputs(error.localizedDescription+"\n",stderr);exit(1)}
}
let app=NSApplication.shared
class QuietButton:NSButton {
 var primary=false,quiet=false,hover=false
 override func updateTrackingAreas(){super.updateTrackingAreas();trackingAreas.forEach{removeTrackingArea($0)};addTrackingArea(NSTrackingArea(rect:bounds,options:[.mouseEnteredAndExited,.activeInKeyWindow],owner:self,userInfo:nil))}
 override func mouseEntered(with event:NSEvent){hover=true;needsDisplay=true}
 override func mouseExited(with event:NSEvent){hover=false;needsDisplay=true}
 override func draw(_ dirtyRect:NSRect){let fill = !isEnabled ? color("disabled") : primary ? color(hover ? "accentHover":"accent") : color(hover ? "buttonHover" : quiet ? "quiet":"button");fill.setFill();NSBezierPath(roundedRect:bounds,xRadius:8,yRadius:8).fill();let text=NSAttributedString(string:title,attributes:[.font:nexusFont(13),.foregroundColor:!isEnabled ? color("disabledInk") : primary ? NSColor.white:color("ink")]);let size=text.size();text.draw(at:NSPoint(x:(bounds.width-size.width)/2,y:(bounds.height-size.height)/2))}
}
final class LanguageChoice:NSPopUpButton {
 override func draw(_ dirtyRect:NSRect){color(isEnabled ? "button":"disabled").setFill();NSBezierPath(roundedRect:bounds,xRadius:8,yRadius:8).fill();let text=NSAttributedString(string:titleOfSelectedItem ?? "",attributes:[.font:nexusFont(13),.foregroundColor:color(isEnabled ? "ink":"disabledInk")]);text.draw(at:NSPoint(x:10,y:(bounds.height-text.size().height)/2));let path=NSBezierPath();path.move(to:NSPoint(x:bounds.width-20,y:bounds.midY-2));path.line(to:NSPoint(x:bounds.width-16,y:bounds.midY+2));path.line(to:NSPoint(x:bounds.width-12,y:bounds.midY-2));color(isEnabled ? "ink":"disabledInk").setStroke();path.lineWidth=1.5;path.stroke()}
}
final class ModelChoice:NSButton {
 override func draw(_ dirtyRect:NSRect){let box=NSRect(x:0,y:(bounds.height-16)/2,width:16,height:16);color(state == .on ? "selected":"unchecked").setFill();NSBezierPath(roundedRect:box,xRadius:5,yRadius:5).fill();if state == .on{let path=NSBezierPath();path.move(to:NSPoint(x:3.84,y:box.minY+8.16));path.line(to:NSPoint(x:6.88,y:box.minY+11.36));path.line(to:NSPoint(x:12.48,y:box.minY+4.64));NSColor.white.setStroke();path.lineWidth=2.2;path.stroke()};let text=NSAttributedString(string:title,attributes:[.font:nexusFont(15,.semibold),.foregroundColor:color("ink")]);text.draw(at:NSPoint(x:26,y:(bounds.height-text.size().height)/2))}
}
final class Track:NSView {
 var doubleValue:Double=0{didSet{needsDisplay=true}};var maxValue:Double=1;var isIndeterminate=false;var tint=color("accent"){didSet{needsDisplay=true}}
 override func draw(_ dirtyRect:NSRect){color("track").setFill();NSBezierPath(roundedRect:bounds,xRadius:bounds.height/2,yRadius:bounds.height/2).fill();if doubleValue>0{tint.setFill();NSBezierPath(roundedRect:NSRect(x:0,y:0,width:max(bounds.height,bounds.width*min(1,doubleValue/maxValue)),height:bounds.height),xRadius:bounds.height/2,yRadius:bounds.height/2).fill()}}
}
final class UI:NSObject,NSApplicationDelegate,NSWindowDelegate {
 var window:NSWindow!,status:NSTextField!,heading:NSTextField!,intro:NSTextField!,targetLabel:NSTextField!,pathLabel:NSTextField!,targetButton:NSButton!,action:NSButton!,cancel:NSButton!,help:NSButton!,languageMenu:NSPopUpButton!
 var pluginLabel:NSTextField!,pluginButton:NSButton!,pluginBar:Track!
 var options:[NSButton]=[],details:[NSTextField]=[],modelBars:[Track]=[],completed=Set<Int>(),downloadBegan=Date(),working=false,complete=false,language=(argument("--lang") ?? ((Locale.preferredLanguages.first ?? "en").hasPrefix("zh") ? "zh":"en")),data=defaultData(),modelDirectory=modelRoot(defaultData()),engine:Engine?,xpi:URL?
 func tr(_ zh:String,_ en:String)->String{language=="zh" ? zh:en}
 func label(_ text:String,_ size:CGFloat,_ weight:NSFont.Weight,_ frame:NSRect)->NSTextField{let l=NSTextField(wrappingLabelWithString:text);l.font = nexusFont(size,weight);l.textColor=color("ink");l.frame=frame;window.contentView!.addSubview(l);return l}
 var selected:Set<Int>{Set(options.indices.filter{options[$0].state == .on})}
 func refresh(){window.title=tr("Paper Nexus 安装助手","Paper Nexus Installer");heading.stringValue=tr("把文献，连成研究线索。","Connect your research.");intro.stringValue=tr("选择至少一个本地模型，可多选。以后仅更新插件。","Choose one or more models. Update the plugin independently.")
  for i in 0..<options.count{details[i].textColor=color(completed.contains(i) ? "success":"muted");modelBars[i].tint=color(completed.contains(i) ? "success":"accent");options[i].title=modelRows[i][language=="zh" ? "titleZh":"titleEn"] as! String;details[i].stringValue=completed.contains(i) ? tr("已安装 · 可在插件中切换","Installed · Available in plugin settings"):(modelRows[i][language=="zh" ? "detailZh":"detailEn"] as! String)}
  action.isEnabled = !working && !selected.isEmpty;targetLabel.stringValue=tr("模型位置","Model folder");pathLabel.stringValue=modelDirectory.path.replacingOccurrences(of:FileManager.default.homeDirectoryForCurrentUser.path,with:"~");targetButton.title=tr("选择文件夹","Browse");help.title=tr("安装帮助","Help");pluginLabel.stringValue=tr("插件 XPI","Plugin XPI")+" · v"+productVersion;pluginButton.title=xpi == nil ? tr("下载插件","Download XPI"):tr("打开文件","Show XPI");action.title=complete ? tr("打开插件文件夹","Show plugin file"):tr("下载插件与模型","Get plugin & models");cancel.title=tr("取消","Cancel")
  status.stringValue=complete ? tr("模型已就绪。在 Zotero 中从文件安装 XPI，然后在网络设置中选择分析方案。","Model ready. Install the XPI from file in Zotero, then choose an analysis in Network settings."):tr("无需账户或管理员权限。文献内容保留在本机。","No account or administrator access. Library content stays local.")
 }
 func applicationDidFinishLaunching(_ notification:Notification){app.setActivationPolicy(.regular);window=NSWindow(contentRect:NSRect(x:0,y:0,width:620,height:456),styleMask:[.titled,.closable,.miniaturizable],backing:.buffered,defer:false);window.delegate=self;window.appearance=NSAppearance(named:.aqua);window.backgroundColor=color("paper");window.contentView!.wantsLayer=true;window.contentView!.layer?.backgroundColor=window.backgroundColor.cgColor
  let teal=color("accent");let brand=label("PAPER NEXUS  /  FOR ZOTERO",11,.semibold,NSRect(x:32,y:415,width:430,height:20));brand.textColor=teal
  let image=NSImageView(frame:NSRect(x:523,y:363,width:64,height:64));image.image=NSImage(contentsOf:resources.appendingPathComponent("nexus.png"));image.imageScaling = .scaleProportionallyUpOrDown;window.contentView!.addSubview(image)
  heading=label("",27,.semibold,NSRect(x:32,y:366,width:478,height:40));heading.textColor=teal;intro=label("",13,.regular,NSRect(x:32,y:330,width:556,height:24));intro.textColor = color("muted")
  pluginLabel=label("",13,.medium,NSRect(x:34,y:288,width:365,height:24));pluginLabel.textColor=teal
  pluginButton=QuietButton(title:"",target:self,action:#selector(downloadPlugin));pluginButton.bezelStyle = .rounded;pluginButton.frame=NSRect(x:450,y:286,width:138,height:28);window.contentView!.addSubview(pluginButton)
  pluginBar=Track(frame:NSRect(x:34,y:279,width:554,height:3));pluginBar.maxValue=1;pluginBar.isIndeterminate=false;pluginBar.isHidden=true;window.contentView!.addSubview(pluginBar)
  for i in 0..<modelRows.count{let y=CGFloat(212-i*72),card=NSView(frame:NSRect(x:30,y:y,width:560,height:64));card.wantsLayer=true;card.layer?.backgroundColor=color("card").cgColor;card.layer?.cornerRadius=12;window.contentView!.addSubview(card)
   let button=ModelChoice(checkboxWithTitle:"",target:self,action:#selector(selectModel(_:)));button.tag=i;button.state=i==0 ? .on:.off;button.frame=NSRect(x:46,y:y+34,width:520,height:25);button.font = nexusFont(15,.semibold);window.contentView!.addSubview(button);options.append(button)
   let detail=label("",12,.regular,NSRect(x:69,y:y+12,width:493,height:19));detail.textColor = color("muted");details.append(detail)
   let track=Track(frame:NSRect(x:69,y:y+5,width:493,height:3));track.isIndeterminate=false;track.maxValue=1;track.isHidden=true;window.contentView!.addSubview(track);modelBars.append(track)
  }
  targetLabel=label("",12,.medium,NSRect(x:34,y:107,width:100,height:22));pathLabel=label("",12,.regular,NSRect(x:126,y:107,width:350,height:22));pathLabel.maximumNumberOfLines=1;pathLabel.cell?.wraps=false;pathLabel.cell?.lineBreakMode = .byTruncatingMiddle;pathLabel.textColor = color("muted");targetButton=QuietButton(title:"",target:self,action:#selector(chooseFolder));targetButton.bezelStyle = .rounded;targetButton.frame=NSRect(x:480,y:104,width:108,height:28);targetButton.cell?.lineBreakMode = .byTruncatingMiddle;window.contentView!.addSubview(targetButton)
  status=label("",12,.regular,NSRect(x:34,y:59,width:554,height:37));status.textColor = color("muted")
  help=QuietButton(title:"",target:self,action:#selector(openHelp));(help as! QuietButton).quiet=true;help.bezelStyle = .inline;help.frame=NSRect(x:28,y:24,width:88,height:28);window.contentView!.addSubview(help)
  languageMenu=LanguageChoice(frame:NSRect(x:126,y:24,width:112,height:28),pullsDown:false);languageMenu.addItems(withTitles:["简体中文","English"]);languageMenu.selectItem(at:language=="zh" ? 0:1);languageMenu.target=self;languageMenu.action=#selector(changeLanguage);window.contentView!.addSubview(languageMenu)
  cancel=QuietButton(title:"",target:self,action:#selector(cancelWork));cancel.bezelStyle = .rounded;cancel.frame=NSRect(x:296,y:24,width:94,height:28);cancel.isHidden=true;window.contentView!.addSubview(cancel)
  action=QuietButton(title:"",target:self,action:#selector(start));action.bezelStyle = .rounded;action.frame=NSRect(x:402,y:20,width:187,height:36);(action as! QuietButton).primary=true;action.keyEquivalent="\r";action.isBordered=false;action.contentTintColor = .white;window.contentView!.addSubview(action)
  func fonts(_ view:NSView){if let c=view as? NSControl,let f=c.font{c.font=nexusFont(f.pointSize,f.fontName.contains("SemiBold") ? .semibold:.regular)};view.subviews.forEach{fonts($0)}};fonts(window.contentView!)
  refresh();window.center();window.makeKeyAndOrderFront(nil);app.activate(ignoringOtherApps:true)
  if let path=argument("--selection-check"){var checks:[String:Bool]=[:];checks["default-single"]=selected==Set([0]);options[0].performClick(nil);checks["empty-disabled"]=selected.isEmpty && !action.isEnabled;options[1].performClick(nil);checks["second-only"]=selected==Set([1]);refresh();checks["refresh-preserves"]=selected==Set([1]);options[0].performClick(nil);checks["both"]=selected==Set([0,1]);options[1].performClick(nil);checks["first-only"]=selected==Set([0]);checks["visible-downloads"]=pluginDownloads.lastPathComponent=="Paper Nexus" && !pluginDownloads.path.contains("Library/Caches");try! JSONSerialization.data(withJSONObject:checks,options:[.sortedKeys]).write(to:URL(fileURLWithPath:path));app.terminate(nil);return}
  if CommandLine.arguments.contains("--progress-preview"){for option in options{option.state = .on;option.isEnabled=false};action.isEnabled=false;targetButton.isEnabled=false;languageMenu.isEnabled=false;cancel.isHidden=false;let first=modelRows[0];updateCard(first,"done",1);if modelRows.count>1{downloadBegan=Date().addingTimeInterval(-2);updateCard(modelRows[1],"model",0.42)};status.stringValue=tr("1 个模型已安装 · 正在下载下一个","1 model installed · Downloading the next")}
  if let path=argument("--screenshot"){DispatchQueue.main.asyncAfter(deadline:.now()+0.8){let view=self.window.contentView!,rep=view.bitmapImageRepForCachingDisplay(in:view.bounds)!;view.cacheDisplay(in:view.bounds,to:rep);try! rep.representation(using:.png,properties:[:])!.write(to:URL(fileURLWithPath:path));app.terminate(nil)}}
 }
 func updateCard(_ model:[String:Any],_ phase:String,_ value:Double){guard let i=modelRows.firstIndex(where:{$0["id"] as? String==model["id"] as? String}) else{return};modelBars[i].isHidden=false;modelBars[i].doubleValue=value
  if phase=="model"{let total=(model["package"] as! [String:Any])["bytes"] as! Double,bytes=max(0,(value-0.08)/0.80)*total,seconds=max(0.1,Date().timeIntervalSince(downloadBegan)),rate=bytes/seconds;details[i].stringValue=tr("下载中","Downloading")+" · "+String(format:"%.1f / %.1f MB · %.1f MB/s",bytes/1e6,total/1e6,rate/1e6)}
  else{let names=["plugin":tr("下载插件","Downloading plugin"),"verify":tr("校验中","Verifying"),"install":tr("安装中","Installing"),"done":tr("已安装 · 可在插件中切换","Installed · Available in plugin settings")];details[i].stringValue=names[phase] ?? phase}
  if phase=="done"{completed.insert(i);details[i].textColor=color("success");modelBars[i].tint=details[i].textColor!}
 }
 @objc func selectModel(_ sender:NSButton){complete=false;completed.removeAll();for bar in modelBars{bar.isHidden=true};refresh()}
 @objc func chooseFolder(){let panel=NSOpenPanel();panel.canChooseDirectories=true;panel.canChooseFiles=false;panel.canCreateDirectories=true;panel.directoryURL=isDirectory(modelDirectory) ? modelDirectory:data;panel.beginSheetModal(for:window){answer in if answer == .OK,let url=panel.url{self.modelDirectory=url;self.complete=false;self.refresh()}}}
 @objc func changeLanguage(){language=languageMenu.indexOfSelectedItem==0 ? "zh":"en";refresh()}
 @objc func openHelp(){NSWorkspace.shared.open(URL(string:"https://github.com/JunyanKang/paper-nexus/blob/main/docs/INSTALL.md")!)}
 @objc func cancelWork(){engine?.cancel();cancel.isEnabled=false;status.stringValue=tr("正在取消…","Cancelling…")}
 func busy(_ value:Bool){working=value;pluginButton.isEnabled = !value;options.forEach{$0.isEnabled = !value};languageMenu.isEnabled = !value;targetButton.isEnabled = !value;action.isEnabled = !value && !selected.isEmpty;cancel.isHidden = !value;cancel.isEnabled=true}
 var pluginDownloads:URL{(FileManager.default.urls(for:.downloadsDirectory,in:.userDomainMask).first ?? FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Downloads")).appendingPathComponent("Paper Nexus")}
 @objc func downloadPlugin(){
  if let file=xpi,FileManager.default.fileExists(atPath:file.path){NSWorkspace.shared.activateFileViewerSelecting([file]);return}
  let worker=Engine();engine=worker;busy(true);pluginBar.isHidden=false;pluginBar.doubleValue=0;status.stringValue=tr("正在下载插件…","Downloading XPI…")
  worker.progress={[weak self] _,value in DispatchQueue.main.async{guard let self=self,self.working else{return};self.pluginBar.doubleValue=value;self.status.stringValue=self.tr("下载插件","Downloading XPI")+" · "+String(Int(value*100))+"%"}}
  let downloads=pluginDownloads;DispatchQueue.global(qos:.userInitiated).async{do{let file=try worker.downloadPlugin(downloads:downloads);DispatchQueue.main.async{self.xpi=file;self.busy(false);self.refresh();self.pluginBar.tint=color("success");self.status.stringValue=self.tr("插件已下载。打开文件，在 Zotero 中选择「从文件安装插件」。","XPI ready. Show the file, then choose Install Add-on From File in Zotero.")}}catch{DispatchQueue.main.async{self.busy(false);self.status.stringValue=worker.cancelled ? self.tr("已取消","Cancelled"):error.localizedDescription}}}
 }
 @objc func start(){guard !working else{return};let chosenIndices=selected.sorted();guard !chosenIndices.isEmpty else{return};if complete,let file=xpi{NSWorkspace.shared.activateFileViewerSelecting([file]);return};if !FileManager.default.fileExists(atPath:data.appendingPathComponent("zotero.sqlite").path){let panel=NSOpenPanel();panel.canChooseDirectories=true;panel.canChooseFiles=false;panel.message=tr("选择 Zotero 数据目录（包含 zotero.sqlite）","Choose the Zotero data folder (contains zotero.sqlite)");panel.beginSheetModal(for:window){answer in if answer == .OK,let url=panel.url{self.data=url;if FileManager.default.fileExists(atPath:url.appendingPathComponent("zotero.sqlite").path){if !isDirectory(self.modelDirectory){self.modelDirectory=modelRoot(url)};self.start()}}};return};if complete,let file=xpi{NSWorkspace.shared.activateFileViewerSelecting([file]);return};let worker=Engine();engine=worker;completed.removeAll();for i in chosenIndices{modelBars[i].doubleValue=0;modelBars[i].isHidden=false;details[i].textColor = color("muted");details[i].stringValue=tr("等待下载","Waiting to download")};busy(true);status.stringValue=tr("正在准备…","Preparing…");let target=data,modelTarget=modelDirectory,chosen=chosenIndices.map{modelRows[$0]},downloads=(FileManager.default.urls(for:.downloadsDirectory,in:.userDomainMask).first ?? FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Downloads")).appendingPathComponent("Paper Nexus")
  DispatchQueue.global(qos:.userInitiated).async{do{var file:URL?;for (index,model) in chosen.enumerated(){self.downloadBegan=Date();worker.progress={[weak self] phase,value in DispatchQueue.main.async{guard let self=self,self.working else{return};if phase != "plugin"{self.updateCard(model,phase,value)}else{self.pluginBar.isHidden=false;self.pluginBar.doubleValue=value};let names=["plugin":self.tr("下载插件","Downloading plugin"),"model":self.tr("下载模型","Downloading model"),"verify":self.tr("校验模型","Verifying model"),"install":self.tr("安装模型","Installing model"),"done":self.tr("完成","Done")];self.status.stringValue=String(index+1)+"/"+String(chosen.count)+" · "+(model[self.language=="zh" ? "titleZh":"titleEn"] as! String)+" · "+(names[phase] ?? phase)+" "+String(Int(value*100))+"%"}};file=try worker.install(model,data:target,downloads:downloads,modelDirectory:modelTarget)};DispatchQueue.main.async{self.xpi=file;self.complete=true;self.busy(false);self.refresh()}}catch{DispatchQueue.main.async{self.busy(false);self.status.stringValue=worker.cancelled ? self.tr("已取消，已安装的模型保留。","Cancelled. Installed models retained."):self.tr("未完成，可重试或更换 Zotero 数据目录。","Not completed. Retry or choose the Zotero data folder.");if !worker.cancelled{let alert=NSAlert();alert.messageText=self.tr("安装未完成","Installation not completed");alert.informativeText=error.localizedDescription;alert.beginSheetModal(for:self.window)}}}}

 }
 func windowShouldClose(_ sender:NSWindow)->Bool{return !working}
 func applicationShouldTerminate(_ sender:NSApplication)->NSApplication.TerminateReply{return working ? .terminateCancel:.terminateNow}
 func applicationShouldTerminateAfterLastWindowClosed(_ sender:NSApplication)->Bool{return true}
}
let delegate=UI();app.delegate=delegate;app.run()
