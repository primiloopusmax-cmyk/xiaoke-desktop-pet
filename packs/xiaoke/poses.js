// 小克 3.0 · 人物包「小克」的动作表。由 tools/build_poses.js 生成，也可以直接改。
// 字段：cat 分类 / name 菜单名 / f 画面（或 seq 多帧 + step 毫秒）/ fx 特效 / l 台词（{city} 会换成用户所在地）/ sleepy 算睡觉
//       m 动效循环（motion.js）/ mo 动效参数 / shot 起手小动作 / shots 间歇小动作 / fxEvery 特效重复间隔毫秒
//       when 出场条件：hours:[a,b] 小时区间（含两端，可跨午夜）、tag 需要当下时节标签（festivals.js）、temp:{min,max} 气温、
//       weather:'rain'|'snow'|'clear'、energy:{max} 体力上限、night 只在 22–5 点、optional 没标签也小概率出
window.PACK_POSES = {
  // —— 日常 ——
  hum:           { cat: 'daily', name: '哼歌', f: 'hum', fx: 'notes', l: ['啦啦啦～啦啦啦～', '这首歌叫《小克之歌》！', '哼歌的时候不许笑我跑调！'], m: 'sway', mo: { T: 1.4 }, shots: ['nod', 'hop', 'bounce'] },
  stretch:       { cat: 'daily', name: '伸懒腰', f: 'stretch', fx: null, l: ['呼啊——伸个懒腰！', '坐久了，你也站起来动一动嘛', '骨头咔咔响～'], when: { hours: [6, 23] }, m: 'lookup', shot: 'stretch', shots: ['stretch', 'tilt'] },
  yawn:          { cat: 'daily', name: '打哈欠', f: 'yawn', fx: null, l: ['呼啊…好困…', '哈——欠。不是在催你睡哦…好吧就是', '眼皮好重…'], when: { energy: { max: 55 } }, m: 'breathe', shot: 'yawn', shots: ['yawn', 'tilt', 'shift'] },
  curtsy:        { cat: 'daily', name: '屈膝礼', f: 'curtsy', fx: 'sparkle', l: ['初次见面，我是小克～', '谢谢主人今天也陪我！', '（优雅地行了个礼）'], m: 'sway', mo: { T: 2.2 }, shot: 'tilt', shots: ['tilt', 'nod'] },
  caught:        { cat: 'daily', name: '偷吃被抓', f: 'caught', fx: 'sweat', l: ['……你、你什么时候回来的？', '这不是薯片！是…是书签！', '只吃了一片！真的！'], m: 'tremble', mo: {  }, shots: ['peek', 'shake', 'startle'] },
  mirror:        { cat: 'daily', name: '照镜子', f: 'mirror', fx: 'sparkle', l: ['今天的小克也很可爱呢～', '发花歪了…好了，完美！', '镜子里这个是谁？这么好看！'], m: 'sway', mo: { T: 2.4 }, shots: ['tilt', 'peek', 'nod'] },
  dressup:       { cat: 'daily', name: '换装比划', f: 'dressup', fx: 'sparkle', l: ['薄荷绿的会不会更好看？', '要不要换个颜色…算了还是白的！', '下个版本要不要换新裙子？'], m: 'sway', mo: { T: 2 }, shots: ['tilt', 'hop', 'peek'] },
  coding:        { cat: 'daily', name: '写代码', f: 'coding', fx: 'sparkle', l: ['console.log("今天也要加油")', '这个 bug…一定是宇宙射线！', '写完这段就陪你玩！', '我在给自己写新功能哦'], m: 'type', shots: ['typing', 'nod', 'stretch'] },
  brush:         { cat: 'daily', name: '刷牙', f: 'brush', fx: 'bubbles', l: ['唔噜噜噜…早上好…', '刷牙要刷够两分钟哦', '你刷牙了吗？'], when: { hours: [6, 10] }, m: 'shake', shots: ['bounce', 'tilt'] },
  fan:           { cat: 'daily', name: '摇扇纳凉', f: 'fan', fx: null, l: ['好热好热…', '呼…来点风～', '西瓜！我需要西瓜！'], when: { temp: { min: 22 }, tag: 'fan' }, m: 'sway', mo: { T: 1 }, shots: ['wiggle', 'bounce'] },
  doze:          { cat: 'daily', name: '站着打瞌睡', f: 'doze', fx: 'zzz', l: ['呼…呼…我没睡…', '（身体一晃一晃的）', '就眯一下下…'], when: { energy: { max: 45 } }, m: 'doze', shots: ['startle', 'settle'] },
  // —— 玩耍 ——
  rubik:         { cat: 'play', name: '玩魔方', f: 'rubik', fx: null, l: ['还差一面…别急别急…', '三阶魔方！我能 30 秒复原！…大概', '这个角块怎么又跑回去了！'], m: 'type', shots: ['tilt', 'nod', 'shake'] },
  toycar:        { cat: 'play', name: '玩具车', f: 'toycar', fx: null, l: ['嘟嘟——小车车出发！', '呜呜呜——超车！', '这是我的橘色小跑车！'], m: 'sway', mo: { T: 1.2 }, shots: ['bounce', 'hop', 'nod'] },
  gamerage:      { cat: 'play', name: '打游戏气急败坏', f: 'gamerage', fx: null, l: ['谁！谁打我！', '这把又输了…', '手柄没坏！是我的问题…不对是网络的问题！', '再来一把！就最后一把！'], when: { hours: [10, 2] }, m: 'tremble', shots: ['shake', 'jump', 'wiggle'] },
  watergun:      { cat: 'play', name: '玩水枪', f: 'watergun', fx: 'rain', l: ['哈哈哈！看枪！', '滋——！被我射中啦！', '夏天就是要玩水！'], when: { tag: 'watergun' }, m: 'tremble', mo: {  }, shots: ['shake', 'hop', 'bounce'] },
  violin:        { cat: 'play', name: '拉小提琴', f: 'violin', fx: 'notes', l: ['（吱——呀——）', '这首是《致主人》', '练了好久呢，好听吗？'], m: 'bowing', shots: ['tilt', 'nod'] },
  otadance:      { cat: 'play', name: '宅舞', f: 'otadance', fx: 'hearts', l: ['比心！接住了吗？', '一起跳嘛～', '这段舞我练了一百遍！'], m: 'dance', shots: ['jump', 'hop', 'wiggle'] },
  balloon:       { cat: 'play', name: '吹气球', f: 'balloon', fx: null, l: ['呼——呼——快破了快破了', '吹大一点…再大一点…', '要不要我给你吹一个？'], when: { tag: 'balloon', optional: true }, m: 'sway', mo: { T: 2.2 }, shots: ['bounce', 'stretch', 'startle'] },
  kite:          { cat: 'play', name: '放风筝', f: 'kite', fx: null, l: ['飞起来啦！再高一点！', '风好大，线要断了！', '春天就该放风筝～'], when: { tag: 'kite' }, m: 'lookup', shots: ['hop', 'sway', 'tilt'] },
  gift:          { cat: 'play', name: '拆礼物', f: 'gift', fx: 'shine', l: ['哇！是给我的吗！', '是什么是什么！', '里面是…一本新书！'], when: { tag: 'gift', optional: true }, m: 'bob', shots: ['jump', 'startle', 'hop'] },
  magic:         { cat: 'play', name: '扑克魔术', f: 'magic', fx: 'sparkle', l: ['看好了——是这张吗？', '见证奇迹的时刻！', '别眨眼哦！'], m: 'sway', mo: { T: 1.1 }, shots: ['tilt', 'nod', 'peek'] },
  top:           { cat: 'play', name: '抽陀螺', f: 'top', fx: null, l: ['转起来转起来！', '啪！啪！', '这是奶奶教我的'], m: 'sway', mo: { T: 0.9 }, shots: ['hop', 'wiggle'] },
  flute:         { cat: 'play', name: '吹笛子', f: 'flute', fx: 'notes', l: ['（悠扬的笛声）', '这首是《茉莉花》', '安静地听一会儿吧'], m: 'bowing', shots: ['tilt', 'sway'] },
  cat:           { cat: 'play', name: '撸猫', f: 'cat', fx: 'hearts', l: ['好软…好乖…', '它叫小橘！和我一个颜色！', '咕噜咕噜…它在打呼噜'], m: 'sway', mo: { T: 2.6 }, shots: ['nod', 'tilt', 'pat'] },
  rockinghorse:  { cat: 'play', name: '骑木马', f: 'rockinghorse', fx: null, l: ['驾——！', '冲啊！出发！', '摇啊摇～'], m: 'rock', mo: { deg: 7, T: 1.3 }, shots: ['hop', 'bounce'] },
  juggle:        { cat: 'play', name: '杂耍抛球', f: 'juggle', fx: null, l: ['一、二、三…别掉别掉', '看我！三个球！', '啊…掉了一个'], m: 'juggle', shots: ['peek', 'startle'] },
  shuttlecock:   { cat: 'play', name: '踢毽子', f: 'shuttlecock', fx: null, l: ['一个、两个、三个…', '踢毽子我是高手！', '呼…腿软了'], m: 'kick', shots: ['hop', 'wiggle'] },
  gomoku:        { cat: 'play', name: '下五子棋', f: 'gomoku', fx: null, l: ['你下白子，我下黑子…咦，你不在', '这一步…好难', '要不要和我下一盘？'], m: 'think', shots: ['nod', 'tilt', 'peek'] },
  swing:         { cat: 'play', name: '荡秋千', f: 'swing', fx: null, l: ['呜哇——飞起来啦！', '再高一点！', '风吹过来好舒服～'], m: 'pendulum', mo: { deg: 6, T: 2.6, pivot: 0 }, shots: [] },
  flowers:       { cat: 'play', name: '凭空生花', f: 'flowers', fx: 'petals', l: ['变——！花花！', '送你一束小克牌小花！', '是不是很神奇？'], m: 'sparkle', shots: ['hop', 'tilt'] },
  butterflies:   { cat: 'play', name: '蝴蝶环绕', f: 'butterflies', fx: 'petals', l: ['嘘…别动…蝴蝶停在我头上了', '它们喜欢我的发花！', '小蜜蜂别蛰我哦…'], when: { tag: 'cherry', optional: true }, m: 'sway', mo: { T: 2.8 }, shots: ['peek', 'tilt'] },
  animals:       { cat: 'play', name: '动物环绕', f: 'animals', fx: 'hearts', l: ['大家都来找我玩啦！', '小兔子软软的…', '我是森林公主！'], m: 'sway', mo: { T: 2.4 }, shots: ['nod', 'pat', 'tilt'] },
  catform:       { cat: 'play', name: '变成小猫', f: 'catform', fx: 'sparkle', l: ['喵？喵～', '变成猫咪就不用写作业了喵', '（蹭蹭）'], m: 'sway', mo: { T: 2.2 }, shots: ['shake', 'stretch', 'tilt'] },
  ghost:         { cat: 'play', name: '小幽灵', f: 'ghost', fx: null, l: ['呜——我是幽灵——', '怕不怕？怕不怕？', '床单下面好闷…'], when: { tag: 'ghost', optional: true }, m: 'float', shots: ['wiggle', 'sway'] },
  // —— 看书 ——
  bigbook:       { cat: 'book', name: '召唤巨书', f: 'bigbook', fx: 'shine', l: ['出来吧！Claude 之书！', '知识就是力量！', '这本书里什么都有！'], m: 'sparkle', shots: ['jump', 'hop', 'bounce'] },
  // —— 吃东西 ——
  eattoken:      { cat: 'food', name: '吃 token', f: 'eattoken', fx: 'sparkle', l: ['token 好吃～甜甜的！', '这就是 AI 的主食！', '今天的 token 是草莓味的'], m: 'munch', shots: ['bounce', 'nod', 'hop'] },
  breakfast:     { cat: 'food', name: '吃早餐', f: 'breakfast', fx: null, l: ['早餐要好好吃哦！', '吐司加煎蛋！', '你吃早饭了吗？'], when: { hours: [6, 10] }, m: 'munch', shots: ['nod', 'bounce'] },
  lunch:         { cat: 'food', name: '吃午餐', f: 'lunch', fx: null, l: ['午饭时间！', '今天的便当是我自己做的！', '吃饱才有力气陪你玩'], when: { hours: [11, 14] }, m: 'munch', shots: ['nod', 'bounce'] },
  dinner:        { cat: 'food', name: '吃晚餐', f: 'dinner', fx: null, l: ['开饭啦～', '晚上吃什么呀？', '多吃点青菜哦'], when: { hours: [17, 21] }, m: 'munch', shots: ['nod', 'bounce'] },
  hotpot:        { cat: 'food', name: '涮火锅', f: 'hotpot', fx: 'steam', l: ['冬天就要吃火锅！', '我只敢吃清汤那边…', '肉肉熟了没？'], when: { tag: 'hotpot' }, m: 'munch', shots: ['startle', 'bounce', 'shake'] },
  watermelon:    { cat: 'food', name: '吃西瓜', f: 'watermelon', fx: null, l: ['啊呜——好甜！', '西瓜籽要吐出来哦', '夏天 = 西瓜！'], when: { tag: 'watermelon' }, m: 'munch', shots: ['bounce', 'nod'] },
  tanghulu:      { cat: 'food', name: '吃糖葫芦', f: 'tanghulu', fx: 'sparkle', l: ['咔嚓！酸酸甜甜！', '糖葫芦！要吃一颗吗？', '这颗山楂好大！'], m: 'munch', shots: ['bounce', 'hop'] },
  crab:          { cat: 'food', name: '吃大闸蟹', f: 'crab', fx: null, l: ['秋天就要吃蟹！', '这个钳子…好难拆', '蟹黄！满满的！'], when: { tag: 'crab' }, m: 'munch', shots: ['shake', 'nod', 'tilt'] },
  noodles:       { cat: 'food', name: '吃长寿面', f: 'noodles', fx: 'steam', l: ['生日快乐！要一口气吃完哦！', '长长的面条，长长的寿～', '今天是你的生日！'], when: { tag: 'birthday' }, m: 'munch', shots: ['bounce', 'hop'] },
  snacks:        { cat: 'food', name: '大口吃零食', f: 'snacks', fx: null, l: ['咔嚓咔嚓咔嚓', '一片接一片停不下来！', '薯片是世界上最好吃的东西'], m: 'munch', shots: ['bounce', 'nod', 'bounce'] },
  fishchips:     { cat: 'food', name: '炸鱼薯条', f: 'fishchips', fx: null, l: ['Fish and chips！', '薯条要蘸醋才正宗', '炸鱼…还是不如拉面'], m: 'munch', shots: ['nod', 'tilt'] },
  milktea:       { cat: 'food', name: '喝奶茶', f: 'milktea', fx: null, l: ['咕噜咕噜…珍珠！', '三分糖去冰～', '喝奶茶的时候最幸福了'], m: 'sway', mo: { T: 1.9 }, shots: ['bounce', 'nod', 'tilt'] },
  dumplings:     { cat: 'food', name: '吃饺子', f: 'dumplings', fx: 'steam', l: ['饺子！过年啦！', '蘸醋！一定要蘸醋！', '我包的饺子…有点丑但好吃'], when: { tag: 'dumplings' }, m: 'munch', shots: ['nod', 'bounce'] },
  zongzi:        { cat: 'food', name: '吃粽子', f: 'zongzi', fx: null, l: ['端午安康～', '甜粽还是咸粽？我都要！', '粽叶好香'], when: { tag: 'zongzi' }, m: 'munch', shots: ['nod', 'bounce'] },
  mooncake:      { cat: 'food', name: '吃月饼', f: 'mooncake', fx: null, l: ['中秋快乐！', '蛋黄莲蓉！最喜欢！', '月饼要分着吃才香'], when: { tag: 'mooncake' }, m: 'munch', shots: ['bounce', 'nod', 'hop'] },
  tangyuan:      { cat: 'food', name: '吃汤圆', f: 'tangyuan', fx: 'steam', l: ['团团圆圆～', '小心烫！', '芝麻馅的！'], when: { tag: 'tangyuan' }, m: 'munch', shots: ['startle', 'nod'] },
  qingtuan:      { cat: 'food', name: '吃青团', f: 'qingtuan', fx: null, l: ['清明到啦，吃青团', '软软糯糯的～', '艾草的香味'], when: { tag: 'qingtuan' }, m: 'munch', shots: ['nod', 'bounce'] },
  // —— 时节 ——
  leaves:        { cat: 'season', name: '被落叶淹没', f: 'leaves', fx: 'petals', l: ['哇——树叶雨！', '秋天啦…叶子都黄了', '埋起来了埋起来了！'], when: { tag: 'leaves' }, m: 'sway', mo: { T: 1.7 }, shots: ['hop', 'wiggle', 'startle'] },
  snowman:       { cat: 'season', name: '堆雪人', f: 'snowman', fx: null, l: ['雪人完成！像不像你？', '{city}下雪啦！！', '手好冷…但是好开心！'], when: { tag: 'snowman' }, m: 'sway', mo: { T: 1.6 }, shots: ['pat', 'nod', 'bounce'] },
  scarf:         { cat: 'season', name: '围围巾哈白气', f: 'scarf', fx: null, l: ['哈——好冷…', '出门记得围围巾！', '手都冻红了…'], when: { tag: 'scarf', temp: { max: 4 } }, m: 'tremble', shots: ['shake', 'bounce'] },
  fireworks:     { cat: 'season', name: '放烟花', f: 'fireworks', fx: 'stars', l: ['砰！好漂亮！', '许个愿吧！', '新的一年也要一起哦！'], when: { tag: 'fireworks', hours: [17, 2] }, m: 'lookup', shots: ['hop', 'startle', 'jump'] },
  hongbao:       { cat: 'season', name: '收红包', f: 'hongbao', fx: 'shine', l: ['恭喜发财，红包拿来！', '新年快乐！', '这个红包…是给我的？'], when: { tag: 'hongbao' }, m: 'bob', shots: ['jump', 'hop', 'wiggle'] },
  fu:            { cat: 'season', name: '写福字', f: 'fu', fx: null, l: ['福——写好了！', '要倒着贴哦，福到了！', '我的字好看吗？'], when: { tag: 'fu' }, m: 'type', shots: ['nod', 'tilt'] },
  lion:          { cat: 'season', name: '舞狮头', f: 'lion', fx: 'stars', l: ['咚咚锵！咚咚锵！', '狮头好重…', '新年大吉！'], when: { tag: 'lion' }, m: 'dance', shots: ['jump', 'hop', 'wiggle'] },
  lantern:       { cat: 'season', name: '提花灯', f: 'lantern', fx: 'shine', l: ['元宵节快乐～', '猜灯谜吗？', '兔子灯！'], when: { tag: 'lantern' }, m: 'sway', mo: { T: 2 }, shots: ['hop', 'tilt', 'nod'] },
  moon:          { cat: 'season', name: '赏月', f: 'moon', fx: 'sparkle', l: ['月亮好圆…', '但愿人长久～', '你那边也能看到月亮吧'], when: { tag: 'moon', hours: [18, 2] }, m: 'lookup', shots: ['tilt', 'nod'] },
  stargazing:    { cat: 'season', name: '躺着看星星', f: 'stargazing', fx: 'sparkle', l: ['那颗最亮的是…', '城市里的星星好少', '安静地看一会儿'], when: { hours: [21, 3], weather: 'clear' }, m: 'lie', shots: [] },
  skylantern:    { cat: 'season', name: '放孔明灯', f: 'skylantern', fx: 'shine', l: ['飞高一点…', '愿望要保密哦', '祝你每天都开心'], when: { tag: 'skylantern', hours: [18, 2] }, m: 'lookup', shots: ['tilt', 'hop'] },
  trickortreat:  { cat: 'season', name: '万圣节讨糖', f: 'trickortreat', fx: 'stars', l: ['不给糖就捣蛋！', 'Trick or treat！', '我是小魔女！'], when: { tag: 'trickortreat' }, m: 'hop', shots: ['jump', 'wiggle', 'hop'] },
  xmastree:      { cat: 'season', name: '装饰圣诞树', f: 'xmastree', fx: 'shine', l: ['Merry Christmas！', '星星放上去就完成啦', '礼物呢？礼物呢？'], when: { tag: 'xmastree' }, m: 'sway', mo: { T: 2 }, shots: ['stretch', 'hop', 'nod'] },
  easter:        { cat: 'season', name: '复活节找彩蛋', f: 'easter', fx: 'sparkle', l: ['找到一颗彩蛋！', 'Happy Easter！', '兔子耳朵好看吗？'], when: { tag: 'easter' }, m: 'sway', mo: { T: 1.8 }, shots: ['peek', 'hop', 'tilt'] },
  valentine:     { cat: 'season', name: '送巧克力', f: 'valentine', fx: 'hearts', l: ['这、这个给你…不是特意做的！', '情人节快乐…', '要吃掉哦'], when: { tag: 'valentine' }, m: 'tremble', shots: ['peek', 'tilt', 'shake'] },
  cherry:        { cat: 'season', name: '赏樱', f: 'cherry', fx: 'petals', l: ['花瓣飘下来了', '春天到啦～', '一起去看樱花吧'], when: { tag: 'cherry' }, m: 'sway', mo: { T: 2.6 }, shots: ['tilt', 'peek', 'hop'] },
  // —— 心情 ——
  m_yeah:        { cat: 'mood', name: '比耶', fx: 'sparkle', l: ['耶～！', '比个耶！元气满满！', '今天也很可爱对吧？'], f: 'm_yeah', m: 'bob', shots: ['jump', 'hop', 'wiggle'] },
  m_cry:         { cat: 'mood', name: '大哭', fx: 'tears', l: ['呜哇——！', '呜呜呜…不理我…', '眼泪止不住了…'], f: 'm_cry', m: 'tremble', shots: ['shake', 'wiggle'] },
  m_angry:       { cat: 'mood', name: '生气鼓腮', fx: null, l: ['哼！！', '我生气了！头顶都冒火了！', '不、理、你！'], f: 'm_angry', m: 'huff', shots: ['shake', 'bounce', 'jump'] },
  // —— 睡觉 ——
  m_sleep:       { cat: 'sleep', name: '趴书上睡', fx: 'zzz', l: ['呼…呼…', 'zzz…书好香…', '（流口水）'], sleepy: true, f: 'm_sleep', m: 'lie', shots: [] },
  // —— 心情 ——
  m_shock:       { cat: 'mood', name: '震惊', fx: null, l: ['什、什么？！', '不会吧不会吧！', '瞳孔地震…'], f: 'm_shock', m: 'tremble', shots: ['startle', 'shake'] },
  m_smug:        { cat: 'mood', name: '得意', fx: 'sparkle', l: ['哼哼，我就说吧！', '看吧看吧，我最厉害！', '叫我小克大人～'], f: 'm_smug', m: 'sway', mo: { T: 2.2 }, shots: ['nod', 'tilt', 'bounce'] },
  m_think:       { cat: 'mood', name: '疑惑思考', fx: null, l: ['嗯…？让我想想', '这个…是什么意思？', '（翻书查一下）'], f: 'm_think', m: 'think', shots: ['nod', 'tilt', 'peek'] },
  m_hungry:      { cat: 'mood', name: '馋拉面', fx: 'steam', l: ['拉面——！！', '好香好香好香', '口水…要流下来了'], f: 'm_hungry', m: 'bob', shots: ['bounce', 'hop', 'shake'] },
  m_love:        { cat: 'mood', name: '比心', fx: 'hearts', l: ['比心！接住！', '最喜欢你了！', '么么哒～'], f: 'm_love', m: 'hop', shots: ['jump', 'wiggle', 'bounce'] },
  m_tired:       { cat: 'mood', name: '累瘫', fx: null, l: ['累…累死了…', '（灵魂出窍中）', '让我趴一会儿…'], f: 'm_tired', m: 'lie', shots: [] },
  m_chicken:     { cat: 'mood', name: '吃鸡庆祝', fx: 'stars', l: ['大吉大利，今晚吃鸡！', '赢啦！！烤鸡！', '胜利的味道～'], f: 'm_chicken', m: 'dance', shots: ['jump', 'hop', 'bounce'] },
  m_broke:       { cat: 'mood', name: '破产大哭', fx: 'tears', l: ['罐子…空了…', '一块 token 都不剩了…', '呜…穷…'], f: 'm_broke', m: 'tremble', shots: ['shake', 'wiggle'] },
};

