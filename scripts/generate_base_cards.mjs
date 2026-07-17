import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { godfieldFlashImages } from './godfieldFlashImages.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cards = [];
let serial = 0;

const attr = { '-': 'none', 火: 'fire', 水: 'water', 木: 'wood', 土: 'earth', 光: 'light', 闇: 'dark', 天: 'light' };
const deriveSystemFields = card => {
  const description = card.description || '';
  const fields = {};
  if (description.includes('2回攻撃')) fields.repeatCount = 2;
  if (description.includes('HP吸収')) fields.attackEffect = 'absorb_hp';
  if (description.includes('自分にも同じダメージ')) fields.attackEffect = 'damage_to_self';
  if (description.includes('攻撃力MP×2')) fields.attackEffect = 'magical';
  if (description.includes('攻撃先が自分を含めランダム')) fields.attackEffect = 'pestle';
  if (description.includes('昇天時に75%攻30')) fields.dyingAttack = { attack: 30, hitRate: 75, target: 'all' };
  if (description.includes('1ダメージ以上で即死')) fields.lethalOnDamage = true;
  if (description.includes('単体攻撃武器の攻撃力を倍にする')) fields.supportEffect = 'double_attack';
  if (description.includes('単体攻撃武器を100%攻にする')) fields.supportEffect = 'wide_attack';
  if (description.includes('属性に染める')) fields.supportEffect = 'set_attribute';
  if (description.includes('MP消費なしで奇跡') || description.includes('MP消費0で奇跡') || description.includes('MPなしで奇跡')) fields.supportEffect = 'magic_free';
  if (card.name === 'ちからの粉') {
    fields.supportEffect = 'increase_attack';
    fields.supportValue = 10;
    fields.additive = true;
  }
  if (description.includes('+￥10')) fields.moneyGain = 10;
  if (description.includes('+HP10または10ダメージ')) fields.randomHp = 10;
  if (description.includes('神器を3つ掃き飛ばす')) fields.removeItems = 3;
  if (description.includes('習得奇跡を2つ忘れさせる')) fields.removeMiracles = 2;
  if (description.includes('守護神が宿る') || description.includes('守護神が現れる')) fields.setAssistant = true;
  if (description.includes('超常現象が起こる')) fields.mystery = true;
  if (description.includes('HP0時に+HP10')) fields.reviveHp = 10;
  if (description.includes('手札を一新')) fields.redrawHand = true;
  if (description.includes('キネ発動時99ダメージ')) fields.mortar = true;
  if (description.includes('何でもはね返す')) fields.defenseEffect = 'reflect_any';
  else if (description.includes('無属性攻撃をはね返す')) fields.defenseEffect = 'reflect_weapon';
  else if (description.includes('奇跡をはね返す')) fields.defenseEffect = 'reflect_magic';
  else if (description.includes('無属性の攻撃を弾く')) fields.defenseEffect = 'flick_weapon';
  else if (description.includes('奇跡を弾く')) fields.defenseEffect = 'flick_magic';
  else if (description.includes('無属性武器を止める')) fields.defenseEffect = 'block_weapon';
  else if (description.includes('奇跡を止める')) fields.defenseEffect = 'block_magic';
  else if (description.includes('攻撃の属性を取り除く')) fields.defenseEffect = 'remove_attribute';
  const ringEffects = {
    火星の指輪: 'counter_damage_all',
    水星の指輪: 'counter_fog',
    木星の指輪: 'counter_dream',
    土星の指輪: 'counter_double_damage',
    天王の指輪: 'counter_flash',
    冥王の指輪: 'counter_darkcloud',
    海王の指輪: 'recover_double_mp',
    金星の指輪: 'absorb_money',
  };
  if (ringEffects[card.name]) fields.reactiveEffect = ringEffects[card.name];
  return fields;
};
const add = (category, name, data = {}) => {
  const id = `gf_${category}_${String(++serial).padStart(3, '0')}`;
  const card = {
    id, name, category, type: data.type || category, attribute: data.attribute || 'none',
    target: data.target || 'single', attack: 0, attackBonus: 0, defense: 0,
    hitRate: 100, healHp: 0, healMp: 0, costMoney: 0, costMp: 0,
    copies: 1, description: '', ...data,
    imageUrl: data.imageUrl || godfieldFlashImages[id] || '',
  };
  cards.push({ ...card, ...deriveSystemFields(card) });
};
const rate = percent => Math.round(percent * 5);

