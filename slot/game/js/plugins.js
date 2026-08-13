////////////////////////////////////////////////////////////
// PLUGINS
////////////////////////////////////////////////////////////
function checkContentHeight(target){
	var stageHeight=$( window ).height();
	var newHeight = (stageHeight/2)-(target.height()/2);
	return newHeight;
}

function checkContentWidth(target){
	var stageWidth=$( window ).width();
	var newWidth = (stageWidth/2)-(target.width()/2);
	return newWidth;
}

function shuffle(array) {
	var currentIndex = array.length
	, temporaryValue
	, randomIndex
	;
	
	// While there remain elements to shuffle...
	while (0 !== currentIndex) {
		// Pick a remaining element...
		randomIndex = Math.floor(Math.random() * currentIndex);
		currentIndex -= 1;
		
		// And swap it with the current element.
		temporaryValue = array[currentIndex];
		array[currentIndex] = array[randomIndex];
		array[randomIndex] = temporaryValue;
	}
	
	return array;
}

function randomBoolean(){
    return Math.random() < 0.5;
}

function sortOnObject(array, object, rev) {
	if(rev){
		array.sort(function(a, b){
			var a1= a[object], b1= b[object];
			if(a1== b1) return 0;
			return a1< b1? 1: -1;
		});
	}else{
		array.sort(function(a, b){
			var a1= a[object], b1= b[object];
			if(a1== b1) return 0;
			return a1> b1? 1: -1;
		});
	}
	return array;
}

function randomIntFromInterval(min,max){
    return Math.floor(Math.random()*(max-min+1)+min);
}

function isEven(num){
    // if(num % 2 == 0){return true;}else{return false;} //<–old
    return !(num%2);//shorter
    // return !(num & 1);//seems the fastest one
}


function addCommas(scoreStr) {
	scoreStr += '';
	x = scoreStr.split('.');
	x1 = x[0];
	x2 = x.length > 1 ? '.' + x[1] : '';
	var rgx = /(\d+)(\d{3})/;
	while (rgx.test(x1)) {
		x1 = x1.replace(rgx, '$1' + ',' + '$2');
	}
	return x1 + x2;
}

function loadAddons(skipAddons){
	if(skipAddons) {
		onAddonsLoaded(); return;
	};

    fetch("addons/addons.json")
    .then(function(res){
        if(!res.ok) throw new Error();
        return res.json();
    })
    .then(function(data){
        if(!data.addons || data.addons.length === 0){
            onAddonsLoaded();
            return;
        }
        loadAddonScripts(data.addons, 0);
    })
    .catch(function(){
        onAddonsLoaded();
    });
}

function loadAddonScripts(addons, index){
    if(index >= addons.length){
        onAddonsLoaded();
        return;
    }
    var addon = addons[index];
    var script = document.createElement("script");
    script.src = "addons/" + addon + "/install.js";
    script.onload = function(){
        if(typeof window.initAddon === "function"){
            window.initAddon(function(){
                window.initAddon = null;
                loadAddonScripts(addons, index + 1);
            });
        }else{
            loadAddonScripts(addons, index + 1);
        }

    };
    script.onerror = function(){
        loadAddonScripts(addons, index + 1);
    };
    document.head.appendChild(script);
}

function loadAddonCSS(files){
    if(!files || files.length === 0) return;
    files.forEach(function(url){
        var link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = url;
        document.head.appendChild(link);
    });
}

function loadAddonJS(files, callback){
    if(!files || files.length === 0){
        if(callback) callback();
        return;
    }
    var index = 0;
    function nextJS(){
        if(index >= files.length){
            if(callback) callback();
            return;
        }
        var script = document.createElement("script");
        script.src = files[index];
        script.onload = function(){
            index++;
            nextJS();
        };
        script.onerror = function(){
            console.warn("Addon script failed:", files[index]);
            index++;
            nextJS();
        };
        document.head.appendChild(script);
    }
    nextJS();
}

function onAddonsLoaded(){
   //memberpayment
   if(typeof memberData != 'undefined' && memberSettings.enableMembership){
	   initGameSettings();
   }else{
	   initPreload();
   }
}

function setDirection(obj, toObj) {
    var radiance = 180/Math.PI;
    var walkdirection = -(Math.atan2(toObj.x-obj.x, toObj.y-obj.y))*radiance;
    obj.rotation = walkdirection+180;
}

function formatCurrency(total) {
    var neg = false;
    if(total < 0) {
        neg = true;
        total = Math.abs(total);
    }
    return (neg ? "-" : '') + parseFloat(total, 10).toFixed(2).replace(/(\d)(?=(\d{3})+\.)/g, "1,").toString();
}

function unique(list) {
    var result = [];
    $.each(list, function(i, e) {
        if ($.inArray(e, result) == -1) result.push(e);
    });
    return result;
}