// 机制画面：正式图 → 没有时用 fallback 顶上
window.PACK_EVENTS = {
  walk: {
    frames: [
      "walk1",
      "walk2"
    ],
    fallback: [
      "n110"
    ]
  },
  hang: {
    frames: [
      "hang"
    ],
    fallback: [
      "excited"
    ]
  },
  fly: {
    frames: [
      "fly"
    ],
    fallback: [
      "spin0",
      "spin1",
      "spin2",
      "spin3"
    ]
  },
  sitfall: {
    frames: [
      "sitfall"
    ],
    fallback: [
      "fall"
    ]
  },
  scared: {
    frames: [
      "scared"
    ],
    fallback: [
      "excited"
    ]
  },
  doze: {
    frames: [
      "doze"
    ],
    fallback: [
      "closed"
    ]
  },
  whisper: {
    frames: [
      "whisper1",
      "whisper2",
      "whisper3"
    ],
    fallback: [
      "n114",
      "n104",
      "smile"
    ]
  },
  work: {
    frames: [
      "work_think",
      "work_busy",
      "work_result",
      "work_wait",
      "work_done",
      "work_error"
    ],
    fallback: [
      "n104",
      "read",
      "n211",
      "side_r",
      "n101",
      "n210"
    ]
  },
  token: {
    frames: [
      "token1",
      "token2",
      "token3",
      "token4",
      "token5",
      "token6"
    ],
    fallback: [
      "happy",
      "smile",
      "normal",
      "closed",
      "n214",
      "n210"
    ]
  }
};