// 神器一覧-単体武器-: 通常武器
const normalWeapons = [
 ['-','銅のこん棒',1,0,1,.6],['-','銀のこん棒',1,0,10,.2],['-','金のこん棒',1,0,25,.2],['-','ムチ',2,0,1,.8],
 ['-','セイバーロッド',2,6,10,.2],['-','パンチ',3,0,1,1],['-','のこぶんぶん',3,0,10,.2,'2回攻撃'],['-','ハチェット',4,0,2,1.2],
 ['-','とげベルト',4,2,3,.2],['-','鎖ガマ',5,0,2,1.4],['-','打撃の鉄板',5,7,3,.2],['-','乱弾武剣',5,0,10,1.4,'無属性の攻撃を弾く'],
 ['-','硬いつち',6,0,2,1.6],['-','エルボーサック',6,3,3,.2],['-','なぎなたクラシック',7,0,3,1.6],['-','ゴーストソード',7,0,10,.2,'HP吸収'],
 ['-','ファイナル牙',8,0,3,1.6],['-','地獄のハサミ',8,0,15,.2,'1ダメージ以上で地獄病'],['-','パワーハルベルト',9,0,3,1.4],['-','疾風剣',9,0,10,.2,'1ダメージ以上で風邪'],
 ['-','ワンダーソード',10,0,4,1.4],['-','いんちきスピア',10,0,10,.2,'1ダメージ以上で夢'],['-','ソードシールド',10,10,15,.2],['-','反射剣',10,0,5,.6,'無属性攻撃をはね返す'],
 ['-','月光のオノ',10,0,10,.2,'奇跡をはね返す'],['-','グラビティメイス',11,0,4,.8],['-','エンゼルナイフ',11,0,15,.2,'奇跡を止める'],['-','六角凶',11,0,15,.2,'1ダメージ以上で暗雲'],
 ['-','もろぶっこみアクス',12,0,4,.8],['-','リアルゴーストソード',12,0,15,.2,'HP吸収'],['-','精霊の杖',12,0,20,.2,'MP消費なしで奇跡を使える'],['-','絶景のヤリ',13,0,5,.8],
 ['-','激烈疾風剣',13,0,15,.2,'1ダメージ以上で風邪'],['-','伝説の剣のさや',13,1,3,.2],['-','エンゼルソード',13,0,15,.2,'奇跡を止める'],['-','暴れフレイル',14,0,5,.6],
 ['-','邪神の大剣',14,0,1,.2,'自分にも同じダメージ'],['-','ドラゴンクロウ',15,0,5,.6],['-','エンゼルアクス',15,0,15,.2,'奇跡を止める'],['-','神の剣',30,0,30,.2],
 ['-','マジカルステッキ',0,0,10,.2,'MPを全消費し攻撃力MP×2'],
 ['火','たいまつ',1,0,1,.2],['火','あちちナイフ',2,0,2,.2],['火','燃えムチ',3,0,3,.2],['火','ほむら巻き',4,4,8,.2],['火','ブレイズブレイド',5,0,5,.2],['火','火竜一角',8,0,10,.2],
 ['水','つらら',1,0,1,.2],['水','霧鉄砲',3,0,10,.2,'1ダメージ以上で霧'],['水','氷結ハンマー',4,0,4,.2],['水','水竜一角',8,0,10,.2],
 ['木','木刀',1,0,1,.2],['木','いばらのムチ',2,0,2,.2],['木','いがナッツ',3,0,3,.2],['木','夢の木づち',4,0,15,.2,'1ダメージ以上で夢'],
 ['土','風のカギ爪',1,0,10,.2,'1ダメージ以上で風邪'],['土','つるぎ焼き',2,0,2,.2],['土','ダイヤモンドソード',13,0,25,.2],
 ['光','フラッシュダガー',2,0,15,.2,'1ダメージ以上で閃光'],['光','スタースタッフ',3,0,3,.2],['光','ジャスティスランス',5,0,5,.2],['光','聖剣',9,0,15,.2],['光','あぶないキネ',30,0,5,.2,'攻撃先が自分を含めランダム。ウス所持者に99ダメージ'],
 ['闇','ちくりんちょ',1,0,10,.2],['闇','コブラ',3,0,10,.2],['闇','さよならの剣',4,0,10,.2],['闇','キラーフォーク',5,0,10,.2],['闇','死神のカマ',10,0,20,.2],
];
normalWeapons.forEach(([a,n,atk,def,cost,p,e='']) => add('weapon',n,{attribute:attr[a],attack:atk,defense:def,costMoney:cost,copies:rate(p),description:e,weaponKind:'normal'}));

