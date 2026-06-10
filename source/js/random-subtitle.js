(function () {
  var quotes = [
    "一切特立独行的人格，都意味着强大",
    "重要的不是治愈，而是带着病痛活下去",
    "我感到兴趣的是:为所爱而生,为所爱而死",
    "诞生在一个荒谬的世界上的人的唯一真正的职责是活下去，是意识到自己的生命、自己的反抗、自己的自由",
    "除了没用的肉体自杀和精神逃避，第三种自杀的态度是坚持奋斗，对抗人生的荒谬",
    "我已经没有时间去我不感兴趣的事情再产生兴趣",
    "对未来的真正慷慨，是把一切都献给现在",
    "我并不期待人生可以过得很顺利，但我希望碰到人生难关的时候，自己可以是它的对手",
    "我现在渴望的并非快乐，但求自己不要无知"
  ];

  function setRandomSubtitle() {
    var path = window.location.pathname.replace(/\/index\.html$/, "/");
    if (path !== "/") {
      return;
    }

    var subtitle = document.getElementById("subtitle");
    if (!subtitle) {
      return;
    }

    var index = Math.floor(Math.random() * quotes.length);
    subtitle.textContent = quotes[index];
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setRandomSubtitle);
  } else {
    setRandomSubtitle();
  }
})();
