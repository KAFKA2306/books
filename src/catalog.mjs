const DROP=/[（(【〈\[](?:新装改訂版|第?[0-9０-９一二三四五六七八九十]+版|ジュールコミックス|講談社タイガ|ブルーバックス|PHP新書|ＰＨＰ新書|新潮文庫|健康ライブラリー|岩波ブックレット|講談社現代新書|講談社学術文庫|日経BPムック|日経ＢＰムック|NATIONAL|ＮＡＴＩＯＮＡＬ|ちくま学芸文庫|ファーストブック|創元クライム・クラブ|光文社古典新訳文庫|NIKKEI BP|ＮＩＫＫＥＩ ＢＰ|講談社選書メチエ|SB新書|ＳＢ新書|発達障害を考える|ビタミン文庫|日経ビジネス人文庫|Harvard|Ｈａｒｖａｒｄ)[^）)】〉\]]*[）)】〉\]]/gi;
const RENAMES=new Map([['あかげのあん','赤毛のアン'],['ナビ付き洋書赤毛のアン','赤毛のアン'],['赤毛のアン Anne of Green Gables 英語版原文','赤毛のアン'],['ゆるきゃん','ゆるキャン'],['トーイック金のフレーズ','TOEIC 金のフレーズ'],['トーイックリスニングリーディング問題集2','TOEIC リスニング・リーディング問題集'],['トーイックテスト究極の模試','TOEIC 究極の模試'],['トーイック公式問題集新形式対応版','TOEIC 公式問題集'],['TOEFLあいてぃーぴー直前模試','TOEFL ITP直前模試'],['かふか短編集','カフカ短編集'],['世界の終わりとハードボイルドワンダーランど','世界の終わりとハードボイルド・ワンダーランド'],['騎士団長ゴロシ','騎士団長殺し']]);
export const cleanSpace=(v='')=>String(v).normalize('NFKC').replace(/\u3000/g,' ').replace(/\s+/g,' ').trim().replace(/^[,、\s]+|[,、\s]+$/g,'');
export function normalizeTitle(value=''){
 let s=cleanSpace(value);if(!s)return'';
 for(const p of [/^(日経サイエンス)\s*[0-9０-９]{2,4}年\s*[0-9０-９]{1,2}月号.*$/i,/^(ニュートン)\s*[0-9０-９]{2,4}年\s*[0-9０-９]{1,2}月号.*$/i,/^(将棋世界)\s*[0-9０-９]{4}年\s*[0-9０-９]{1,2}月号.*$/i,/^(山と溪谷)\s*[0-9０-９]{4}年\s*[0-9０-９]{1,2}月号.*$/i]){const m=s.match(p);if(m)return m[1]}
 s=s.replace(DROP,'').replace(/[【\[]第?[0-9一二三四五六七八九十]+版[】\]]/g,'').replace(/〈新装改訂版〉/g,'').replace(/\((?:上|中|下)\)/g,'').replace(/(?:上下巻|上中下|上下|上・下|上\/下)\s*$/g,'').replace(/(?:第\s*)?[0-9０-９一二三四五六七八九十]+\s*(?:巻|冊)\s*$/g,'').replace(/\s*[：:]\s*[0-9０-９]+\s*$/g,'').replace(/\s+(?:上|中|下)\s*$/g,'').replace(/\s*(?:第\s*)?[0-9０-９一二三四五六七八九十]+版\s*$/g,'').replace(/\s*(?:新版|新訂|完全版|新形式対応版|映画オリジナル脚本版|電子版プラス)\s*$/g,'').replace(/\s+ほか[0-9０-９一二三四五六七八九十]+点\s*$/g,'').replace(/\s+No\.?\s*[0-9０-９]+.*$/gi,'').replace(/^(Tarzan)\s*[0-9]{4}年[0-9]{1,2}月[0-9]{1,2}日号.*$/i,'$1');
 s=cleanSpace(s);return RENAMES.get(s)??s
}
export const titleKey=(v='')=>normalizeTitle(v).normalize('NFKC').toLocaleLowerCase('ja').replace(/[\s\-‐‑–—―・･:：,，、。.!！?？「」『』【】〈〉《》()（）\[\]\/／&＆+＋]/g,'');
export const normalizeIsbn=(v='')=>String(v).toUpperCase().replace(/[^0-9X]/g,'');
export function isbn13CheckDigit(v){const d=normalizeIsbn(v);if(!/^\d{12}$/.test(d))throw new Error('ISBN-13 check digit requires 12 digits');const s=[...d].reduce((a,x,i)=>a+Number(x)*(i%2?3:1),0);return String((10-s%10)%10)}
export function isValidIsbn13(v){const d=normalizeIsbn(v);return /^\d{13}$/.test(d)&&d.at(-1)===isbn13CheckDigit(d.slice(0,12))}
export function isValidIsbn10(v){const d=normalizeIsbn(v);if(!/^[0-9]{9}[0-9X]$/.test(d))return false;return[...d].reduce((a,x,i)=>a+(x==='X'?10:Number(x))*(10-i),0)%11===0}
export function isbn10To13(v){const d=normalizeIsbn(v);if(!isValidIsbn10(d))return null;const b=`978${d.slice(0,9)}`;return b+isbn13CheckDigit(b)}
export function canonicalIsbn13(v){const d=normalizeIsbn(v);if(!d)return null;if(d.length===10)return isbn10To13(d);return isValidIsbn13(d)?d:null}
export function diceSimilarity(a,b){const l=titleKey(a),r=titleKey(b);if(l===r)return 1;if(l.length<2||r.length<2)return 0;const p=new Map;for(let i=0;i<l.length-1;i++){const x=l.slice(i,i+2);p.set(x,(p.get(x)||0)+1)}let n=0;for(let i=0;i<r.length-1;i++){const x=r.slice(i,i+2),c=p.get(x)||0;if(c){n++;p.set(x,c-1)}}return 2*n/((l.length-1)+(r.length-1))}
export function precheckCandidates(candidates,catalog,{similarityThreshold=.86}={}){
 const isbnMap=new Map(catalog.editions.filter(e=>e.isbn13).map(e=>[e.isbn13,e])),titleMap=new Map(catalog.works.map(w=>[w.title_key,w])),batchIsbn=new Set,batchTitle=new Set,results=[];
 for(const [index,input]of candidates.entries()){
  const normalized_title=normalizeTitle(input.title),key=titleKey(normalized_title),raw=normalizeIsbn(input.isbn13??input.isbn10??input.isbn??''),isbn13=canonicalIsbn13(raw),errors=[],warnings=[];let action='create_work',matched=null;
  if(!normalized_title)errors.push('書名が空です。');if(raw&&!isbn13)errors.push('ISBNの形式またはチェックディジットが不正です。');
  if(isbn13&&isbnMap.has(isbn13)){const e=isbnMap.get(isbn13);matched=catalog.works.find(w=>w.work_id===e.work_id)||null;errors.push(`ISBN ${isbn13} は既に登録済みです。`)}
  if(isbn13&&batchIsbn.has(isbn13))errors.push(`同じ入力内でISBN ${isbn13} が重複しています。`);
  const exact=titleMap.get(key);if(exact){matched=exact;if(!isbn13)errors.push('ISBN未指定かつ正規化書名が既存作品と一致します。');else if(!errors.length){action='add_edition';warnings.push('既存作品へ新しい版として追加します。')}}
  if(key&&batchTitle.has(key)&&!isbn13)errors.push('同じ入力内で正規化書名が重複しています。');
  if(!exact&&key){const similar=catalog.works.map(work=>({work,score:diceSimilarity(normalized_title,work.title)})).filter(x=>x.score>=similarityThreshold).sort((a,b)=>b.score-a.score).slice(0,3);if(similar.length)warnings.push(`類似作品候補: ${similar.map(x=>`${x.work.title} (${Math.round(x.score*100)}%)`).join(' / ')}`)}
  if(isbn13)batchIsbn.add(isbn13);if(key)batchTitle.add(key);if(errors.length)action='blocked';results.push({index,input,normalized_title,title_key:key,isbn13,action,matched_work_id:matched?.work_id??null,matched_title:matched?.title??null,errors,warnings,ok:!errors.length})
 }
 return{ok:results.every(x=>x.ok),summary:{total:results.length,allowed:results.filter(x=>x.ok).length,blocked:results.filter(x=>!x.ok).length,create_work:results.filter(x=>x.action==='create_work').length,add_edition:results.filter(x=>x.action==='add_edition').length},results}
}