// 追加武器
const additions = [
 ['-','吹き矢',1,1,.2],['-','クロスボウ',2,2,.2],['-','ブーメラン',3,3,.2],['-','バトルボール',4,4,.2],['-','戦士の弓',5,5,.2],['-','ジェットヨーヨー',6,6,.2],['-','未知の羽根',7,7,.2],['-','サイキックカード',8,8,.2],['-','スカイハープーン',9,5,.2,'奇跡を弾く'],['-','恐怖の車輪',11,10,.2],['-','独楽コンバット',13,10,.2],['-','エンゼルの弓',15,15,.2,'奇跡を止める'],
 ['火','発火のワンド',2,15,.2,'攻撃を火属性に染める'],['火','ファイヤークロスボウ',4,8,.2],['水','魔水のワンド',5,15,.2,'攻撃を水属性に染める'],['木','葉っぱ手裏剣',2,3,.2],['木','熟成ゴムの弓',3,6,.2],['土','旧石器ジャベリン',5,4,.2],['土','新石器トマホーク',7,10,.2],['光','輝きのカケラ',1,10,.2],['闇','冥矢',5,15,.2],
];
additions.forEach(([a,n,atk,cost,p,e='']) => add('weapon',n,{attribute:attr[a],attack:atk,attackBonus:atk,costMoney:cost,copies:rate(p),description:e,weaponKind:'additional',additive:true}));

// 全体武器
const allWeapons = [
 ['火','火の粉袋',1,75,0,2],['火','火炎杯',4,75,0,6],['火','烈火シャワー',7,75,0,10],['火','フレアアクス',10,50,0,10],
 ['水','霧の扇',3,50,0,8,'霧'],['水','冷気杯',4,75,0,6],['水','特大雪玉',5,50,0,5],['水','雨神刀',9,50,0,9],
 ['木','つるシュート',3,75,0,10,'HP吸収'],['木','植物杯',4,75,0,6],['木','魔神の木馬',8,75,6,15],
 ['土','岩石杯',4,75,0,6],['土','ガケッツチ',6,25,0,4],['土','プチサターン',20,25,0,15],
 ['光','イナヅマキッズ',3,25,0,2],['光','光のオーブ',6,75,0,10],['光','昇天弓',1,25,0,10,'昇天時に75%攻30'],['闇','シャドウハンド',2,50,0,8,'1ダメージ以上で即死'],
];
allWeapons.forEach(([a,n,atk,hit,def,cost,e='']) => add('weapon',n,{attribute:attr[a],target:'all',attack:atk,hitRate:hit,defense:def,costMoney:cost,copies:1,description:e,weaponKind:'normal'}));

