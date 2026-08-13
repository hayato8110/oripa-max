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
  c:   0  // ハズレ(揃わない)
};

// 5列×3行のresultArrayを作る。中央のライン(lines_arr[0]、r:1の横一列)に
// 狙った絵柄を5個揃えて、paytable_arrの{index:[n,n,n,n,n]}と一致させることで、
// ゲーム本来の当選ライン判定・ハイライト演出がそのまま自然に発動する。
function oripaBuildResultArray(tier){
  var symbol = ORIPA_TIER_SYMBOL[tier];
  var row = gameSettings.slotSettings.row;    // 3
  var col = gameSettings.slotSettings.column; // 5
  var arr = [];

  if(tier === 'c' || symbol == null){
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
// ↑ presetSlotsResult()はresultArrayを「行ごとに列を回す」順で読むので、
//   実際に反映する直前にoripaToRowMajorForEngine()で並び替える(下記)

// このテンプレートのpresetSlotsResult()は resultArrayを
// 「列0の(下から)3個、列1の3個…」ではなく、行→列の単純な配列として
// 上から順に流し込む実装(game.js L630〜648参照)。
// サンプルコメント(game.js L76-79)の並びに合わせて、
// [row0col0..row0col4, row1col0..row1col4, row2col0..row2col4] の順で渡す。
// 上のoripaBuildResultArrayは既にこの順で組んでいるのでそのままでOK。

var oripaSpinInProgress = false;
var oripaOriginalCompleteSpin = completeSpin;
completeSpin = function(c){
  oripaOriginalCompleteSpin(c);
  if(slotData.spinComplete === gameSettings.slotSettings.column && oripaSpinInProgress){
    oripaSpinInProgress = false;
    // ハイライト演出(highlightWinSlots)がしばらくループするので、
    // 少し見せてから親ウィンドウに「終わったよ」と伝える
    setTimeout(function(){
      var counterEl = document.getElementById('oripa-spin-counter');
      if(counterEl) counterEl.style.display='none';
      window.parent.postMessage({type:'oripa-slot-complete'}, '*');
    }, 2200);
  }
};

// 縦画面のままでも横画面専用の判定を無視して常に表示させる
// (mobile.jsのcheckMobileEvent内でrotateInstructionを見てるので、ここで先にfalseにしておく)
rotateInstruction = false;

// 残りスピン数のオーバーレイ（iframe内、ゲーム画面の一部として表示）
function oripaShowSpinCounter(remaining, total){
  var el = document.getElementById('oripa-spin-counter');
  if(!el){
    el = document.createElement('div');
    el.id = 'oripa-spin-counter';
    el.style.cssText = 'position:fixed;top:10px;right:10px;z-index:99999;background:rgba(0,0,0,.7);color:#f3be20;font-weight:900;font-size:14px;padding:6px 14px;border-radius:16px;font-family:sans-serif;pointer-events:none';
    document.body.appendChild(el);
  }
  el.textContent = '残り ' + remaining + ' スピン';
  el.style.display = remaining>0 ? 'block' : 'none';
}

function oripaPlayTier(tier){
  // クレジット/ベット表示は残しつつ、実際の増減はオリパ側のコイン管理と無関係なので
  // 尽きて止まらないよう大きめに設定しておく
  playerData.credit = 999999;
  playerData.creditSum = 999999;
  updateGameStat();

  oripaSpinInProgress = true;
  gameData.resultArray = oripaBuildResultArray(tier);
  proceedStartSpin();
}

window.addEventListener('message', function(e){
  var data = e.data || {};
  if(data.type !== 'oripa-slot-play') return;
  if(typeof data.remaining === 'number') oripaShowSpinCounter(data.remaining, data.total);
  oripaPlayTier(data.tier || 'c');
});

// ロード完了後、自動でメニューを飛ばしてゲーム画面へ
// ※isLoadedはアセット読み込み開始のタイミングでtrueになるだけで、
//   実際にcanvas等の準備が整うのはinitMain()が呼ばれた後。
//   ここを早まってgoPage('game')すると、まだ存在しないgameContainer等を
//   参照してJSエラーになり、ローディング画面が固まる原因になるので、
//   initMain()自体をラップして「本当に準備できたタイミング」を検知する。
var oripaOriginalInitMain=initMain;
initMain=function(){
  oripaOriginalInitMain();
  goPage('game');
  window.parent.postMessage({type:'oripa-slot-ready'}, '*');

  // テストモード: ?test=1 を付けて単体で開いた時、自動で1回スロットを回す
  // (?test=sar / ?test=sr / ?test=rr / ?test=r / ?test=c で当選tierも指定可能)
  var params = new URLSearchParams(location.search);
  if(params.has('test')){
    var testTier = params.get('test');
    var validTiers = ['sar','sr','rr','r','c'];
    if(validTiers.indexOf(testTier) === -1) testTier = 'sar';
    setTimeout(function(){
      oripaPlayTier(testTier);
    }, 800);
  }
};
