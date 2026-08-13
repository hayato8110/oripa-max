////////////////////////////////////////////////////////////
// GAME v2.2
////////////////////////////////////////////////////////////

const playerData = {credit:0, creditSum:0, amount:0, bet:0, win:0, totalWin:0};
const gameData = {paused:true, resultArray:null};
const slotData = {spin:false, lines:9, amount:0, extraslot:2, spinComplete:0, array:[], resultArray:[], linesArray:[], winFrameArray:[], winSlotArray:[], lineHighlight:0, creditAlert:0,};
const oddsData = {spin:{index:0, min:2, max:4, count:0}, joy:{index:0, min:50, max:80, count:0}, extremeCon:false, normal:[], wild:[], extreme:[]};



/*!
 * 
 * GAME BUTTONS - This is the function that runs to setup button event
 * 
 */
function buildGameButton(){
	$(window).focus(function() {
		if(!buttonSoundOn.visible){
			toggleSoundInMute(false);
		}

		if (typeof buttonMusicOn != "undefined") {
			if(!buttonMusicOn.visible){
				toggleMusicInMute(false);
			}
		}
	});
	
	$(window).blur(function() {
		if(!buttonSoundOn.visible){
			toggleSoundInMute(true);
		}

		if (typeof buttonMusicOn != "undefined") {
			if(!buttonMusicOn.visible){
				toggleMusicInMute(true);
			}
		}
	});
	
	if(gameSettings.enablePercentage){
		createPercentage();
	}

	if(audioOn){
		if(muteSoundOn){
			toggleSoundMute(true);
		}
		if(muteMusicOn){
			toggleMusicMute(true);
		}
	}
	
	buttonStart.cursor = "pointer";
	buttonStart.addEventListener("click", function(evt) {
		playSound('soundClick');
		
		//memberpayment
		if(typeof memberData != 'undefined' && memberSettings.enableMembership){
			if(!checkMemberGameType()){
				goMemberPage('user');
			}else{
				goPage('game');
			}
		}else{
			goPage('game');
		}
	});
	
	buttonSpin.cursor = "pointer";
	buttonSpin.addEventListener("click", function(evt) {
		playSound('soundClick');
		
		//multi-line slots
		/*gameData.resultArray = [
					9,6,4,0,9,
					2,2,1,3,3,
					6,2,1,2,3];*/

		//classic three line slots
		//gameData.resultArray = [2,2,2];

		startSpin();
	});
	
	itemHandleAnimate.cursor = "pointer";
	itemHandleAnimate.addEventListener("click", function(evt) {
		playSound('soundClick');
		startSpin();
	});
	
	buttonInfo.cursor = "pointer";
	buttonInfo.addEventListener("click", function(evt) {
		if(slotData.spin){
			return;	
		}
		
		playSound('soundClick');
		infoContainer.visible = true;
	});
	
	buttonClose.cursor = "pointer";
	buttonClose.addEventListener("click", function(evt) {
		playSound('soundClick');
		infoContainer.visible = false;
	});
	
	buttonLines.cursor = "pointer";
	buttonLines.addEventListener("click", function(evt) {
		playSound('soundClick');
		toggleBetLines(true);
	});
	
	buttonBet.cursor = "pointer";
	buttonBet.addEventListener("click", function(evt) {
		playSound('soundClick');
		toggleBetAmount();
	});
	
	buttonMaxBet.cursor = "pointer";
	buttonMaxBet.addEventListener("click", function(evt) {
		playSound('soundClick');
		toggleBetAmount(true);
		startSpin();
	});
	
	
	buttonContinue.cursor = "pointer";
	buttonContinue.addEventListener("click", function(evt) {
		playSound('soundClick');
		goPage('main');
	});
	
	if(shareSettings.enable){
		buttonShare.cursor = "pointer";
		buttonShare.addEventListener("click", function(evt) {
			playSound('soundButton');
			toggleSocialShare(true);
		});

		for(let n=0; n<shareSettings.options.length; n++){
			$.share['button'+n].cursor = "pointer";
			$.share['button'+n].addEventListener("click", function(evt) {
				shareLinks(evt.target.shareOption, addCommas(playerData.totalWin));
			});
		}
	};
	
	buttonSoundOff.cursor = "pointer";
	buttonSoundOff.addEventListener("click", function(evt) {
		toggleSoundMute(true);
	});
	
	buttonSoundOn.cursor = "pointer";
	buttonSoundOn.addEventListener("click", function(evt) {
		toggleSoundMute(false);
	});

	if (typeof buttonMusicOff != "undefined") {
		buttonMusicOff.cursor = "pointer";
		buttonMusicOff.addEventListener("click", function(evt) {
			toggleMusicMute(true);
		});
	}
	
	if (typeof buttonMusicOn != "undefined") {
		buttonMusicOn.cursor = "pointer";
		buttonMusicOn.addEventListener("click", function(evt) {
			toggleMusicMute(false);
		});
	}
	
	buttonFullscreen.cursor = "pointer";
	buttonFullscreen.addEventListener("click", function(evt) {
		toggleFullScreen();
		toggleOptions();
	});
	
	buttonSettings.cursor = "pointer";
	buttonSettings.addEventListener("click", function(evt) {
		toggleOptions();
	});
	
	buttonExit.cursor = "pointer";
	buttonExit.addEventListener("click", function(evt) {
		togglePop(true);
		toggleOptions();
	});
	
	buttonConfirm.cursor = "pointer";
	buttonConfirm.addEventListener("click", function(evt) {
		togglePop(false);
		goPage('result');
	});
	
	itemExit.addEventListener("click", function(evt) {
		
	});
	
	buttonCancel.cursor = "pointer";
	buttonCancel.addEventListener("click", function(evt) {
		togglePop(false);
	});
}