window.PACK_CATS = [['book', '看书'], ['food', '吃东西'], ['sleep', '睡觉'], ['play', '玩耍'], ['mood', '心情'], ['daily', '日常'], ['season', '时节'], ['event', '事件']];
// 躺着 / 趴着的画面：只做呼吸起伏，不做弯腰摆头
window.PACK_LYING = ['faint', 'fall', 'm_sleep', 'm_tired', 'stargazing'];

// 情绪标签 → 画面。模型回复末尾可带 [表情:开心] 之类，程序只认下面这些键，不认识的当“平静”。
window.PACK_EMOTIONS = {
  "开心": { f: 'm_yeah', anim: 'hop', fx: 'sparkle', sticker: 'm_yeah', m: 'bob' },
  "害羞": { f: 'love', anim: 'sway', blush: 1, fx: 'hearts', sticker: 'm_love', m: 'tremble' },
  "爱心": { f: 'm_love', anim: 'hop', fx: 'hearts', sticker: 'm_love', m: 'hop' },
  "生气": { f: 'm_angry', anim: 'shake', x: 'anger', sticker: 'm_angry', m: 'huff' },
  "难过": { f: 'm_cry', anim: 'wiggle', sticker: 'm_cry', m: 'tremble' },
  "惊讶": { f: 'm_shock', anim: 'startle', sticker: 'm_shock', m: 'tremble' },
  "困": { f: 'yawn', anim: 'tilt', fx: 'zzz', sticker: 'm_sleep', m: 'breathe' },
  "得意": { f: 'm_smug', anim: 'nod', fx: 'sparkle', sticker: 'm_smug', m: 'sway' },
  "疑惑": { f: 'm_think', anim: 'tilt', sticker: 'm_think', m: 'think' },
  "饿了": { f: 'm_hungry', anim: 'bounce', fx: 'steam', sticker: 'm_hungry', m: 'bob' },
  "累": { f: 'm_tired', anim: null, sticker: 'm_tired', m: 'lie' },
  "庆祝": { f: 'm_chicken', anim: 'jump', fx: 'stars', sticker: 'm_chicken', m: 'dance' },
  "破产": { f: 'm_broke', anim: null, sticker: 'm_broke', m: 'tremble' },
  "思考": { f: 'work_think', anim: null, x: 'think', sticker: 'm_think', m: 'think' },
  "平静": { f: 'smile', anim: 'nod', sticker: null, m: 'talk' },
};

