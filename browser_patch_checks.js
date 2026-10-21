<script>
(async()=>{
const assert=(v,m)=>{if(!v)throw Error(m)};
const until=async(fn)=>{for(let i=0;i<300;i++){if(fn())return;await new Promise(r=>setTimeout(r,25))}throw Error('Timeout')};
try {
 await window.appReady;
 location.hash='#settings';
 await until(()=>document.querySelector('#patch-version')?.textContent.includes('2.1.1'));
 assert(document.querySelector('#patch-file').disabled,'Source mode disables installer');
 assert(!document.querySelector('#settings-advanced-tools').open,'Advanced tools collapsed');
 const realFetch=window.fetch;
 let uploads=0;
 window.fetch=async(url,opts)=>{
  if(url==='/api/updates')return new Response(JSON.stringify({version:'2.1.1',supported:true,token:'test'}));
  if(url==='/api/updates/stage'){
   uploads++;
   return new Response(JSON.stringify({id:'test-stage',version:'2.1.2',files:47,notes:'แก้ไขการแสดงผล <img src=x onerror=alert(1)>'}));
  }
  return realFetch(url,opts);
 };
 await window.mountPatchSettings();
 const input=document.querySelector('#patch-file');
 assert(!input.disabled,'EXE supports file picker');
 const transfer=new DataTransfer(); transfer.items.add(new File(['zip'],'release.zip',{type:'application/zip'}));
 input.files=transfer.files;input.dispatchEvent(new Event('change'));
 await until(()=>!document.querySelector('#patch-preview').hidden);
 assert(uploads===1,'One upload');
 assert(!document.querySelector('#patch-notes img'),'Manifest notes escaped');
 assert(document.querySelector('#patch-summary').textContent.includes('2.1.2'),'Preview version');
 document.querySelector('#patch-cancel').click();
 assert(document.querySelector('#patch-preview').hidden,'Cancel resets preview');
 assert(!document.querySelector('#patch-file').value,'Cancel clears file');
 assert(document.documentElement.scrollWidth<=innerWidth,'No horizontal overflow');
 window.fetch=realFetch;
 document.body.dataset.testResult='PASS: settings, source guard, EXE file picker, ZIP preview, safe notes, cancel, responsive layout';
} catch(e){document.body.dataset.testResult='FAIL: '+e.message;}
})();
</script>