function toggleWheelActive(con){
	if(con){
		wheelContainer.cursor = "pointer";
	}else{
		wheelContainer.cursor = "default";	
	}
}

/*!
 * 
 * DISPLAY PAGES - This is the function that runs to display pages
 * 
 */
var curPage=''
function goPage(page){
	curPage=page;
	
	mainContainer.visible = false;
	gameContainer.visible = false;
	resultContainer.visible = false;
	togglePop(false);
	toggleOptions(false);
	
	var targetContainer = null;
	switch(page){
		case 'main':
			targetContainer = mainContainer;
		break;
		
		case 'game':
			targetContainer = gameContainer;
			startGame();
		break;
		
		case 'result':
			targetContainer = resultContainer;
			toggleSocialShare(false);
			playSound('soundResult');			
			stopGame();
			
			var tweenValue = {value:0}
			TweenMax.to(tweenValue, 1, {value:playerData.totalWin, overwrite:true, onUpdate:function(){
				resultScoreTxt.text = textStrings.resultScoreText.replace('[NUMBER]', formatCurrency(tweenValue.value));	
			}});
			
			saveGame(playerData.totalWin);
		break;
	}
	
	if(targetContainer != null){
		targetContainer.visible = true;
		targetContainer.alpha = 0;
		TweenMax.to(targetContainer, .5, {alpha:1, overwrite:true});
	}
	
	resizeCanvas();
}

/*!
 * 
 * TOGGLE SOCIAL SHARE - This is the function that runs to toggle social share
 * 
 */
function toggleSocialShare(con){
	if(!shareSettings.enable){return;}
	buttonShare.visible = con == true ? false : true;
	shareSaveContainer.visible = con == true ? false : true;
	socialContainer.visible = con;

	if(con){
		if (typeof buttonSave !== 'undefined') {
			TweenMax.to(buttonShare, 3, {overwrite:true, onComplete:toggleSocialShare, onCompleteParams:[false]});
		}
	}
}

function positionShareButtons(){
	if(!shareSettings.enable){return;}
	if (typeof buttonShare !== 'undefined') {
		if (typeof buttonSave !== 'undefined') {
			if(buttonSave.visible){
				buttonShare.x = -((buttonShare.image.naturalWidth/2) + 5);
				buttonSave.x = ((buttonShare.image.naturalWidth/2) + 5);
			}else{
				buttonShare.x = 0;
			}
		}
	}
}

function togglePop(con){
	exitContainer.visible = con;
	
	if(con){
		TweenMax.pauseAll(true, true);
		gameData.paused = true;
	}else{
		TweenMax.resumeAll(true, true)
		gameData.paused = false;
	}
}

/*!
 * 
 * START GAME - This is the function that runs to start play game
 * 
 */

function startGame(){
	gameData.paused = false;
	itemHandleAnimate.visible = gameSettings.spinSettings.handle;
	linesContainer.visible = gameSettings.lineSettings.display;
	itemCreditAlert.alpha = 0;
	creditTxt.alpha =1;
	
	infoContainer.visible = false;
	slotData.lines = lines_arr.length-1;
	slotData.amount = 0;
	slotData.spin = false;
	toggleBetLines(false);
	resetHighlightWinSlots();
	
	playerData.credit = gameSettings.creditAmount;
	playerData.bet = 0;
	playerData.win = 0;
	playerData.totalWin = 0;
	playerData.amount = 0;
	
	//memberpayment
	if(typeof memberData != 'undefined' && memberSettings.enableMembership){
		playerData.credit = memberData.point;
	}
	
	oddsData.spin.count = randomIntFromInterval(oddsData.spin.min, oddsData.spin.max);
	oddsData.joy.count = randomIntFromInterval(oddsData.joy.min, oddsData.joy.max);
	shuffle(oddsData.normal);
	oddsData.spin.index = 0;
	shuffle(oddsData.extreme);
	oddsData.joy.index = 0;
	oddsData.extremeCon = false;
	
	spinTxt.text = '';
	updateGameStat();
	prepareSlots();
	
	for(var c = 0; c<gameSettings.slotSettings.column; c++){
		slotData.array[c].y = slotData.array[c].posY = ((slotData.array[c].total-slotData.extraslot)-gameSettings.slotSettings.row) * gameSettings.slotSettings.height;
	}
}

 /*!
 * 
 * STOP GAME - This is the function that runs to stop play game
 * 
 */
function stopGame(){
	TweenMax.killAll();
	
	slotData.resultArray.length = 0;
	slotData.winSlotArray.length = 0;
	slotData.linesArray.length = 0;
	slotWinContainer.removeAllChildren();
}

/*!
 * 
 * SAVE GAME - This is the function that runs to save game
 * 
 */
function saveGame(score){
	if ( typeof toggleScoreboardSave == 'function' ) { 
		$.scoreData.score = score;
		if(typeof type != 'undefined'){
			$.scoreData.type = type;	
		}
		toggleScoreboardSave(true);
	}

	/*$.ajax({
      type: "POST",
      url: 'saveResults.php',
      data: {score:score},
      success: function (result) {
          console.log(result);
      }
    });*/
}

/*!
 * 
 * DRAW SLOTS - This is the function that runs to draw slots
 * 
 */