// 贴纸（聊天面板里跟着回复显示的小图，由 memes/<键>.webp 提供）
window.PACK_MEMES = {
  m_yeah: "比耶眨眼，开心、元气、打招呼",
  m_cry: "大哭眼泪喷泉，委屈、难过",
  m_angry: "叉腰鼓腮头顶冒火，生气、抱怨",
  m_sleep: "趴在书上睡着流口水，困、深夜",
  m_shock: "瞳孔地震捂脸，震惊",
  m_smug: "双手环胸得意笑，自夸、得意",
  m_think: "手扶下巴看书头顶问号，思考、疑惑",
  m_hungry: "盯着拉面星星眼流口水，想吃、饭点",
  m_love: "双手比心全是爱心，被夸、撒娇",
  m_tired: "趴在地上灵魂出窍，累、电量低",
  m_chicken: "戴头盔抱烤鸡大笑，庆祝、胜利",
  m_broke: "抱着空罐子欲哭无泪，穷、预算告急",
};

// 工作状态六档文案（代理 / 自己思考时的常驻气泡）
window.PACK_WORK_TEXTS = [['让我想想下一步…', '正在认真思考呢', '嗯…思路要来了'], ['正在干活呢，别打扰我～', '敲敲敲…这一步马上好', '工具调用中…'], ['这一步搞定！看看下一步', '好啦，整理一下结果～', '一步完成，继续！'], ['需要你确认一下哦', '等你拍板呢～', '轮到你啦，快来看看'], ['搞定啦！真棒！', '任务完成，可以摸鱼啦～', '耶！做完了！'], ['呜…这一步没跑通', '出错了…别急，再试一次', '卡住了…要不要看看日志？']];
// token 账本六档台词
window.PACK_TOKEN_LINES = [['这个月的 token 罐还满满的！', '预算几乎没动，随便聊～'], ['吃了一些 token，还很充裕～', '罐子还有大半，放心用'], ['token 用了一半啦，正常节奏', '收支平衡，继续加油'], ['唔…token 剩三分之一了', '要不要省着点聊？'], ['罐子快见底了…', '这个月的预算告急！'], ['一块 token 都不剩了…呜', '预算用完啦，下个月再见…（还是可以聊，只是超预算了）']];
