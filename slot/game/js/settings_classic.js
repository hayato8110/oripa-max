////////////////////////////////////////////////////////////
// SETTINGS
////////////////////////////////////////////////////////////

var gameSettings = {
	creditAmount:30, //game start credit
	betAmount_arr:[
		0.05,
		0.10,
		0.15,
		0.20,
		0.25,
		0.30,
		0.35,
		0.40,
		0.45,
		0.50
	],
	layoutPos:{
		creditY:100, //credit postion y
		buttonY:670 //machine button position y
	},
	slotSettings:{
		width:260, //slot width
		height:260, //slot height
		row:1, //total row
		column:3, //total column
		offsetX:0, //offset position x
		offsetY:-20 //offset position y
	},
	enablePercentage:false,
	overallPercent:200,
	lineSettings:{
		display:true, //display line
		stroke:5, //stroke size
		shadowY:4, //shadow position y
		timer:2, //display timer
		winTimer:2, //win display timer
		sign:true, //display sign
		number:true //display number
	},
	spinSettings :{
		slots:15, //total row of slots to spin
		startSpeed:1, //start speed
		delay:0.2, //delay for each column
		spinningSpeed:1, //spinning speed
		increaseSpeed:0.3, //increase speed for each column
		stopSpeed:0.3, //stop speed
		handle:true //show pull handle
	}
};

var textStrings = {
	creditText:"CREDIT: $[NUMBER]", //credit text display
	maxBetText:"BET: [NUMBER]", //max bet text display
	winBetText:"WIN: $[NUMBER]", //win text display
	exitMessage:"ARE YOUR SURE YOU\nWANT TO QUIT THE GAME?", //exit game message
	resultTitleText:"YOU HAVE WON", //result title text
	resultScoreText:"$[NUMBER]", //result score text
}

//slots array			
var slots_arr = [
	{static:"assets/classic/slot_01.png", animate:"assets/classic/slot_01_Spritesheet4x3.png"},
	{static:"assets/classic/slot_02.png", animate:"assets/classic/slot_02_Spritesheet4x3.png"},
	{static:"assets/classic/slot_03.png", animate:"assets/classic/slot_03_Spritesheet4x3.png"},
	{static:"assets/classic/slot_04.png", animate:"assets/classic/slot_04_Spritesheet4x3.png"},
	{static:"assets/classic/slot_05.png", animate:"assets/classic/slot_05_Spritesheet4x3.png"}
];


//pay table array
var paytable_arr = [
	{index:[0,1,2], pay:10, percent:50},
	{index:[0,0,0], pay:30, percent:40},
	{index:[1,1,1], pay:60, percent:30},
	{index:[2,2,2], pay:100, percent:20},
	{index:[3,3,3], pay:200, percent:10},
	{index:[4,4,4], pay:300, percent:5}
];

//wild array
var wild_arr = [];

//lines array
var lines_arr = [
	{
		color:"#E02828",
		shadow:"#8C1414",
		sign:[],
		path:[],
		slots:[{c:0,r:0},{c:1,r:0},{c:2,r:0}]
	}
];

//Social share, [SCORE] will replace with game score
var shareText = "SHARE YOUR SCORE"; //social share message
var shareSettings = {
	enable:true,
	options:['facebook','twitter','whatsapp','telegram','reddit','linkedin'],
	shareTitle:'Highscore on Slot Machine Game is $[SCORE].',
	shareText:'$[SCORE] is mine new highscore on Slot Machine Game! Play it now!',
	customScore:true, //share a custom score to Facebook, it use customize share.php (Facebook and PHP only)
	gtag:true //Google Tag
}