function drawSlots(){
	slotData.extraslot = gameSettings.slotSettings.row-1;
	slotData.extraslot = slotData.extraslot <= 0 ? 1 : slotData.extraslot;
	
	//masking
	var totalSlotW = gameSettings.slotSettings.width * gameSettings.slotSettings.column;
	var totalSlotH = gameSettings.slotSettings.height * gameSettings.slotSettings.row;
	gameSettings.slotSettings.startX = ((stageW/2)-(totalSlotW/2))+gameSettings.slotSettings.offsetX;
	gameSettings.slotSettings.startY = ((stageH/2)-(totalSlotH/2))+gameSettings.slotSettings.offsetY;
	var currentX = gameSettings.slotSettings.startX;
	var currentY = gameSettings.slotSettings.startY;
	
	slotData.winFrameArray = [];
	for(var n = 0; n<gameSettings.slotSettings.column; n++){
		slotData.winFrameArray[n] = [];
		
		currentY = gameSettings.slotSettings.startY;
			
		$.columnMask[n] = new createjs.Shape();
		$.columnMask[n].graphics.beginFill('red').drawRect(0, 0, gameSettings.slotSettings.width, gameSettings.slotSettings.height * gameSettings.slotSettings.row);
		$.columnMask[n].x = currentX;
		$.columnMask[n].y = currentY;
		$.columnMask[n].visible = false;
		
		for(var r = 0; r<gameSettings.slotSettings.row; r++){
			
			slotData.winFrameArray[n][r] = itemSlotFrameAnimate.clone();
			slotData.winFrameArray[n][r].x = currentX + (gameSettings.slotSettings.width/2);
			slotData.winFrameArray[n][r].y = currentY + (gameSettings.slotSettings.height/2);
			slotData.winFrameArray[n][r].visible = false;
			
			currentY += gameSettings.slotSettings.height;
			slotWinFrameContainer.addChild(slotData.winFrameArray[n][r]);
		}
		
		currentX += gameSettings.slotSettings.width;
		slotContainer.addChild($.columnMask[n]);
	}
	
	//slots	
	for(var c = 0; c<gameSettings.slotSettings.column; c++){
		slotData.array.push({y:0, tweenY:0, total:0, slots:[], obj:[], index:0});
		
		for(var n = 0; n<slots_arr.length; n++){
			slotData.array[c].slots.push(n);
		}
	}
	
	//odds
	sortOnObject(paytable_arr, 'pay', true);
	for(var n = 0; n<slots_arr.length; n++){
		var wildNum = wild_arr.indexOf(n);
		if(wildNum != -1){
			oddsData.wild.push(n);
		}else{
			oddsData.normal.push(n);		
		}
		
		for(var p = 0; p<paytable_arr.length; p++){
			if(paytable_arr[p].index.indexOf(n) != -1){
				var totalInIndex = findTotalIndex(p, n);
				for(var t = 0; t<totalInIndex; t++){
					oddsData.extreme.push(n);
				}
			}
		}
	}
	
	//bet
	gameSettings.betAmount_arr.sort(function(a, b){return a-b});
}

function findTotalIndex(p, index){
	var totalIndex = 0;
	for(var n = 0; n<paytable_arr[p].index.length; n++){
		if(paytable_arr[p].index[n] == index){
			totalIndex++;	
		}
	}
	return totalIndex;
}

/*!
 * 
 * TOGGLE BET LINES - This is the function that runs to toggle bet lines
 * 
 */
function toggleBetLines(con){
	if(slotData.spin){
		return;	
	}
	resetHighlightWinSlots();
	
	if(con){
		slotData.lines++;
		slotData.lines = slotData.lines > lines_arr.length-1 ? 0 : slotData.lines;
	}
	
	for(var n = 0; n<lines_arr.length; n++){
		$.lines['line'+n].visible = false;
		if(n <= slotData.lines){
			$.lines['line'+n].visible = true;
		}
		
		for(var l = 0; l<lines_arr[n].sign.length; l++){
			$.lines['lineOn'+n+'_'+l].visible = false;
			$.lines['lineOff'+n+'_'+l].visible = true;
			
			if(n <= slotData.lines){
				$.lines['lineOn'+n+'_'+l].visible = true;
				$.lines['lineOff'+n+'_'+l].visible = false;
			}
		}
	}
	
	TweenMax.to(linesContainer, gameSettings.lineSettings.timer, {overwrite:true, onComplete:function(){
		for(var n = 0; n<lines_arr.length; n++){
			$.lines['line'+n].visible = false;
		}
		
		if(slotData.linesArray.length > 0){
			displayWinSlots();
		}
	}});
	
	updateGameStat();
}

/*!
 * 
 * TOGGLE BET AMOUNT - This is the function that runs to toggle bet amount
 * 
 */
function toggleBetAmount(con){
	if(slotData.spin){
		return;	
	}
	
	if(con){
		//max bet
		slotData.amount = gameSettings.betAmount_arr.length-1;
	}else{
		slotData.amount++;
		slotData.amount = slotData.amount > gameSettings.betAmount_arr.length-1 ? 0 : slotData.amount;
	}
	
	updateGameStat();
}

/*!
 * 
 * PREPARE SLOTS - This is the function that runs to fill new slots
 * 
 */
