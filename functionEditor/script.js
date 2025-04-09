function draw(){
    ctx.fillStyle = "grey";
    ctx.fillRect(0, 0, 1600, 900);
    ctx.fillStyle = "white";
    ctx.fillRect(800, 0, 10, 900);
    ctx.fillRect(0, 450, 1600, 10);
}
function drawpoint(x,y){
    ctx.fillStyle = "red";
    ctx.fillRect(x + 800, 450 - y, 10, 10);
}
function yicihanshu(k,b){ //y=kx+b
    draw()
    for (let x = -800; x < 800; a++) {
        let y;
        y= k * x + b;
        drawpoint(x,y);
    }
}
function ercihanshu(a,b,c){ //y=ax^2+bx+c
    draw()
    for (let x = -800; x < 800; x--) {
        x = x + 1.001
        let y;
        y = a * x * x + b * x + c;
        drawpoint(x,y);
    }
}
function fanbilihanshu(k){ //y=k/x
    draw()
    for (let x = -800; x < 800; x--) {
        x = x + 1.001
        let y;
        y = k / x;
        drawpoint(x,y);
    }
} 