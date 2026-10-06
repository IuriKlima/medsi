/** Minimal private executive PDF. No remote fonts, assets, URLs or browser execution. */
export function executivePdf(rows:unknown[][]):Buffer{
 const escape=(text:string)=>text.replace(/[\\()]/g,'\\$&').replace(/[^\x20-\x7e\xa0-\xff]/g,c=>({'—':'-','–':'-','÷':'/','×':'x','→':'>'}[c]??'?'));
 const lines=rows.flatMap(row=>row.map(v=>String(v??'')).join(' | ').split(/\r?\n/).flatMap(line=>{
  if(!line)return [''];const words=line.split(/\s+/),result:string[]=[];let current='';
  for(const word of words){for(let start=0;start<word.length;start+=95){const part=word.slice(start,start+95);if((current+' '+part).length>98){result.push(current);current='';}current+=(current?' ':'')+part;}}
  if(current)result.push(current);return result;
 }));
 const pages=Array.from({length:Math.max(1,Math.ceil(lines.length/49))},(_,i)=>lines.slice(i*49,(i+1)*49));
 const objects:string[]=['<< /Type /Catalog /Pages 2 0 R >>','', '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>'];
 const ids:number[]=[];
 for(const [index,page] of pages.entries()){
  const pageId=objects.length+1,contentId=pageId+1;ids.push(pageId);
  objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents '+contentId+' 0 R >>');
  const stream='BT /F1 8 Tf 42 792 Td 14 TL '+page.map((line,i)=>(i?'T* ':'')+'('+escape(line)+') Tj').join('\n')+' ET\nBT /F1 8 Tf 42 32 Td (MedSI - documento privado - '+(index+1)+' / '+pages.length+') Tj ET';
  objects.push('<< /Length '+Buffer.byteLength(stream,'latin1')+' >>\nstream\n'+stream+'\nendstream');
 }
 objects[1]='<< /Type /Pages /Count '+pages.length+' /Kids ['+ids.map(id=>id+' 0 R').join(' ')+'] >>';
 let text='%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';const offsets=[0];
 objects.forEach((object,i)=>{offsets.push(Buffer.byteLength(text,'latin1'));text+=(i+1)+' 0 obj\n'+object+'\nendobj\n';});
 const xref=Buffer.byteLength(text,'latin1');text+='xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n'+offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size '+(objects.length+1)+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n';
 return Buffer.from(text,'latin1');
}