function prepareSlots(){
	slotContainer.removeAllChildren();
	
	for(var c = 0; c<gameSettings.slotSettings.column; c++){
		shuffle(slotData.array[c].slots);
		
		var currentX = gameSettings.slotSettings.startX + (gameSettings.slotSettings.width/2) + (gameSettings.slotSettings.width * c);
		var currentY = gameSettings.slotSettings.startY + (gameSettings.slotSettings.height/2);
		currentY += gameSettings.slotSettings.height * gameSettings.slotSettings.row;
		if(slotData.extraslot > 1){
			currentY += gameSettings.slotSettings.height * (slotData.extraslot-1);
		}
		
		slotData.array[c].total = gameSettings.spinSettings.slots * gameSettings.slotSettings.row;
		slotData.array[c].total += slotData.extraslot;
		
		var previousIndexArray = [];
		if(slotData.array[c].obj.length > 0){
			for(var s = slotData.array[c].obj.length-gameSettings.slotSettings.row; s<slotData.array[c].obj.length; s++){
				previousIndexArray.push(slotData.array[c].obj[s].slotIndex);	
			}
		}
		slotData.array[c].obj.length = 0;
		
		var previousIndex = 0;
		for(var s = 0; s<slotData.array[c].total; s++){
			var resultSlot = false;
			if(s >= slotData.extraslot && previousIndex < previousIndexArray.length){
				var slotIndex = previousIndexArray[previousIndex];
				previousIndex++;
			}else{
				var index = slotData.array[c].index;
				var slotIndex = slotData.array[c].slots[index];
				slotData.array[c].index++;
				if(slotData.array[c].index > slotData.array[c].slots.length-1){
					slotData.array[c].index = 0;
					shuffle(slotData.array[c].slots);	
				}
			}
			
			var slotObj = $.slots[slotIndex].clone();
			slotObj.slotIndex = slotIndex;
			slotObj.mask = $.columnMask[c];
			slotContainer.addChild(slotObj);
			
			slotData.array[c].obj.push(slotObj);
			
			slotObj.x = currentX;
			slotObj.y = currentY;
			slotObj.oriY = slotObj.y;
			
			currentY -= (gameSettings.slotSettings.height);
		}
	}
}

/*!
 * 
 * PRESET SLOTS RESULT - This is the function that runs to preset slots result
 * 
 */
function presetSlotsResult(){
	var slotResultIndex = 0;
	var slotsResult = [];
	
	if(gameData.resultArray == null){
		if(gameSettings.enablePercentage){
			slotsResult = getResultOnPercent();	
		}else {
			slotsResult = fillSlots(true);
		}
	}else{
		slotsResult = gameData.resultArray;
	}
	
	//fill slots
	for(var r = 0; r<gameSettings.slotSettings.row; r++){
		for(var c = 0; c<gameSettings.slotSettings.column; c++){
			var previousIndex = slotData.array[c].obj.length-(r+1);
			var previousObj = slotData.array[c].obj[previousIndex];
			
			var slotIndex = slotsResult[slotResultIndex];
			slotResultIndex++;
			
			var slotObj = $.slots[slotIndex].clone();
			slotObj.slotIndex = slotIndex;
			slotObj.mask = $.columnMask[c];
			slotObj.x = previousObj.x;
			slotObj.y = previousObj.y;
			slotObj.oriY = previousObj.y;
			
			slotContainer.removeChild(previousObj);
			slotContainer.addChild(slotObj);
			slotData.array[c].obj[previousIndex] = slotObj;
		}
	}
}

function fillSlots(random){
	var slotsResult = [];
		
	var slotsArray = oddsData.normal;
	if(random){
		if(oddsData.extremeCon){
			oddsData.extremeCon = false;
			oddsData.spin.index = 0;
			shuffle(slotsArray);
		}

		if(oddsData.spin.count <= 0){
			oddsData.extremeCon = true;
			oddsData.spin.count = randomIntFromInterval(oddsData.spin.min, oddsData.spin.max);
			slotsArray = oddsData.extreme;
			shuffle(slotsArray);
			oddsData.spin.index = 0;
		}

		for(var n=0; n<gameSettings.slotSettings.column*gameSettings.slotSettings.row; n++){
			if(oddsData.joy.count <= 0 && oddsData.wild.length > 0){
				shuffle(oddsData.wild);
				oddsData.joy.count = randomIntFromInterval(oddsData.joy.min, oddsData.joy.max);
				slotsResult.push(oddsData.wild[0]);
			}else{
				slotsResult.push(slotsArray[oddsData.spin.index]);

				oddsData.spin.index++;
				if(oddsData.spin.index > slotsArray.length-1){
					oddsData.spin.index = 0;
					shuffle(slotsArray);	
				}
			}
			oddsData.joy.count--;
		}
		oddsData.spin.count--;
	}else{
		shuffle(gameData.slotArray);
		gameData.slotIndex = 0;
		
		for(var n=0; n<gameSettings.slotSettings.column*gameSettings.slotSettings.row; n++){
			slotsResult.push(gameData.slotArray[gameData.slotIndex]);
			gameData.slotIndex++;
			if(gameData.slotIndex > gameData.slotArray.length-1){
			   shuffle(gameData.slotArray);
				gameData.slotIndex = 0;   
			}
		}
	}
	
	return slotsResult;
}

/*!
 * 
 * START SPIN - This is the function that runs to start spin
 * 
 */
function startSpin(){
	//memberpayment
	if(typeof memberData != 'undefined' && memberSettings.enableMembership && !memberData.ready){
		return;
	}
	
	if(slotData.spin){
		return;	
	}
	
	var currentBet = formatCurrency((gameSettings.betAmount_arr[slotData.amount] * (slotData.lines+1)));
	if(Number(currentBet) > Number(formatCurrency(playerData.credit))){
		playSound('soundAlert');
		startCreditAlert();
		return;
	}
	
	playSound('soundPuller');
	slotData.spin = true;
	slotData.resultArray.length = 0;
	slotData.winSlotArray.length = 0;
	slotData.linesArray.length = 0;
	slotWinContainer.removeAllChildren();
	
	resetHighlightWinSlots();
	TweenMax.to(linesContainer, .3, {overwrite:true, onComplete:function(){
		playSoundLoop('soundSpin');
	}});
	
	playerData.amount = gameSettings.betAmount_arr[slotData.amount];
	playerData.bet = currentBet;
	playerData.creditSum = playerData.credit - playerData.bet;
	updateGameStat();

	//memberpayment
	if(typeof memberData != 'undefined' && memberSettings.enableMembership){
		getUserResult("proceedStartSpin",[slotData.lines, slotData.amount]);
		//updateUserPoint("proceedStartSpin");
	}else{
		proceedStartSpin();
	}
}

