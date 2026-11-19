function AITrainer(){

    this.AIPolicy = new AIPolicy();

}

AITrainer.prototype.init = function(state, gamePolicy){

    AI.opponents = [];
    AI.currentOpponent = new Opponent();
    AI.finishedSession = true;
    AI.iteration = 0;
    AI.sessionStartedAt = Date.now();

    AI.bestOpponentIndex = 0;
    AI.bestOpponentEval = 0;

    if(gamePolicy.foul){
        //TO DO: Pick best position for the white ball.
        state.whiteBall.position.x = 413;
        state.whiteBall.position.y = 413;
        state.whiteBall.inHole = false;
        gamePolicy.foul = false;
    }
    AI.initialState = JSON.parse(JSON.stringify(state));
    AI.initialGamePolicyState = JSON.parse(JSON.stringify(gamePolicy));

    AI.state = state;
    AI.gamePolicy = gamePolicy;

}

AITrainer.prototype.train = function(){

    // 除迭代次数上限外再加一道时间上限：低端机跑不动 300 次时，
    // 用当前已找到的最优解出杆，不让玩家干等。
    if(AI.iteration === TRAIN_ITER ||
        (AI.sessionStartedAt && Date.now() - AI.sessionStartedAt > AI_TRAIN_MAX_MS)){
        AI.finishedSession = true;
        AI.playTurn();
        return;
    }

    let ballsMoving = AI.state.ballsMoving();

    if(!ballsMoving){

        if(AI.iteration !== 0){
            AI.currentOpponent.evaluation = AI.AIPolicy.evaluate(this.state, this.gamePolicy);

            AI.opponents.push(JSON.parse(JSON.stringify(AI.currentOpponent)));

            if(AI.currentOpponent.evaluation > AI.bestOpponentEval){
                AI.bestOpponentEval = AI.currentOpponent.evaluation;
                AI.bestOpponentIndex =  AI.opponents.length - 1;
            }

            if(LOG){
                console.log('-------------'+new Number(AI.iteration+1)+'--------------------');
                console.log('Current evaluation: ' + AI.currentOpponent.evaluation);
                console.log('Current power: ' + AI.currentOpponent.power);
                console.log('Current rotation: ' + AI.currentOpponent.rotation);
                console.log('---------------------------------');
            }
        }

        AI.state.initiateState(AI.initialState.balls);
        AI.gamePolicy.initiateState(AI.initialGamePolicyState);
        AI.buildNewOpponent();
        AI.simulate();
    }

}

AITrainer.prototype.buildNewOpponent = function(){

    if(AI.iteration % 10 === 0){
        AI.currentOpponent = new Opponent();
        AI.iteration++;
        return;
    }

    let bestOpponent = AI.opponents[AI.bestOpponentIndex];

    let newPower = bestOpponent.power;
    newPower += + ((Math.random() * 30) - 15);
    newPower = newPower < 20 ? 20 : newPower;
    newPower = newPower > 75 ? 75 : newPower;

    let newRotation = bestOpponent.rotation;

    if(bestOpponent.evaluation > 0){
        newRotation += (1/bestOpponent.evaluation)*(Math.random() * 2 * Math.PI - Math.PI)
    }
    else{
        newRotation = (Math.random() * 2 * Math.PI - Math.PI);
    }

    AI.currentOpponent = new Opponent(newPower,newRotation);

    AI.iteration++;

}

AITrainer.prototype.simulate = function(){
    AI.state.stick.shoot(AI.currentOpponent.power, AI.currentOpponent.rotation);
}

AITrainer.prototype.playTurn = function(){

    var bestOpponent = AI.opponents[AI.bestOpponentIndex];
    Game.gameWorld.stick.rotation = bestOpponent.rotation;
    Game.gameWorld.stick.trackMouse = false;

    setTimeout(() => {

        // 先恢复到真实台面，再画一帧，最后出杆：
        // 顺序颠倒会闪一帧「训练残留」的画面
        Game.sound = true;
        Mouse.reset();
        Game.gameWorld.stick.visible = true;
        Game.gameWorld.initiateState(AI.initialState.balls);
        Game.policy.initiateState(AI.initialGamePolicyState);

        DISPLAY = true;
        Canvas2D.clear();
        Game.gameWorld.draw();

        Game.gameWorld.stick.shoot(bestOpponent.power, bestOpponent.rotation);
        Game.gameWorld.stick.trackMouse = true;

        requestAnimationFrame(Game.mainLoop);

    }, 1000);
}

// 训练期间的提示：不换画面，只在台面顶部浮一条「思考中」。
// 训练时球会被反复复位重打，所以整段训练期间不再重绘台面，
// 屏幕上保持开始思考前的那一帧，玩家视线不会被打断。
AITrainer.prototype.drawThinkingOverlay = function () {

    var label = Game.policy.turnName() + " 思考中…";
    var accent = Game.policy.turnAccent();
    var fs = 30;
    var w = Canvas2D.measureText(label, fs) + 110;
    var h = 56;
    var x = (Game.size.x - w) / 2;
    var y = 64;

    // 胶囊底 + 左侧色点（用圆角矩形画成圆点）
    Canvas2D.fillRect(x, y, w, h, "rgba(6,16,12,0.80)", h / 2);
    Canvas2D.fillRect(x + 26, y + h / 2 - 5, 10, 10, accent, 5);
    Canvas2D.drawText(label, new Vector2(x + w / 2 + 14, y + (h - fs) / 2 - 2),
        Vector2.zero, "#FFFFFF", "center", "sans-serif", fs + "px");
};

AITrainer.prototype.opponentTrainingLoop = function(){

    Game.sound = false;
    DISPLAY = false;

    if(DISPLAY_TRAINING){
        if(!AI.finishedSession){
            AI.train();
            Game.gameWorld.handleInput(DELTA);
            Game.gameWorld.update(DELTA);
            Canvas2D.clear();
            Game.gameWorld.draw();
            Mouse.reset();
            setTimeout(AI.opponentTrainingLoop,0.00000000001);
        }
        return;
    }

    // 分帧训练（替代原版的 while 同步跑完）。
    // 每帧给足 40ms 算力，避免一口气阻塞几秒；训练只跑物理，不画任何东西，
    // 画面停在「思考中」那一帧，视觉上完全静止。
    var BUDGET_MS = 40;

    var tick = function () {
        if (AI.finishedSession) {
            return;
        }

        var start = Date.now();
        do {
            AI.train();
            Game.gameWorld.handleInput(DELTA);
            Game.gameWorld.update(DELTA);
            Mouse.reset();
        } while (!AI.finishedSession && (Date.now() - start) < BUDGET_MS);

        if (AI.finishedSession) {
            return;
        }

        requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
}

AITrainer.prototype.startSession = function(){
        setTimeout(
            ()=>{
                Game.gameWorld.stick.visible = false;

                // 先按真实台面画一帧，再进训练：
                // AI.init 会改写球位（自由球分支），画在前才不会看到白球跳走。
                Canvas2D.clear();
                Game.gameWorld.draw();
                AI.drawThinkingOverlay();

                AI.init(Game.gameWorld, Game.policy);
                AI.finishedSession = false;
                AI.opponentTrainingLoop();
            },
            1000
        );
}

const AI = new AITrainer();
GameGlobal.AI = AI;
