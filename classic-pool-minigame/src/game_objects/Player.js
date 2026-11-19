
// 玩家数据：除了规则用的颜色分组与比分，还带上昵称和专属配色，
// 让对局 HUD 能一眼区分「谁是谁、轮到谁」。
function Player(matchScore, totalScore){
    this.color = undefined;
    this.matchScore = matchScore;
    this.totalScore = totalScore;
    this.name = "";
    this.accent = "#FFFFFF";
}
GameGlobal.Player = Player;