function proceedStartSpin(result){
	if(result != undefined){
		gameData.resultArray = result.result;
	}

	prepareSlots();						
	presetSlotsResult();
	
	slotData.spinComplete = 0;
	itemHandleAnimate.gotoAndPlay('animate');
	startSpinBounce();
}

function startSpinBounce(){
	for(var c = 0; c<gameSettings.slotSettings.column; c++){
		slotData.array[c].y = 0;
		slotData.array[c].posY = ((slotData.array[c].total-slotData.extraslot)-gameSettings.slotSettings.row) * gameSettings.slotSettings.height;
		TweenMax.to(slotData.array[c], gameSettings.spinSettings.startSpeed, {delay:gameSettings.spinSettings.delay*c, y:slotData.array[c].posY/3, ease:Back.easeIn, overwrite:true, onComplete:continueSpin, onCompleteParams:[c]});
	}
}

function continueSpin(c){
	var tweenSpeed = gameSettings.spinSettings.spinningSpeed + (gameSettings.spinSettings.increaseSpeed * c);
	TweenMax.to(slotData.array[c], tweenSpeed, {y:slotData.array[c].posY-100, ease:Linear.easeOut, overwrite:true, onComplete:finalSpin, onCompleteParams:[c]});
}

function finalSpin(c){
	TweenMax.to(slotData.array[c], gameSettings.spinSettings.stopSpeed, {y:slotData.array[c].posY, ease:Back.easeOut, overwrite:true, onComplete:completeSpin, onCompleteParams:[c]});
}

function completeSpin(c){
	playSound('soundStop');
	slotData.spinComplete++;
	
	if(slotData.spinComplete == gameSettings.slotSettings.column){
		stopSoundLoop('soundSpin');
		TweenMax.to(linesContainer, .5, {overwrite:true, onComplete:function(){
			checkBetLines();
			placeWinAnimateSlots();
			checkWinAmount();
			displayWinSlots();
			
			slotData.spin = false;
			checkEndGame();
		}});
	}
}

/*!
 * 
 * CHECK BET LINES - This is the function that runs to check bet lines
 * 
 */
function checkBetLines(){
	var slots = [];
	slotData.resultArray = [];
	
	//store obj for all slots
	for(var c = 0; c<gameSettings.slotSettings.column; c++){
		slotData.resultArray[c] = [];
		for(var r = 0; r<gameSettings.slotSettings.row; r++){
			var thisIndex = slotData.array[c].obj.length-(r+1);
			var thisObj = slotData.array[c].obj[thisIndex];
			slotData.resultArray[c][r] = thisObj;
		}
	}
	
	//match slots
	for(var n = 0; n<lines_arr.length; n++){
		var storeLineSlot = [];
		if(n <= slotData.lines){
			for(var l = 0; l<lines_arr[n].slots.length; l++){
				var thisColumn = lines_arr[n].slots[l].c;
				var thisRow = lines_arr[n].slots[l].r;
				var currentIndex = slotData.resultArray[thisColumn][thisRow].slotIndex;	
				storeLineSlot.push(currentIndex);
			}
			
			var matchSlotArray = [];
			var matchSlot = {startIndex:0, index:[], lastIndex:null, count:0, reset:false}; //type 0,1
			var matchManySlot = {startIndex:0, index:[], lastIndex:null, count:0, reset:false, push:false}; //type 2
				
			for(var s=0; s<storeLineSlot.length; s++){
				var currentIndex = storeLineSlot[s];
				
				//for single match
				var matchResultCon = findSlotMatch(currentIndex);
				matchSlot.reset = false;
				
				if(matchResultCon == 0 && matchSlot.index.length == 0){
					//first index
					matchSlot.index.push(currentIndex);
					matchSlot.lastIndex = currentIndex;
				}else if(matchResultCon == 0 && currentIndex == matchSlot.lastIndex){
					//same index
					matchSlot.index.push(currentIndex);
					matchSlot.lastIndex = currentIndex;
				}else if(matchResultCon == 1){
					//wild index
					matchSlot.index.push(currentIndex);
				}else{
					matchSlot.reset = true;
				}
				
				if(s == storeLineSlot.length-1){
					matchSlot.reset = true;	
				}
				
				if(matchSlot.reset){
					//store and reset
					var currentPay = findSlotMatchPay(matchSlot.index);
					if(currentPay > 0){
						matchSlotArray.push({index:matchSlot.index, total:matchSlot.index.length, start:matchSlot.startIndex, pay:currentPay});	
					}
					
					//first index
					matchSlot.index = [];
					matchSlot.index.push(currentIndex);
					matchSlot.lastIndex = currentIndex;
					matchSlot.startIndex = s;	
				}
				
				//for many match
				var matchResultManyCon = null;
				matchManySlot.reset = false;
				matchManySlot.push = false;
				
				if(matchManySlot.lastIndex == null){
					matchManySlot.lastIndex = currentIndex;
					matchManySlot.index.push(matchManySlot.lastIndex);
					
				}else if(matchManySlot.lastIndex != null){
					matchManySlot.index.push(currentIndex);
					matchResultManyCon = findManySlotMatch(matchManySlot.index);	
				
					if(matchResultManyCon == -1){
						//reset if no exist
						matchManySlot.reset = true;
						matchManySlot.push = true;
					}else if(matchResultManyCon == 1){
						//push
						matchManySlot.push = true;	
					}
					
					if(s == storeLineSlot.length-1){
						//reset when is last
						matchManySlot.reset = true;	
						matchManySlot.push = true;
					}
				}
				
				matchManySlot.lastIndex = currentIndex;
				
				if(matchManySlot.push){
					//store and reset
					var currentPay = findSlotMatchPay(matchManySlot.index);
					if(currentPay > 0){
						matchSlotArray.push({index:matchManySlot.index, total:matchManySlot.index.length, start:matchManySlot.startIndex, pay:currentPay});	
					}
				}
					
				if(matchManySlot.reset){
					//first index
					matchManySlot.index = [];
					matchManySlot.index.push(matchManySlot.lastIndex);
					matchManySlot.startIndex = s;
				}
			}
			
			//find final match
			sortOnObject(matchSlotArray, 'pay', true);
			for(var l = 0; l<matchSlotArray.length; l++){
				if(matchSlotArray[l].pay > 0){
					slotData.linesArray.push({id:n, index:matchSlotArray[l].index, total:matchSlotArray[l].total, start:matchSlotArray[l].start, pay:matchSlotArray[l].pay});
					l = lines_arr[n].slots.length;
				}
			}
		}
	}
}

