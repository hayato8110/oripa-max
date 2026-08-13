////////////////////////////////////////////////////////////
// DIAG INLINE - 一時的な自己診断。原因が分かったら削除してOK
////////////////////////////////////////////////////////////
setTimeout(function(){
  var lines = [];
  lines.push('browserSupport = ' + (typeof browserSupport!=='undefined'?browserSupport:'undefined'));
  lines.push('isLoaded = ' + (typeof isLoaded!=='undefined'?isLoaded:'undefined'));
  lines.push('typeof jQuery = ' + (typeof jQuery));
  lines.push('typeof createjs = ' + (typeof createjs));
  lines.push('typeof MobileDetect = ' + (typeof MobileDetect));
  lines.push('typeof checkBrowser = ' + (typeof checkBrowser));
  lines.push('typeof initMain = ' + (typeof initMain));
  lines.push('typeof initPreload = ' + (typeof initPreload));
  lines.push('typeof TweenMax = ' + (typeof TweenMax));
  lines.push('typeof gameSettings = ' + (typeof gameSettings));
  lines.push('typeof slots_arr = ' + (typeof slots_arr));

  var box = document.createElement('div');
  box.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#fff;color:#000;font-size:14px;padding:12px;z-index:999999;max-height:100%;overflow:auto;font-family:monospace;border:4px solid red';
  box.innerHTML = '<b>自己診断結果</b><br>' + lines.map(function(l){return l;}).join('<br>');
  document.body.appendChild(box);
},3000);