// 防具
const armors = [
 ['-','革の帽子',1,0,1,2],['-','スカイブーツ',1,0,5,.2,'奇跡を弾く'],['-','革の服',2,0,2,2],['-','アイアンガントレット',3,0,3,1.6],['-','鬼のくつ',3,5,10,.2],['-','スカイガントレット',3,0,5,.2,'奇跡を弾く'],
 ['-','アイアンシールド',4,0,4,1.6],['-','アイアンアーマー',5,0,5,1.6],['-','鬼の小手',5,10,15,.2],['-','スカイヘルム',5,0,5,.2,'奇跡を弾く'],['-','はがねの小手',6,0,6,1.2],['-','精霊の足袋',6,0,20,.2,'MPなしで奇跡'],
 ['-','はがねのかぶと',7,0,7,1.2],['-','鬼のかぶと',7,10,15,.2],['-','スカイシールド',7,0,5,.2,'奇跡を弾く'],['-','はがねの盾',8,0,8,1.2],['-','美しいガラス細工',8,0,20,.2],['-','月光のかぶと',8,0,10,.2,'奇跡をはね返す'],
 ['-','はがねのよろい',9,0,9,1.2],['-','鬼のよろい',9,15,20,.2],['-','精霊の頭巾',9,0,20,.2,'MPなしで奇跡'],['-','スカイアーマー',9,0,5,.2,'奇跡を弾く'],['-','エンゼルの小手',9,0,15,.2,'奇跡を止める'],
 ['-','エナジーヘルム',10,0,10,.8],['-','月光の盾',10,0,10,.2,'奇跡をはね返す'],['-','エナジーアーマー',11,0,10,.8],['-','エンゼルの帽子',11,0,15,.2,'奇跡を止める'],['-','コアバリヤー',12,0,10,.4],['-','精霊の帯',12,0,20,.2,'MPなしで奇跡'],['-','月光のよろい',12,0,10,.2,'奇跡をはね返す'],
 ['-','コアプロテクター',13,0,10,.4],['-','エンゼルシールド',13,0,15,.2,'奇跡を止める'],['-','エンゼルアーマー',15,0,15,.2,'奇跡を止める'],['-','神の盾',30,0,30,.2],
 ['火','火花の小手',2,0,4,.2],['火','フレイムブーツ',3,0,6,.2],['火','フレイムメット',4,0,8,.2],['火','フレイムシールド',5,0,10,.2],['火','フレイムアーマー',6,0,10,.2],['火','バーニングシールド',7,0,10,.2],['火','バーニングジャケット',8,0,10,.2],['火','熱狂仮面',10,0,10,.2,'使用者に熱病'],['火','陽炎のよろい',12,0,15,.2],
 ['水','アクアシューズ',1,0,2,.2],['水','アクアグローブ',2,0,4,.2],['水','アイスブーツ',3,0,6,.2],['水','アイスヘルム',4,0,8,.2],['水','アイスシールド',5,0,10,.2],['水','アイスアーマー',6,0,10,.2],['水','スノーミトン',7,0,10,.2],['水','スノーマスク',8,0,10,.2],
 ['木','草かんむり',1,0,2,.2],['木','木の盾',2,0,4,.2],['木','御神木の小手',3,0,6,.2],['木','林の盾',4,0,8,.2],['木','樹脂で編んだ法衣',5,0,10,.2],['木','森の盾',6,0,10,.2],['木','コハクの胸当て',8,0,10,.2],['木','夢見る帽子',14,0,15,.2,'使用者に夢、手札を一新'],
 ['土','石版',1,0,2,.2],['土','岩盤',2,0,4,.2],['土','結晶板',3,0,6,.2],['土','大地のくつ',4,0,8,.2],['土','大地の小手',5,0,10,.2],['土','大地のかぶと',6,0,10,.2],['土','大地のよろい',8,0,10,.2],
 ['光','ぴかぴかハイヒール',6,0,15,.2],['光','きらきらドレス',10,0,15,.2],
];
armors.forEach(([a,n,def,bonus,cost,p,e='']) => add('armor',n,{attribute:attr[a],defense:def,attackBonus:bonus,costMoney:cost,copies:rate(p),description:e}));

// 指輪・防御用雑貨
[['火','火星の指輪','敵全体75%攻{受けたダメージ}'],['水','水星の指輪','攻撃者に霧'],['木','木星の指輪','攻撃者に夢'],['土','土星の指輪','攻撃者に攻{受けたダメージ×2}'],['光','天王の指輪','攻撃者に閃光'],['闇','冥王の指輪','攻撃者に暗雲'],['-','海王の指輪','自分に+MP{受けたダメージ×2}'],['-','金星の指輪','攻撃者から￥{受けたダメージ}没収']]
 .forEach(([a,n,e])=>add('ring',n,{attribute:attr[a],type:'ring',costMoney:10,copies:1,description:`1ダメージ以上受けた時: ${e}`}));
add('defense_item','虹のカーテン',{type:'defense_item',costMoney:15,copies:3,description:'攻撃の属性を取り除く'});
add('defense_item','スーパーミラー',{type:'defense_item',costMoney:10,copies:1,description:'何でもはね返す'});