/*!
 * 
 * PLACE WIN ANIMATE SLOTS - This is the function that runs to place win animation
 * 
 */
function placeWinAnimateSlots(){
	slotData.winSlotArray = [];
	
	for(var c = 0; c<gameSettings.slotSettings.column; c++){
		slotData.winSlotArray[c] = [];
		for(var r = 0; r<gameSettings.slotSettings.row; r++){
			slotData.winSlotArray[c][r] = null;		
		}
	}
	
	for(var n=0; n<slotData.linesArray.length; n++){
		var linesID = slotData.linesArray[n].id;
		var linesStart = slotData.linesArray[n].start;
		var linesEnd = linesStart + slotData.linesArray[n].total;
		
		for(var w=linesStart; w<linesEnd; w++){
			var thisColumn = lines_arr[linesID].slots[w].c;
			var thisRow = lines_arr[linesID].slots[w].r;
			
			if(slotData.winSlotArray[thisColumn][thisRow] == null){
				var currentSlotObj = slotData.resultArray[thisColumn][thisRow];
				
				var newAnimateObj = $.slots['animate'+currentSlotObj.slotIndex].clone();
				newAnimateObj.x = currentSlotObj.x;
				newAnimateObj.y = currentSlotObj.y;
				newAnimateObj.gotoAndPlay('animate');
				
				slotData.winSlotArray[thisColumn][thisRow] = newAnimateObj;
				slotWinContainer.addChild(newAnimateObj);
			}	
		}
	}
}

/*!
 * 
 * CHECK WIN AMOUNT - This is the function that runs to check win amount
 * 
 */
function checkWinAmount(){
	playerData.win = 0;
	for(var n=0; n<slotData.linesArray.length; n++){
		var linesPay = slotData.linesArray[n].pay;
		playerData.win += linesPay * playerData.amount;
	}
	
	playerData.credit -= playerData.bet;
	playerData.bet = 0;
	playerData.credit += playerData.win;
	playerData.creditSum = playerData.credit;
	playerData.totalWin += playerData.win
	
	//memberpayment
	if(typeof memberData != 'undefined' && memberSettings.enableMembership){
		var returnPoint = {chance:0, point:Math.floor(playerData.credit), score:0};
		matchUserResult(undefined, returnPoint);
		//updateUserPoint();
	}
	
	if(playerData.win > 0){
		playSound('soundWin');
	}
	updateGameStat();
}

/*!
 * 
 * DISPLAY WIN SLOTS - This is the function that runs to play slots win animation
 * 
 */
function displayWinSlots(){
	slotData.lineHighlight = -1;
	highlightWinSlots();
}

function resetHighlightWinSlots(){
	TweenMax.killTweensOf(linesContainer);
	
	//reset
	for(var c = 0; c<gameSettings.slotSettings.column; c++){
		for(var r = 0; r<gameSettings.slotSettings.row; r++){
			if(slotData.resultArray.length > 0){
				slotData.resultArray[c][r].visible = true;
			}
			
			if(slotData.winSlotArray.length > 0){
				if(slotData.winSlotArray[c][r] != null){
					slotData.winSlotArray[c][r].gotoAndPlay('static');
					slotData.winSlotArray[c][r].visible = false;
				}
			}
			slotData.winFrameArray[c][r].visible = false;	
		}
	}	
	
	for(var n = 0; n<lines_arr.length; n++){
		$.lines['line'+n].visible = false;	
	}
}

