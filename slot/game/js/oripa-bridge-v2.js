////////////////////////////////////////////////////////////
// ORIPA BRIDGE
// このファイルは game.js の後に読み込むこと (index.htmlのscriptタグの順番に注意)
////////////////////////////////////////////////////////////

// tier(sar/sr/rr/r/c) → 使う絵柄indexの対応表
// slots_arr(settings.js)は0〜9の10種類。9番を最高レア絵柄として扱う想定。
// 好きな絵柄画像に差し替えたら、この数字もそれに合わせて調整すること。
var ORIPA_TIER_SYMBOL = {
  sar: 9, // S賞 → 一番豪華な絵柄(slots_arr[9])
  sr:  7, // A賞
  rr:  5, // B賞
  r:   3, // C賞
  c:   1, // その他(実際に価値を持つ場合がある低ランク景品)
  none: null // ハズレ演出専用(常に揃わない。buildSlotSpinPlanのフィラー用)
};

// 5列×3行のresultArrayを作る。中央のライン(lines_arr[0]、r:1の横一列)に
// 狙った絵柄を5個揃えて、paytable_arrの{index:[n,n,n,n,n]}と一致させることで、
// ゲーム本来の当選ライン判定・ハイライト演出がそのまま自然に発動する。
function oripaBuildResultArray(tier){
  var symbol = ORIPA_TIER_SYMBOL[tier];
  var row = gameSettings.slotSettings.row;    // 3
  var col = gameSettings.slotSettings.column; // 5
  var arr = [];

  if(tier === 'none' || symbol == null){
    // ハズレ: 絶対に揃わないようにランダム(同じ列内で重複しない程度に散らす)
    for(var c=0;c<col;c++){
      for(var r=0;r<row;r++){
        var idx = Math.floor(Math.random()*slots_arr.length);
        arr.push(idx);
      }
    }
    return arr;
  }

  // r=0,1,2の3行分。中央行(r=1)だけ狙った絵柄で埋め、他はランダム(ただし同じ絵柄5連続は避ける)
  for(var r=0;r<row;r++){
    for(var c=0;c<col;c++){
      if(r === 1){
        arr.push(symbol);
      } else {
        var idx;
        do { idx = Math.floor(Math.random()*slots_arr.length); } while(idx === symbol);
        arr.push(idx);
      }
    }
  }
  return arr;
}

var oripaSpinInProgress = false;
var oripaCurrentSpinCoin = 0;
var oripaRemainingSpins = 0;
var oripaScoreTotal = 0;   // 累計獲得コイン(このプレイ内の合計)
var oripaRate = 0;         // 購入金額(レート)
var oripaCoinLabel = '';   // MAX BET枠に出す文字列(スピン結果が出るまでは空)

// ==== 表示テキストの一元管理 ====
// game.js内部のupdateGameStat()が何度呼ばれても、
// 必ず最後にこちらの値で上書きして「BET:」等の元表示に戻らないようにする
function oripaApplyDisplay(){
  try{
    if(typeof linesTxt !== 'undefined' && linesTxt){
      linesTxt.text = oripaRemainingSpins>0 ? ('残り' + oripaRemainingSpins) : '';
    }
    if(typeof betTxt !== 'undefined' && betTxt){
      betTxt.text = oripaRate ? oripaRate.toLocaleString() : '';
    }
    if(typeof maxBetTxt !== 'undefined' && maxBetTxt){
      maxBetTxt.text = oripaCoinLabel;
    }
    if(typeof creditTxt !== 'undefined' && creditTxt){
      creditTxt.text = oripaScoreTotal.toLocaleString();
    }
  }catch(ex){
    console.warn('oripaApplyDisplay: 表示更新エラー', ex);
  }
}

var oripaOriginalUpdateGameStat = updateGameStat;
updateGameStat = function(){
  oripaOriginalUpdateGameStat();
  oripaApplyDisplay();
  if(typeof stage !== 'undefined') stage.update();
};

var oripaOriginalCompleteSpin = completeSpin;
completeSpin = function(c){
  oripaOriginalCompleteSpin(c);
  if(slotData.spinComplete === gameSettings.slotSettings.column && oripaSpinInProgress){
    oripaSpinInProgress = false;
    oripaScoreTotal += oripaCurrentSpinCoin;
    oripaCoinLabel = oripaCurrentSpinCoin>0 ? ('+' + oripaCurrentSpinCoin.toLocaleString()) : 'ハズレ';
    oripaApplyDisplay();
    // ハイライト演出(highlightWinSlots)がしばらくループするので、
    // 少し見せてから親ウィンドウに「終わったよ」と伝える
    setTimeout(function(){
      window.parent.postMessage({type:'oripa-slot-complete'}, '*');
    }, 2200);
  }
};

// 縦画面のままでも横画面専用の判定を無視して常に表示させる
// (mobile.jsのcheckMobileEvent内でrotateInstructionを見てるので、ここで先にfalseにしておく)
rotateInstruction = false;