// 奇跡
const miracles = [
 ['火','＜火の玉＞',2,2,100,'+攻2'],['火','＜煙＞',4,5,75,'75%攻5'],['火','＜炎＞',5,10,100,'攻10'],['火','＜マグマ＞',10,15,75,'75%攻15'],
 ['水','＜氷＞',2,4,100,'攻4'],['水','＜雪崩＞',6,8,75,'75%攻8'],['水','＜滝＞',12,25,100,'攻25'],['水','＜氷河期＞',30,30,75,'75%攻30'],
 ['木','＜大木＞',3,6,100,'攻6'],['土','＜岩＞',4,8,100,'攻8'],['土','＜土石流＞',6,12,50,'50%攻12'],['天','＜閃光＞',3,1,25,'25%攻1、閃光'],['天','＜雷＞',4,10,25,'25%攻10'],['光','＜流星＞',7,10,100,'+攻10'],['天','＜吸収＞',10,10,100,'攻10、HP吸収'],['闇','＜闇＞',5,5,100,'攻5'],
 ['-','＜風＞',6,0,100,'風邪'],['-','＜天国風＞',15,0,100,'天国病'],['水','＜霧＞',3,0,100,'霧'],['木','＜夢＞',6,0,100,'夢'],['闇','＜暗雲＞',5,0,100,'暗雲'],
 ['-','＜音色＞',2,0,100,'風邪・熱病・霧・閃光を消す'],['-','＜歌声＞',5,0,100,'全ての災いを消す'],['-','＜オーラ＞',6,0,100,'単体攻撃武器の攻撃力を倍にする'],['-','＜蜃気楼＞',5,0,100,'単体攻撃武器を100%攻にする'],['-','＜乱気流＞',5,0,100,'奇跡を弾く'],['-','＜壁＞',6,0,100,'無属性武器を止める'],['-','＜泉＞',7,0,100,'+HP10'],['-','＜財宝＞',5,0,100,'+￥10'],['-','＜解放＞',15,0,100,'守護神が現れる'],
];
miracles.forEach(([a,n,mp,atk,hit,e])=>add('miracle',n,{attribute:attr[a],attack:atk,hitRate:hit,costMp:mp,costMoney:0,copies:1,description:e,additive:e.startsWith('+攻'),healHp:n==='＜泉＞'?10:0}));

// 雑貨・取引
const items = [
 ['スマイルのしずく',1,2.4,'+HP5',{healHp:5}],['ハートのしずく',3,1.6,'+HP10',{healHp:10}],['ロマンスウォーター',5,.8,'+HP15',{healHp:15}],['天の川のおいしい水',20,.2,'+HP20',{healHp:20}],
 ['スマイルの花',1,2.4,'+MP5',{healMp:5}],['ハートの花',3,1.6,'+MP10',{healMp:10}],['ロマンスの香木',5,.8,'+MP15',{healMp:15}],['天国草',20,.2,'+MP20、天国病',{healMp:20}],
 ['スマイルの貝がら',5,2.4,'風邪・熱病・霧・閃光を払う'],['ハートの貝がら',15,1.2,'全ての災いを払う'],['守護封印のつぼ',10,.6,'守護神が宿る'],['ドキドキ涙',1,.4,'+HP10または10ダメージ'],['ちからの粉',15,.4,'+攻10'],['精霊のぬいぐるみ',5,.4,'MP消費0で奇跡を使える'],['夜空のホウキ',10,.2,'無作為に神器を3つ掃き飛ばす'],['女神の石けん',10,.2,'無作為に習得奇跡を2つ忘れさせる'],['運命のひも',3,.2,'超常現象が起こる'],['太陽のお守り',10,.2,'HP0時に+HP10'],['あぶないウス',1,.2,'キネ発動時99ダメージ。捨てると戻り1ダメージ'],
];
items.forEach(([n,c,p,e,extra={}])=>add('item',n,{type:'item',costMoney:c,copies:rate(p),description:e,...extra}));
add('trade','両替',{type:'trade',costMoney:5,copies:20,description:'HP・MP・￥を1:1で自由配分',effect:'exchange'});
add('trade','売る',{type:'trade',costMoney:5,copies:20,description:'神器1つを相手に強制的に売る',effect:'sell'});
add('trade','買う',{type:'trade',costMoney:5,copies:20,description:'相手の神器を無作為に提示し購入を選ぶ',effect:'buy'});