function highlightWinSlots(){
	resetHighlightWinSlots();
	
	//highlight
	for(var n=0; n<slotData.linesArray.length; n++){
		var linesID = slotData.linesArray[n].id;
		var linesStart = slotData.linesArray[n].start;
		var linesEnd = linesStart + slotData.linesArray[n].total;
		
		for(var w=linesStart; w<linesEnd; w++){
			var thisColumn = lines_arr[linesID].slots[w].c;
			var thisRow = lines_arr[linesID].slots[w].r;
			
			if(slotData.lineHighlight == -1 || slotData.lineHighlight == n){
				if(slotData.winSlotArray[thisColumn][thisRow] != null){
					slotData.resultArray[thisColumn][thisRow].visible = false;
					
					slotData.winSlotArray[thisColumn][thisRow].gotoAndPlay('animate');
					slotData.winSlotArray[thisColumn][thisRow].visible = true;
					slotData.winFrameArray[thisColumn][thisRow].visible = true;
					$.lines['line'+linesID].visible = true;
				}
			}
		}	
	}
	
	TweenMax.to(linesContainer, gameSettings.lineSettings.winTimer, {overwrite:true, onComplete:function(){
		slotData.lineHighlight++
		slotData.lineHighlight = slotData.lineHighlight > slotData.linesArray.length-1 ? -1 : slotData.lineHighlight;
		highlightWinSlots();
	}});
}

/*!
 * 
 * CHECK ENG GAME - This is the function that runs to check end game
 * 
 */
function checkEndGame(){
	if(Number(formatCurrency(playerData.credit)) < Number(formatCurrency(gameSettings.betAmount_arr[0] * 1))){
		TweenMax.to(linesContainer, 1, {overwrite:true, onComplete:function(){
			goPage('result');
		}});
	}
}

/*!
 * 
 * MATCH SLOTS - This is the function that runs to match slots
 * 
 */
function findSlotMatchPay(index){
	var pay = 0;
	
	for(var n = 0; n<paytable_arr.length; n++){		
		
		var temp_arr = []
		for(var t = 0; t<paytable_arr[n].index.length; t++){
			temp_arr.push(paytable_arr[n].index[t]);
		}
		
		var wildTotal = 0;
		for(var t = 0; t<index.length; t++){
			var foundIndex = temp_arr.indexOf(index[t]);
			var foundWildIndex = wild_arr.indexOf(index[t]);
			
			if(foundIndex != -1){
				temp_arr.splice(foundIndex, 1);	
			}else if(foundWildIndex != -1){
				wildTotal++;
			}
		}
		
		if(temp_arr.length-wildTotal == 0 && index.length == paytable_arr[n].index.length){
			pay = paytable_arr[n].pay;
		}
	}
	
	return pay;
}

function findSlotMatch(index, type){
	var matchResultCon = -1;
	
	for(var n = 0; n<paytable_arr.length; n++){
		if(type == 2){
			if(paytable_arr[n].index.indexOf(index) != -1){
				matchResultCon = type;
				n = paytable_arr.length;
			}
		}else if(paytable_arr[n].index.indexOf(index) != -1){
			matchResultCon = 0;
			n = paytable_arr.length;
		}
	}
	
	if(matchResultCon == -1){
		if(wild_arr.indexOf(index) != -1){
			matchResultCon = 1;
		}
	}
	
	return matchResultCon;
}

function findManySlotMatch(indexArray){
	var matchResultCon = -1;
	
	for(var n = 0; n<paytable_arr.length; n++){
		var existIndex = 0;
		for(var i=0; i<indexArray.length; i++){
			if(paytable_arr[n].index.indexOf(indexArray[i]) != -1){
				existIndex++;
			}else if(wild_arr.indexOf(indexArray[i]) != -1){
				existIndex++;
			}
		}
		
		if(existIndex == paytable_arr[n].index.length){
			matchResultCon = 1;
		}else if(existIndex == indexArray.length){
			matchResultCon = 0;	
		}
	}
	
	return matchResultCon;	
}

/*!
 * 
 * UPDATE GAME - This is the function that runs to loop game update
 * 
 */
function updateGame(){
	for(var c = 0; c<gameSettings.slotSettings.column; c++){
		for(var s = 0; s<slotData.array[c].obj.length; s++){
			var thisObj = slotData.array[c].obj[s];
			thisObj.y = thisObj.oriY + slotData.array[c].y;
		}	
	}
}

/*!
 * 
 * UPDATE GAME STATS - This is the function that runs to update game stats
 * 
 */
function updateGameStat(){
	linesTxt.text = slotData.lines+1;
	betTxt.text = formatCurrency(gameSettings.betAmount_arr[slotData.amount]);
	
	var finalAmount = (gameSettings.betAmount_arr[slotData.amount] * (slotData.lines+1));
	maxBetTxt.text = textStrings.maxBetText.replace('[NUMBER]', formatCurrency(finalAmount));
	
	if(playerData.win > 0){
		spinTxt.text = textStrings.winBetText.replace('[NUMBER]', formatCurrency(playerData.win));
	}else{
		spinTxt.text = '';
	}
	
	creditTxt.text = textStrings.creditText.replace('[NUMBER]', formatCurrency(playerData.credit - playerData.bet));
}

function startCreditAlert(){
	slotData.creditAlert = 1;
	animateCreditAlert()
}

function animateCreditAlert(){
	slotData.creditAlert--;
	itemCreditAlert.alpha = 0;
	creditTxt.alpha = 1;
	
	var tweenSpeed = .2;
	TweenMax.to(creditTxt, tweenSpeed, {alpha:.5, overwrite:true, onComplete:function(){
		TweenMax.to(creditTxt, tweenSpeed, {alpha:1, overwrite:true, onComplete:function(){
			if(slotData.creditAlert >= 0){
				animateCreditAlert()
			}
		}});
	}});
	
	TweenMax.to(itemCreditAlert, tweenSpeed, {alpha:1, overwrite:true, onComplete:function(){
		TweenMax.to(itemCreditAlert, tweenSpeed, {alpha:0, overwrite:true, onComplete:function(){
			
		}});
	}});
}

/*!
 * 
 * PERCENTAGE - This is the function that runs to create result percentage
 * 
 */
