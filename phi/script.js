//定义全局变量
var isStart = 0 ;
var tap = new Audio('./sound/Tap.wav');
var drag = new Audio('./sound/Drag.wav');
var flick = new Audio('./sound/Flick.wav');
var xpostion = 850;
var ypostion = 500;


//绘制画布
function reset(){
ctx.fillStyle = "grey";
ctx.fillRect(100, 100, 1600, 900);
}


//主函数 
function start(){
    ctx.fillStyle = "grey";
    ctx.fillRect(100, 100, 1600, 900); //显示区域
    ctx.fillStyle = "yellow";
    ctx.fillRect(100, 800, 1600, 9); //判定线
    //解析谱面文件json
    var judgeLineList = obj.judgeLineList;
    //alert(JSON.stringify(judgeLineList));
    //alert(JSON.stringify(judgeLineList[1]));
    //alert(judgeLineListCount[1]);
    var line = judgeLineList[0]; //第一条线
    var linebpm = line.bpm;
    //alert(linebpm);
    var linenotesAbove = line.notesAbove; //上方
    var linenotesBelow = line.notesBelow; //下方
    var linecharttime = 1 / (linebpm / 60) / 32 ; //计算1/32拍所需的时间
    //alert(linecharttime);
    isStart = 1;
    var i = 0; //初始化 必须用全局变量 不然会出奇怪的bug
    setInterval(() => {
        
        debugthisText.innerText = "thisTime:" + linenotesAbove[i].time; 

        if (linenotesAbove[i].time < charttimeline) { //判断note何时显示
            //alert(i);
            i = ++i;
            ctx.fillStyle = "blue";
            ctx.fillRect(100, 100, 80, 45);
            tap.play();
        }
    }, 0); //0ms循环一次
}


//debug专用
function test(){
    alert(linecharttime);
}


//计算过去了多少个1/32拍
var charttimeline;
charttimeline = 0;
setInterval(() => {
    if (isStart == 1) {
    charttimeline = charttimeline + 1 ;  
    //alert(charttimeline);
    debugText.innerText = "chartTime:" + charttimeline;
          
    }
    
}, 0.0075); //这里应该是'linecharttime'但是有奇怪的问题