// 倍速演出：spinSettingsの秒数を縮めることでリールの回転自体を速める
var oripaOriginalSpinSettings = null; // 通常速度に戻す時のため元の値を保持
function oripaSetSpeed(fast){
  try{
    if(!oripaOriginalSpinSettings){
      oripaOriginalSpinSettings = {
        startSpeed: gameSettings.spinSettings.startSpeed,
        delay: gameSettings.spinSettings.delay,
        spinningSpeed: gameSettings.spinSettings.spinningSpeed,
        increaseSpeed: gameSettings.spinSettings.increaseSpeed,
        stopSpeed: gameSettings.spinSettings.stopSpeed
      };
    }
    var scale = fast ? 0.35 : 1;
    gameSettings.spinSettings.startSpeed = oripaOriginalSpinSettings.startSpeed * scale;
    gameSettings.spinSettings.delay = oripaOriginalSpinSettings.delay * scale;
    gameSettings.spinSettings.spinningSpeed = oripaOriginalSpinSettings.spinningSpeed * scale;
    gameSettings.spinSettings.increaseSpeed = oripaOriginalSpinSettings.increaseSpeed * scale;
    gameSettings.spinSettings.stopSpeed = oripaOriginalSpinSettings.stopSpeed * scale;
  }catch(ex){
    console.warn('oripaSetSpeed: 速度変更エラー', ex);
  }
}

function oripaPlayTier(tier){
  // クレジット表示は残しつつ、実際の増減はオリパ側のコイン管理と無関係なので
  // 尽きて止まらないよう大きめに設定しておく
  playerData.credit = 999999;
  playerData.creditSum = 999999;

  oripaSpinInProgress = true;
  gameData.resultArray = oripaBuildResultArray(tier);
  proceedStartSpin();
  oripaApplyDisplay();
}

window.addEventListener('message', function(e){
  var data = e.data || {};
  if(data.type === 'oripa-slot-speed'){
    oripaSetSpeed(!!data.speedUp);
    return;
  }
  if(data.type !== 'oripa-slot-play') return;
  oripaCurrentSpinCoin = typeof data.coin === 'number' ? data.coin : 0;
  if(typeof data.rate === 'number') oripaRate = data.rate;
  if(typeof data.speedUp === 'boolean') oripaSetSpeed(data.speedUp);
  // 新しいプレイの1回目(remaining === total)ならスコアをリセット
  if(typeof data.remaining === 'number' && typeof data.total === 'number' && data.remaining === data.total){
    oripaScoreTotal = 0;
  }
  if(typeof data.remaining === 'number') oripaRemainingSpins = data.remaining;
  oripaCoinLabel = ''; // 今回の結果はまだ出てないので空に
  oripaApplyDisplay();
  oripaPlayTier(data.tier || 'none');
});

// グローバルエラーを画面に直接表示（原因究明用、一時的）
window.onerror = function(msg, src, line, col, err){
  var box = document.createElement('div');
  box.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#fee;color:#900;font-size:12px;padding:10px;z-index:999999;border-top:4px solid red;font-family:monospace;word-break:break-all';
  box.innerHTML = '<b>JSエラー検出</b><br>' + msg + '<br>' + src + ' : line ' + line + ':' + col;
  document.body.appendChild(box);
};

var oripaOriginalInitMain=initMain;
initMain=function(){
  try{
    oripaOriginalInitMain();
    oripaHideUnusedUI();
    goPage('game');
    window.parent.postMessage({type:'oripa-slot-ready'}, '*');
  }catch(ex){
    var box = document.createElement('div');
    box.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#fee;color:#900;font-size:12px;padding:10px;z-index:999999;border-top:4px solid red;font-family:monospace;word-break:break-all';
    box.innerHTML = '<b>initMain内でエラー</b><br>' + ex.message + '<br>' + (ex.stack||'');
    document.body.appendChild(box);
  }

  // テストモード: ?test=1 を付けて単体で開いた時、自動で1回スロットを回す
  // (?test=sar / ?test=sr / ?test=rr / ?test=r / ?test=c で当選tierも指定可能)
  // ?rate=1000 のように付けるとレート表示のテストもできる(省略時は1000)
  var params = new URLSearchParams(location.search);
  if(params.has('test')){
    var testTier = params.get('test');
    var validTiers = ['sar','sr','rr','r','c'];
    if(validTiers.indexOf(testTier) === -1) testTier = 'sar';
    oripaRemainingSpins = 1;
    oripaRate = Number(params.get('rate')) || 1000;
    setTimeout(function(){
      oripaScoreTotal = 0;
      oripaCoinLabel = '';
      oripaApplyDisplay();
      oripaPlayTier(testTier);
    }, 800);
  }
};

// CREDIT・BET表示を「スコア」「レート」として流用し、不要な矢印ボタンのみ非表示にする
// (オリパはパック価格固定でベット額の概念が無いため、増減ボタン自体は不要)
// itemDisplayLines/linesTxt → 残りスピン数
// itemDisplayMaxBet/maxBetTxt → 今回のスピンの獲得コイン
// itemCredit/creditTxt → 累計スコア(このプレイの合計獲得コイン)
// itemDisplayBet/betTxt → レート(購入金額)
function oripaHideUnusedUI(){
  try{
    var toHide = [
      'itemCreditAlert','itemCreditAnimate',
      'buttonLines','buttonBet','buttonMaxBet'
    ];
    toHide.forEach(function(name){
      if(typeof window[name] !== 'undefined' && window[name] && window[name].visible !== undefined){
        window[name].visible = false;
      }
    });
    oripaApplyDisplay();
    if(typeof stage !== 'undefined'){
      stage.update();
    }
  }catch(ex){
    console.warn('oripaHideUnusedUI: UI非表示処理でエラー', ex);
  }
}