function createPercentage(){
	gameData.percentageArray = [];
	gameData.slotArray = [];
	
	for(var n=0; n<slots_arr.length; n++){
		if(wild_arr.indexOf(n) == -1){
			gameData.slotArray.push(n);
		}
	}
	
	for(var n=0; n<paytable_arr.length; n++){
		paytable_arr[n].id = n;
		
		if(!isNaN(paytable_arr[n].percent)){
			if(paytable_arr[n].percent > 0){
				for(var p=0; p<paytable_arr[n].percent; p++){
					gameData.percentageArray.push(n);
				}
			}
		}
	}
	
	for(var n=gameData.percentageArray.length; n<gameSettings.overallPercent; n++){
		gameData.percentageArray.push(-1);
	}
}

function getResultOnPercent(){
	shuffle(gameData.percentageArray);
	
	var slotsResult = fillSlots(true);
	var paytableIndex = paytable_arr.findIndex(x => x.id === gameData.percentageArray[0]);

	if(paytableIndex != -1){
		var randomLines = Math.floor(Math.random()*lines_arr.length);

		//fill slots
		var slotResultIndex = 0;
		var startLineIndex = Math.round(Math.random()*(lines_arr[randomLines].slots.length - paytable_arr[paytableIndex].index.length));
		var startPayIndex = 0;

		for(var r = 0; r<gameSettings.slotSettings.row; r++){
			for(var c = 0; c<gameSettings.slotSettings.column; c++){
				for(var n = startLineIndex; n<lines_arr[randomLines].slots.length; n++){
					if(startPayIndex < paytable_arr[paytableIndex].index.length){
						if(lines_arr[randomLines].slots[n].c == c && lines_arr[randomLines].slots[n].r == r){
							if(wild_arr.indexOf(slotsResult[slotResultIndex]) == -1){
								slotsResult[slotResultIndex] = paytable_arr[paytableIndex].index[startPayIndex];
							}
							startPayIndex++;
						}
					}
				}
				slotResultIndex++;
			}
		}
	}else{
		slotsResult = fillSlots(false);
	}
	
	return slotsResult;
}

/*!
 * 
 * OPTIONS - This is the function that runs to toggle options
 * 
 */

function toggleOptions(con){
	if(optionsContainer.visible){
		optionsContainer.visible = false;
	}else{
		optionsContainer.visible = true;
	}
	if(con!=undefined){
		optionsContainer.visible = con;
	}
}

/*!
 * 
 * OPTIONS - This is the function that runs to mute and fullscreen
 * 
 */
function toggleSoundMute(con){
	buttonSoundOff.visible = false;
	buttonSoundOn.visible = false;
	toggleSoundInMute(con);
	if(con){
		buttonSoundOn.visible = true;
	}else{
		buttonSoundOff.visible = true;	
	}
}

function toggleMusicMute(con){
	buttonMusicOff.visible = false;
	buttonMusicOn.visible = false;
	toggleMusicInMute(con);
	if(con){
		buttonMusicOn.visible = true;
	}else{
		buttonMusicOff.visible = true;	
	}
}

function toggleFullScreen() {
  if (!document.fullscreenElement &&    // alternative standard method
      !document.mozFullScreenElement && !document.webkitFullscreenElement && !document.msFullscreenElement ) {  // current working methods
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen();
    } else if (document.documentElement.msRequestFullscreen) {
      document.documentElement.msRequestFullscreen();
    } else if (document.documentElement.mozRequestFullScreen) {
      document.documentElement.mozRequestFullScreen();
    } else if (document.documentElement.webkitRequestFullscreen) {
      document.documentElement.webkitRequestFullscreen(Element.ALLOW_KEYBOARD_INPUT);
    }
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.msExitFullscreen) {
      document.msExitFullscreen();
    } else if (document.mozCancelFullScreen) {
      document.mozCancelFullScreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    }
  }
}


/*!
 * 
 * SHARE - This is the function that runs to open share url
 * 
 */
function shareLinks(action, shareScore){
	if(shareSettings.gtag){
		gtag('event','click',{'event_category':'share','event_label':action});
	}

	var gameURL = location.href;
	gameURL = encodeURIComponent(gameURL.substring(0,gameURL.lastIndexOf("/") + 1));

	var shareTitle = shareSettings.shareTitle.replace("[SCORE]", shareScore);
	var shareText = shareSettings.shareText.replace("[SCORE]", shareScore);

	var shareURL = '';
	if( action == 'facebook' ){
		if(shareSettings.customScore){
			gameURL = decodeURIComponent(gameURL);
			shareURL = `https://www.facebook.com/sharer/sharer.php?u=`+encodeURIComponent(`${gameURL}share.php?title=${shareTitle}&url=${gameURL}&thumb=${gameURL}share.jpg`);
		}else{
			shareURL = `https://www.facebook.com/sharer/sharer.php?u=${gameURL}`;
		}
	}else if( action == 'twitter' ){
		shareURL = `https://twitter.com/intent/tweet?text=${shareText}&url=${gameURL}`;
	}else if( action == 'whatsapp' ){
		shareURL = `https://api.whatsapp.com/send?text=${shareText}%20${gameURL}`;
	}else if( action == 'telegram' ){
		shareURL = `https://t.me/share/url?url=${gameURL}&text=${shareText}`;
	}else if( action == 'reddit' ){
		shareURL = `https://www.reddit.com/submit?url=${gameURL}&title=${shareText}`;
	}else if( action == 'linkedin' ){
		shareURL = `https://www.linkedin.com/sharing/share-offsite/?url=${gameURL}`;
	}

	window.open(shareURL);
}