// 化身（守護神）。基礎編集対象だが、通常の神器プールには入らない。
const guardians = [
 ['火星神','fire','炎のささやき30%:75%攻3／つぶやき25%:75%攻4／しゃべり20%:75%攻5／うなり15%:75%攻6／叫び10%:75%攻7'],
 ['水星神','water','霧雨30%／かすむ息25%／しぶき20%／泡15%／あられ10%。霧を伴う水攻撃'],
 ['木星神','wood','枝30%／根っこ25%／触手20%／紅葉15%／落ち葉の舞10%。吸収と夢'],
 ['土星神','earth','小石30%攻2／石25%攻4／大きな石20%攻6／体当たり15%攻9／ダイヤモンドアクス10%攻15'],
 ['天王神','light','点滅30%／電撃25%／後光20%／祝福15%／レーザービーム10%。閃光と吸収'],
 ['冥王神','dark','思考30%／まばたき25%／不吉な予感20%／咳払い15%／挙手10%。闇攻撃と暗雲'],
 ['海王神','none','さざなみの音30%／潮汁25%／磯の香り20%／あっさり潮汁15%／さわやかな磯の香り10%。治癒と回復'],
 ['金星神','none','小銭ばらまき30%／わいろ25%／罰金20%／つまらない物15%／豪華なアクセサリー10%。￥を操作'],
 ['地球神','none','神器を授かり率で抽選し、その神器に応じて自律行動する'],
 ['月神','none','受身を除く28種類の奇跡から無作為に使用する'],
];
guardians.forEach(([n,a,e])=>add('incarnation',n,{type:'incarnation',attribute:a,copies:0,description:e,actionRate:25,leaveOnDamageRate:10}));

const damageAilments = new Map([
  ['地獄のハサミ', 'hell'], ['疾風剣', 'cold'], ['激烈疾風剣', 'cold'], ['風のカギ爪', 'cold'],
  ['いんちきスピア', 'dream'], ['夢の木づち', 'dream'], ['霧鉄砲', 'fog'], ['霧の扇', 'fog'],
  ['フラッシュダガー', 'flash'], ['六角凶', 'darkcloud'], ['＜閃光＞', 'flash'],
]);
const directAilments = new Map([
  ['＜風＞', 'cold'], ['＜天国風＞', 'heaven'], ['＜霧＞', 'fog'], ['＜夢＞', 'dream'], ['＜暗雲＞', 'darkcloud'],
]);
const retaliationAilments = new Map([
  ['水星の指輪', 'fog'], ['木星の指輪', 'dream'], ['天王の指輪', 'flash'], ['冥王の指輪', 'darkcloud'],
]);

cards.forEach(card => {
  if (damageAilments.has(card.name)) {
    card.ailmentInflict = damageAilments.get(card.name);
    card.ailmentTrigger = 'damage';
  }
  if (directAilments.has(card.name)) {
    card.ailmentInflict = directAilments.get(card.name);
    card.ailmentTrigger = 'use';
  }
  if (retaliationAilments.has(card.name)) card.retaliateAilment = retaliationAilments.get(card.name);
  if (card.name === '熱狂仮面') card.selfAilment = 'fever';
  if (card.name === '夢見る帽子') card.selfAilment = 'dream';
  if (card.name === '天国草') card.selfAilment = 'heaven';
  if (['＜音色＞', 'スマイルの貝がら'].includes(card.name)) card.cureAilments = ['cold', 'fever', 'fog', 'flash'];
  if (['＜歌声＞', 'ハートの貝がら'].includes(card.name)) card.cureAilments = 'all';
});

const output = resolve(root, 'shared', 'baseCards.json');
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(cards, null, 2)}\n`, 'utf8');
console.log(`Generated ${cards.length} base entries (${cards.filter(c => c.copies > 0).reduce((n,c)=>n+c.copies,0)} weighted artifacts).`);
