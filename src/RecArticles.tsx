import type { ReactNode } from 'react'

export type RecArticleId =
  | 'article-age'
  | 'article-maintain'
  | 'article-sing'
  | 'article-survive'
  | 'article-topics'
  | 'article-silent'

export type RecBanner = {
  id: string
  title: string
  subtitle: string
  article: RecArticleId
  kicker: string
}

export const REC_BANNERS: RecBanner[] = [
  {
    id: 'age',
    title: '不同年龄段的大哥大姐，主播应该怎么维护？',
    subtitle: '小年轻 / 中年 / 中老年 · 维护策略',
    article: 'article-age',
    kicker: '维护攻略',
  },
  {
    id: 'maintain',
    title: '娱乐主播如何做好有效维护？记住这三个关键点',
    subtitle: '看阶段 · 给情绪价值 · 有节奏',
    article: 'article-maintain',
    kicker: '有效维护',
  },
  {
    id: 'sing',
    title: '语音厅点唱环节怎么做？',
    subtitle: '铺场 · 六种点歌 · 敢点还想点',
    article: 'article-sing',
    kicker: '厅内玩法',
  },
  {
    id: 'survive',
    title: '语音厅主播生存实话：做语音主播，千万别太正经',
    subtitle: '放得开 · 勤维护 · 抗压心态',
    article: 'article-survive',
    kicker: '生存实话',
  },
  {
    id: 'topics',
    title: '语音厅主播到底应该聊什么？',
    subtitle: '能接住才算好话题',
    article: 'article-topics',
    kicker: '话题指南',
  },
  {
    id: 'silent',
    title: '语音厅-如何留住沉默玩家',
    subtitle: '沉默不等于没兴趣',
    article: 'article-silent',
    kicker: '留人技巧',
  },
]

const TITLES: Record<RecArticleId, string> = {
  'article-age': '不同年龄段的大哥大姐，主播应该怎么维护？',
  'article-maintain': '娱乐主播如何做好有效维护？记住这三个关键点',
  'article-sing': '语音厅点唱环节怎么做？',
  'article-survive': '语音厅主播生存实话：做语音主播，千万别太正经',
  'article-topics': '语音厅主播到底应该聊什么？',
  'article-silent': '语音厅-如何留住沉默玩家',
}

const AGE_TITLE = TITLES['article-age']

function Quote({ children }: { children: ReactNode }) {
  return <blockquote className="rec-quote">{children}</blockquote>
}

function Line({ who, children }: { who: string; children: ReactNode }) {
  return (
    <p className="rec-quote-line">
      <span className="rec-quote-who">{who}</span>
      <span>{children}</span>
    </p>
  )
}

function Dialogue({ children }: { children: ReactNode }) {
  return <div className="rec-dialogue">{children}</div>
}

function DLine({ who, children }: { who: string; children: ReactNode }) {
  return (
    <p className="rec-dialogue-line">
      <span className="rec-dialogue-who">{who}</span>
      <span>{children}</span>
    </p>
  )
}


function AgeArticle() {
  return (
    <article className="rec-article">
      <p className="rec-kicker">小年轻 / 中年 / 中老年 · 维护策略</p>
      <h1>{AGE_TITLE}</h1>

      <section>
        <p>
          很多主播维护用户时，会犯同一个错：<strong>一套话术打天下</strong>。
          对 22 岁的小年轻讲「你辛苦了、早点休息」，对方觉得你像老妈；
          对 48 岁的中年大哥玩「你是不是想我了」的拉扯，对方觉得你轻浮；
          对中老年用户撒娇卖萌，轻则尬，重则被当成不尊重。
        </p>
        <p>
          年龄不是标签，是<strong>心理节奏、表达习惯、付费动机</strong>的快捷入口。
          同一句「想你了」，在不同年龄段里，含义完全不一样。
        </p>
      </section>

      <section>
        <h2>一、小年轻：好玩、被看见、有输赢</h2>
        <p>
          大概 18–28 岁。他们不是来找「人生导师」的，是来找<strong>刺激、陪伴、被选中</strong>的。
          怕无聊，怕被当提款机，也怕你秒回到像客服。
        </p>

        <h3>心理</h3>
        <ul>
          <li>要赢：排名、挑战、被你点名，比「你真好」更有感觉。</li>
          <li>要被看见：记住他的游戏 ID、今晚输的那把、他随口提的梗。</li>
          <li>要平等：别端着，也别跪着。像同龄损友，比像粉丝运营更有效。</li>
          <li>怕沉：话题超过三句还在「今天吃了吗」，他已经滑走了。</li>
        </ul>

        <h3>拉扯</h3>
        <p>
          小年轻吃「若即若离」。回得太快，像你很闲；回得太慢，他又去下一家。
          原则是：<strong>接住情绪，不立刻把关系坐实</strong>。让他觉得再靠近一点就能赢，但还没完全赢。
        </p>
        <Quote>
          <Line who="他">你是不是只对我这么好</Line>
          <Line who="你">嗯……目前排行榜上只有你有这个待遇，别得意太早</Line>
        </Quote>
        <Quote>
          <Line who="他">那我是不是你最喜欢的</Line>
          <Line who="你">喜欢谈不上，就是看你比较好玩。你要是今天掉段，我可能当场换人</Line>
        </Quote>
        <p className="rec-note">别承诺唯一，也别冷处理。给一点特权，留一点不确定。</p>

        <h3>幽默</h3>
        <p>
          幽默是小年轻的默认语言。不是讲段子，是<strong>接梗、反将、自嘲</strong>。
          他吐槽工作，你别上价值；他骂游戏，你跟着骂，再顺手把他卷进来。
        </p>
        <Quote>
          <Line who="他">今天被老板骂惨了</Line>
          <Line who="你">那正好，来直播间当老板，骂我两句出气。免费的，限时三分钟</Line>
        </Quote>
        <Quote>
          <Line who="他">这把又送</Line>
          <Line who="你">你这不是送，这是给对面做慈善。要不要我直播间给你开个「今日最惨」专场</Line>
        </Quote>

        <h3>特殊感</h3>
        <ul>
          <li>专属称呼：别所有人都叫「哥」。用他 ID 里的字、他提过的外号。</li>
          <li>记忆点：上次他点的歌、他讨厌的主播类型、他今晚输给谁。</li>
          <li>小特权：点名互动、优先连麦、只给他看的「节目效果」。</li>
        </ul>
        <Quote>
          <Line who="你">北巷来了？昨天那把你说要上分，今天段位我先帮你瞒着观众</Line>
        </Quote>

        <h3>礼物引导</h3>
        <p>
          小年轻反感「大哥大气」。他们更能接受<strong>游戏化、挑战、场面</strong>。
          把礼物变成一次「你能不能做到」，而不是一次乞讨。
        </p>
        <Quote>
          <Line who="你">你刚才说能带飞，那这个特效你敢不敢点一下，点了我就当众承认你是教练</Line>
        </Quote>
        <Quote>
          <Line who="你">别的我不要。你要是真觉得今晚这把我播得还行，就用你的方式投票，输了你别说话</Line>
        </Quote>
        <p className="rec-note">引导要轻、要短、要给台阶。逼一次，可能永远不来。</p>
      </section>

      <section>
        <h2>二、中年用户：被理解，比被撩更值钱</h2>
        <p>
          大概 30–50 岁。很多人白天要扛事，晚上才有一块「属于自己」的屏幕。
          他们不是来玩梗的，是来找<strong>稳、懂、不添乱</strong>的人。
        </p>

        <h3>背景</h3>
        <ul>
          <li>时间碎：可能九点还在开会，也可能孩子刚睡。</li>
          <li>现实压得紧：业绩、家庭、身体、面子，同时在线。</li>
          <li>付费更克制，但一旦认定你，稳定度往往高于小年轻。</li>
        </ul>

        <h3>情感状态分型</h3>
        <ul>
          <li>
            <strong>已婚、想透口气：</strong>要陪伴，不要越界。少问家里细节，多接住「今天好累」。
          </li>
          <li>
            <strong>离异 / 分居：</strong>要被当成人，不要被当项目。别急着补位「另一半」。
          </li>
          <li>
            <strong>单身事业型：</strong>要被欣赏能力，不要被当成提款机。夸要具体，落到他做成的事。
          </li>
          <li>
            <strong>情绪低谷型：</strong>先听完，再给出口。别一上来鸡汤，也别一上来要礼物。
          </li>
        </ul>

        <h3>聊天风格</h3>
        <p>
          稳一点，短一点，把话听完。少用「宝」「想你了」开场。
          更合适的是：<strong>记得他上次说到哪，再往前走半步</strong>。
        </p>
        <Quote>
          <Line who="你">昨天那个方案后来过了没？过了你也别熬太晚，过了也得睡觉</Line>
        </Quote>
        <Quote>
          <Line who="他">今天不想说话</Line>
          <Line who="你">那不说。我播着，你挂着就行。想接一句再接</Line>
        </Quote>

        <h3>共同话题</h3>
        <ul>
          <li>工作节奏、通勤、城市天气——具体，不查户口。</li>
          <li>兴趣：车、球、酒、老歌、出差城市的馆子。</li>
          <li>健康和作息：关心到「你今天吃饭没」，不要上升到人生指导。</li>
          <li>他主动提家庭，再轻轻接；他不提，你不要挖。</li>
        </ul>

        <h3>安慰公式</h3>
        <p>中年用户最怕两件事：被说教，和被轻飘飘地「没事的」。</p>
        <p>
          可用四步：<strong>接住情绪 → 认可难处 → 缩小问题 → 给一个小出口</strong>。
        </p>
        <Quote>
          <Line who="他">项目黄了，一整年白干</Line>
          <Line who="你">这不是矫情，确实伤。先把今晚过完。你要是还想骂，我听着；不想讲，我就当背景音</Line>
        </Quote>
        <Quote>
          <Line who="他">家里又吵了一架</Line>
          <Line who="你">你愿意说我就听，不愿意我也不追问。你人已经够累了，这儿不用再表演坚强</Line>
        </Quote>
        <p className="rec-note">安慰之后，不要立刻接「那你来给我刷一个解解压」。出口是休息，不是账单。</p>
      </section>

      <section>
        <h2>三、中老年用户：尊重先于亲密</h2>
        <p>
          大约 50 岁以上，跨度很大。有人很潮，有人只是想找个说话的人。
          共同底线是：<strong>尊重、清晰、不装嫩、不过度暧昧</strong>。
        </p>

        <h3>尊重</h3>
        <ul>
          <li>称呼稳妥：老师、叔、阿姨、姓+哥，比「宝宝」安全。</li>
          <li>语速慢一点，字写完整一点，少堆表情包和缩写。</li>
          <li>他讲过去的事，当故事听，不要打断成「现在都不是这样了」。</li>
        </ul>

        <h3>不过度暧昧</h3>
        <p>
          中老年用户对「男女」更敏感。你觉得是节目效果，他可能当真，家里人也可能看到。
          亲密感用<strong>被重视、被请教、被记得</strong>来给，不用身体暗示和恋爱剧本。
        </p>
        <Quote>
          <Line who="他">你是不是就想让我花钱</Line>
          <Line who="你">礼物随你。我更在意你还愿不愿意来听我说两句。不想花，挂着听也欢迎</Line>
        </Quote>

        <h3>试探</h3>
        <p>
          先试他对直播、礼物、私聊的接受度。有人把刷礼物当捧场，有人把私聊当交朋友，
          有人只是来听歌。<strong>他给什么信号，你就走多远</strong>，不要提前升级关系。
        </p>
        <Quote>
          <Line who="你">您要是累了就先歇，我把今天这几首唱完。想点歌直接报曲名就行</Line>
        </Quote>

        <h3>请教</h3>
        <p>
          这是中老年维护里最稳的一招：<strong>让他教你</strong>。
          他有经验、有阅历，被年轻人认真请教，比被叫「金主」舒服得多。
        </p>
        <Quote>
          <Line who="你">您上次说出差那城市，火车站出来该往哪边走？我下月可能路过，怕走错</Line>
        </Quote>
        <Quote>
          <Line who="你">这首老歌我总唱不好气口，您听着哪个字该换气，回头教我一下</Line>
        </Quote>

        <h3>话题</h3>
        <ul>
          <li>家乡、天气、出行、老歌、戏曲、历史八卦。</li>
          <li>子女可以听，不要评价他怎么教孩子。</li>
          <li>健康只关心到「最近腿还疼吗」，不推销、不恐吓。</li>
          <li>少用网络热梗，除非他自己先用。</li>
        </ul>

        <h3>示弱有原则</h3>
        <p>
          可以示弱：嗓子不舒服、今天状态一般、这首歌还没练熟。
          不要卖惨：房租交不起、家人住院、求他救场。
          <strong>示弱是让他有参与感，不是把生活压力转交给他。</strong>
        </p>
        <Quote>
          <Line who="你">这首高音我还不太稳，您要是听着哪句掉了，帮我记一下，我下回改</Line>
        </Quote>
        <p className="rec-note">他愿意支持，是因为被需要且被尊重，不是因为你更惨。</p>
      </section>

      <section>
        <h2>四、核心区别总结</h2>
        <div className="rec-table-wrap">
          <table className="rec-table">
            <thead>
              <tr>
                <th> </th>
                <th>小年轻</th>
                <th>中年</th>
                <th>中老年</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>要什么</td>
                <td>好玩、赢、被点名</td>
                <td>被理解、被省心</td>
                <td>被尊重、被记得</td>
              </tr>
              <tr>
                <td>怕什么</td>
                <td>无聊、被当工具</td>
                <td>说教、越界、添乱</td>
                <td>轻浮、被骗、难为情</td>
              </tr>
              <tr>
                <td>语气</td>
                <td>损友、接梗、留一点刺</td>
                <td>稳、短、记得上下文</td>
                <td>清晰、慢、请教式</td>
              </tr>
              <tr>
                <td>礼物怎么提</td>
                <td>挑战、场面、投票</td>
                <td>感谢具体付出，不绑架</td>
                <td>随心，先给台阶</td>
              </tr>
              <tr>
                <td>关系边界</td>
                <td>可拉扯，不承诺唯一</td>
                <td>可亲近，不拆现实</td>
                <td>可热络，不演恋爱</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>五、最怕用错方式</h2>
        <ul>
          <li>
            <strong>对小年轻端着：</strong>「您辛苦了，注意身体」——他会觉得你在敷衍长辈。
          </li>
          <li>
            <strong>对中年玩拉扯：</strong>「你是不是吃醋了」——他可能直接沉默，或者觉得你不稳重。
          </li>
          <li>
            <strong>对中老年过度暧昧：</strong>语音撒娇、深夜「想你」——轻则尴尬，重则家庭矛盾。
          </li>
          <li>
            <strong>一套话术群发：</strong>记错名字、记错年龄段，比不维护更伤。
          </li>
          <li>
            <strong>情绪低谷时要票：</strong>他来找出口，你递账单，关系会断得很干净。
          </li>
        </ul>
        <Quote>
          <Line who="错">哥哥想我了吗，来给我刷一个嘛</Line>
          <Line who="对 · 年轻">你要是来了就说话，别当潜水冠军</Line>
          <Line who="对 · 中年">看到你在。今天要是累，挂着听也行</Line>
          <Line who="对 · 中老年">您来了。今天想听哪首，我按您的点</Line>
        </Quote>
      </section>

      <section>
        <h2>六、工具辅助</h2>
        <p>
          判断年龄段、关系阶段、对方现在想听什么，靠经验可以，但聊天一多就容易串。
          <strong>心声助聊</strong>可以帮你把「感觉」落成可复制的维护方向。
        </p>
        <ul>
          <li>上传对方<strong>主页截图</strong>，分析大致年龄感、兴趣切口、消费节奏和禁忌。</li>
          <li>上传<strong>聊天截图</strong>，判断现在处在破冰、维护、降温还是越界边缘。</li>
          <li>按年龄段和关系阶段，给出更合适的维护文案，而不是一套万能甜话。</li>
        </ul>
        <p>
          它替代不了你听懂人，但能减少「对错人说错话」。
          回到推荐页，选对应助聊人设，把大哥原话贴进去，就能拿到能发出去的回复。
        </p>
      </section>

      <section>
        <h2>维护不是套路，而是看懂人</h2>
        <p>
          话术可以记，节奏不能抄。小年轻要的是一场好玩的游戏，中年要的是一块不被审判的地方，
          中老年要的是被当作有尊严的人。
        </p>
        <p>
          你看懂他今年几岁不重要，看懂他今晚为什么还愿意回你，才重要。
          维护做到最后，不是更会说话，是<strong>更会看人</strong>。
        </p>
      </section>
    </article>
  )
}


function MaintainArticle() {
  return (
    <article className="rec-article">
      <p className="rec-kicker">看阶段 · 给情绪价值 · 有节奏</p>
      <h1>{TITLES['article-maintain']}</h1>

      <section>
        <p>
          很多主播把「维护」理解成：没事就发消息、报备在干嘛、问问吃了没。
          结果对方已读不回，自己还觉得委屈——我明明很用心。
        </p>
        <p>
          真正的有效维护，不是刷存在感，更不是轰炸。
          <strong>维护 ≠ 群发「在吗」「吃饭了吗」</strong>。这类开场目的感太强，像客服回访，也像在等对方给你台阶开口要东西。
        </p>
        <p>记住三个关键点：先看关系到哪一步，再给情绪价值，最后才谈节奏。</p>
      </section>

      <section>
        <h2>一、先判断关系阶段</h2>
        <p>同一句「想你了」，对刚认识的人和对已消费的人，压强完全不一样。先分清阶段，再决定你说什么。</p>

        <h3>刚认识</h3>
        <p>目标是留下印象，不是立刻拉近。少表白，多有趣、具体。</p>
        <Dialogue>
          <DLine who="差">哥哥在吗？想你了</DLine>
          <DLine who="好">昨晚你点的那首我又练了一遍，高音还是差点。你要是今晚来，帮我听听气口</DLine>
        </Dialogue>

        <h3>聊过几次</h3>
        <p>已经有记忆点了，用「记得你说过的事」续上，比空问候强。</p>
        <Dialogue>
          <DLine who="差">吃饭了吗？在干嘛呀</DLine>
          <DLine who="好">你上次说这周要交方案，过了没？过了也别熬太晚，嗓子比业绩金贵</DLine>
        </Dialogue>

        <h3>已消费 / 有互动</h3>
        <p>可以更亲近一点，但仍要给对方体面，别一开口就像催下一单。</p>
        <Dialogue>
          <DLine who="差">大哥大气，再来一个嘛</DLine>
          <DLine who="好">昨晚那个特效挺亮的。你要是累了就挂着听，想接话随时喊我</DLine>
        </Dialogue>

        <h3>很久没来</h3>
        <p>别质问「怎么不理我」。用轻巧的钩子，让他有理由回来，而不是先认错。</p>
        <Dialogue>
          <DLine who="差">是不是把我忘了？怎么都不回消息</DLine>
          <DLine who="好">厅里新加了个点歌玩法，想到你上次点的风格，怕你错过。有空露个脸就行，不勉强</DLine>
        </Dialogue>
        <p className="rec-note">阶段判断错了，话术再甜也像越界或像讨债。</p>
      </section>

      <section>
        <h2>二、维护不是索取，是提供情绪价值</h2>
        <p>
          对方回你，是因为回你之后感觉更好——被记得、被懂、被逗乐、被省心。
          不是因为你更勤、更可怜。
        </p>
        <Dialogue>
          <DLine who="索取">你都不找我，是不是不喜欢我了</DLine>
          <DLine who="价值">今天播到一半突然想到你上次吐槽的那句歌词，我差点笑场。你要是在，肯定又要损我</DLine>
        </Dialogue>
        <Dialogue>
          <DLine who="索取">想我了就来刷一个呗</DLine>
          <DLine who="价值">你要是今晚心情一般，就挂着听两首。礼物有没有都无所谓，人在就行</DLine>
        </Dialogue>
        <ul>
          <li>提供记忆：提起他的点歌、外号、上次说到哪。</li>
          <li>提供出口：累了可以不说话，委屈可以骂两句，你接得住。</li>
          <li>提供场面：点名、小特权、只给他懂的梗。</li>
        </ul>
        <p className="rec-note">先让他觉得「回你有赚」，再谈互动和礼物，才不拧巴。</p>
      </section>

      <section>
        <h2>三、维护要有节奏</h2>
        <p>勤可以，密不行。节奏比频率重要。</p>
        <ul>
          <li>
            <strong>冷淡不追：</strong>他回得短、慢、敷衍，你就收一收。连续追问会把关系推成任务。
          </li>
          <li>
            <strong>主动顺势：</strong>他提到加班、下雨、球赛，你就顺着接半句，不另开「考试题」。
          </li>
          <li>
            <strong>唱后补一句：</strong>点过歌、连过麦、刷过礼物，事后一句具体的感谢或复盘，比当场跪谢更长效。
          </li>
          <li>
            <strong>久不回别连发：</strong>一条有信息量的消息，胜过三条「在吗」。发完就放下，给他空间。
          </li>
        </ul>
        <Dialogue>
          <DLine who="乱">在吗 / 吃饭了吗 / 怎么不理我 / 是不是生气了</DLine>
          <DLine who="稳">就一条：今晚有你爱听的那版伴奏，来不来都行，我先把位置给你留着</DLine>
        </Dialogue>
      </section>

      <section>
        <h2>为什么用「心声助聊」</h2>
        <p>
          关系阶段、对方意图、有没有踩雷风险，靠感觉能蒙一阵，聊天一多就容易串人、串话。
          <strong>心声助聊</strong>帮你把「感觉」落成可执行的维护方向。
        </p>
        <ul>
          <li>上传对方<strong>主页 / 截图</strong>：看画像、兴趣切口、消费节奏。</li>
          <li>结合聊天记录判断<strong>阶段、意图、风险</strong>：破冰、维护、降温还是越界边缘。</li>
          <li>给出更<strong>自然的维护文案</strong>，而不是一套万能「在吗想你了」。</li>
        </ul>
        <p>它替代不了你听懂人，但能减少对错人、说错话、追太猛。</p>
      </section>

      <section>
        <h2>三个点，收个尾</h2>
        <ol>
          <li>先判断关系阶段，再开口。</li>
          <li>维护是给情绪价值，不是索取回应和礼物。</li>
          <li>有节奏：冷淡不追，顺势主动，唱后补一句，久不回别连发。</li>
        </ol>
        <p>维护做到最后，不是你更会发消息，是对方回你时不觉得累。</p>
      </section>
    </article>
  )
}


function SingArticle() {
  return (
    <article className="rec-article">
      <p className="rec-kicker">铺场 · 六种点歌 · 敢点还想点</p>
      <h1>{TITLES['article-sing']}</h1>

      <section>
        <p>
          点唱环节不是「报歌名 → 唱歌 → 下一首」。
          它是一整场<strong>互动戏</strong>：让游客敢开口、想参与、唱完还想再来一次。
        </p>
        <p>歌是载体，人是主角。你要把「听歌」做成「跟我一起玩」。</p>
      </section>

      <section>
        <h2>一、核心是让游客参与</h2>
        <p>点唱要做成场，至少把这四件事做实：</p>
        <ul>
          <li>让人<strong>敢点</strong>——降低开口成本，不查岗、不尴尬。</li>
          <li>让人<strong>想点</strong>——有钩子、有玩法、有场面。</li>
          <li>让人<strong>点得有面子</strong>——被点名、被接住、被夸具体。</li>
          <li>让人<strong>还想再点</strong>——唱后互动，留尾巴，不草草收场。</li>
        </ul>
      </section>

      <section>
        <h2>二、点唱前先铺场</h2>
        <p>冷场往往不是没人想听歌，是没人知道「现在可以点、怎么点、点了会怎样」。</p>
        <Dialogue>
          <DLine who="差">有没有人点歌啊？没人点我就不唱了哈</DLine>
          <DLine who="好">接下来十分钟点唱时间。不会点也没关系，报个情绪、一个关键词也行。我来猜歌，猜错了你们可以起哄</DLine>
        </Dialogue>
        <p className="rec-note">铺场要说清规则、降低门槛、预告好玩的后果。</p>
      </section>

      <section>
        <h2>三、六种点歌方式 + 话术</h2>
        <h3>1. 按情绪</h3>
        <Dialogue>
          <DLine who="主持">今天什么心情？丧一点、燃一点，还是想被哄？报情绪，我配歌</DLine>
        </Dialogue>
        <h3>2. 按关键词</h3>
        <Dialogue>
          <DLine who="主持">只说一个词也行：雨、前任、加班、夏天。我根据词找歌</DLine>
        </Dialogue>
        <h3>3. 按风格</h3>
        <Dialogue>
          <DLine who="主持">民谣、甜歌、老歌、说唱，选一个赛道，麦上排队唱</DLine>
        </Dialogue>
        <h3>4. 按对象</h3>
        <Dialogue>
          <DLine who="主持">想唱给谁听？自己、朋友，还是厅里某位——报称呼就行，不挖故事</DLine>
        </Dialogue>
        <h3>5. 盲盒</h3>
        <Dialogue>
          <DLine who="主持">扣 1 进盲盒。抽到啥唱啥，抽到尴尬歌全场见证，不许临阵逃脱</DLine>
        </Dialogue>
        <h3>6. 投票</h3>
        <Dialogue>
          <DLine who="主持">两首歌打架：A《…》B《…》。公屏投票，少数服从多数，唱完赢家再点下一首</DLine>
        </Dialogue>
      </section>

      <section>
        <h2>四、接情绪，不挖故事</h2>
        <p>游客丢一句「有点遗憾」，你要接住情绪，不要审户口。</p>
        <Dialogue>
          <DLine who="游客">有点遗憾吧</DLine>
          <DLine who="差">怎么了？跟谁啊？发生什么事了详细说说</DLine>
          <DLine who="好">那今天就唱一首往前走的。你要是不想讲故事，听完这句就行</DLine>
        </Dialogue>
      </section>

      <section>
        <h2>五、唱前铺垫，唱后互动</h2>
        <p>唱前给期待，唱后给反应位。别唱完静音三秒。</p>
        <Dialogue>
          <DLine who="铺垫">这首是「嘴硬心软」专场。唱的时候公屏可以打「嘴硬」或「其实想听」</DLine>
          <DLine who="唱后">刚才打「嘴硬」的那位，要不要再点一首更硬的？还是承认自己其实想听软的</DLine>
        </Dialogue>
      </section>

      <section>
        <h2>六、八麦怎么分工</h2>
        <ul>
          <li><strong>主持麦：</strong>控场、收点、宣布规则、递话筒。</li>
          <li><strong>主唱麦：</strong>接歌、控音质、唱后抛梗。</li>
          <li><strong>助麦 / 副唱：</strong>帮腔、救场、接不会的歌。</li>
          <li><strong>互动麦：</strong>盯公屏、点名新人、复述点歌需求。</li>
          <li><strong>气氛麦：</strong>起哄、接梗、带节奏，不抢主持话权。</li>
          <li>其余麦位：待命补位，避免同时抢话。</li>
        </ul>
        <p className="rec-note">人多不是热闹，分工清楚才热闹。</p>
      </section>

      <section>
        <h2>七、标准七步流程</h2>
        <ol>
          <li>预告点唱时段与玩法。</li>
          <li>降低门槛（情绪 / 关键词也可）。</li>
          <li>确认点歌并复述（防听错）。</li>
          <li>唱前一句铺垫或互动指令。</li>
          <li>演唱，麦上其他人控场不抢。</li>
          <li>唱后点名反馈、玩笑或二选一。</li>
          <li>收下一位或转下个玩法，留尾巴。</li>
        </ol>
      </section>

      <section>
        <h2>八、五个常见坑</h2>
        <ul>
          <li>冷开场：「有人点吗」——没人敢当第一人。</li>
          <li>只认歌名，不认情绪——门槛过高。</li>
          <li>唱完无互动——点了也没被看见。</li>
          <li>追问隐私故事——游客下回不敢开口。</li>
          <li>麦上抢话、同时起哄——听不清规则。</li>
        </ul>
      </section>

      <section>
        <h2>九、六个可直接用的玩法</h2>
        <ul>
          <li>情绪配歌</li>
          <li>关键词猜歌</li>
          <li>盲盒抽歌</li>
          <li>两首歌投票决斗</li>
          <li>对某人唱（不挖故事）</li>
          <li>唱后公屏二选一接龙</li>
        </ul>
      </section>

      <section>
        <h2>十、可复制主持话术</h2>
        <Dialogue>
          <DLine who="1">点唱开始：报歌名、报情绪、报一个词，三种都能点。</DLine>
          <DLine who="2">新来的不用慌，扣个 1 我给你抽盲盒，唱砸了算我的。</DLine>
          <DLine who="3">刚才那位点「加班」，这首给你——听完要是还想骂老板，公屏继续。</DLine>
          <DLine who="4">唱之前先说好：打「嘴硬」还是「想听」，我看着办。</DLine>
          <DLine who="5">这首结束，下一位。排队的报一下，我写板上。</DLine>
          <DLine who="6">今晚点唱不查岗，沉默听也行，想开口随时截胡。</DLine>
        </Dialogue>
      </section>

      <section>
        <h2>结尾就三点</h2>
        <p>点唱环节做成场，最终只看游客会不会：</p>
        <ul>
          <li><strong>敢点</strong></li>
          <li><strong>想点</strong></li>
          <li><strong>还想点</strong></li>
        </ul>
        <p>歌可以换，这三感不能丢。回到推荐页，用<strong>心声助聊</strong>把大哥的点歌原话贴进去，也能快速拿到接话和控场句。</p>
      </section>
    </article>
  )
}


function SurviveArticle() {
  return (
    <article className="rec-article">
      <p className="rec-kicker">放得开 · 勤维护 · 抗压心态</p>
      <h1>{TITLES['article-survive']}</h1>

      <section>
        <p>
          新人常有个误会：语音厅要「得体、端着、少开玩笑」，才显得专业。
          结果厅里死气沉沉，自己也越播越累。
        </p>
        <p>
          实话是：<strong>做语音主播，千万别太正经</strong>。
          正经不是礼貌，是把自己焊死在「播音腔 + 客服腔」里，游客靠近都费劲。
        </p>
      </section>

      <section>
        <h2>一、别太放不开</h2>
        <p>
          放得开不是低俗，是允许自己接梗、自嘲、说人话。
          游客来听的是「真人」，不是「播报员」。
        </p>
        <Dialogue>
          <DLine who="太正经">欢迎各位老板莅临本直播间，感谢支持</DLine>
          <DLine who="人话">来了就说话，别当家具。今天状态一般，但笑话库存还在</DLine>
        </Dialogue>
        <p>先让场子松下来，信任和礼物才会跟着来。</p>
      </section>

      <section>
        <h2>二、勤写作业，勤维护</h2>
        <p>
          放得开不等于靠临场硬撑。厅下要写作业：记点歌、记外号、记谁最近冷了。
          厅上才能「随口」叫得准。
        </p>
        <p>
          没灵感开场时，用<strong>心声助聊</strong>根据主页和聊天截图出开口句——
          比自己干瞪眼「在吗」有效得多。
        </p>
        <ul>
          <li>每天维护名单分流：新认识 / 活跃 / 沉默 / 久不回。</li>
          <li>每条维护带一个具体记忆点。</li>
          <li>开口句可以先让心声助聊起草，你再改成自己的口气。</li>
        </ul>
      </section>

      <section>
        <h2>三、别太玻璃心，别太较真</h2>
        <p>
          公屏会有阴阳、抢麦、对比其他主播。较真一次，场子就僵；
          玻璃心一次，游客学会「一戳你就乱」。
        </p>
        <Dialogue>
          <DLine who="较真">你什么意思啊？有意见可以说清楚</DLine>
          <DLine who="抗造">对比可以，投票也行。输了请你喝麦上快乐水，赢了你教我两招</DLine>
        </Dialogue>
        <p className="rec-note">把刺接成节目效果，比当场翻脸值钱。</p>
      </section>

      <section>
        <h2>四、学会引导价值，不是不好意思</h2>
        <p>
          很多主播不是不会唱，是<strong>不好意思提互动和礼物</strong>。
          引导价值不是乞讨，是给对方一个参与和表达的方式。
        </p>
        <Dialogue>
          <DLine who="扭捏">那个……有空的话……看能不能……支持一下……</DLine>
          <DLine who="清楚">想帮我把这场点唱做热，就用你的方式投票。不方便就挂着听，我也欢迎</DLine>
        </Dialogue>
        <p>话说清楚，台阶留好，体面的人反而更愿意动。</p>
      </section>

      <section>
        <h2>五、练出抗压心态</h2>
        <ul>
          <li>今天没流水 ≠ 你不行；可能只是时段、麦序、话题不对。</li>
          <li>被刷存在感、被对比，先稳场，再私下复盘。</li>
          <li>把「被拒绝」当成常态：不回消息、不点歌、不送礼，都可以。</li>
          <li>抗压不是麻木，是情绪不绑死在一场数据上。</li>
        </ul>
      </section>

      <section>
        <h2>收个尾</h2>
        <p>
          别太正经，不是让你没边界；是让你像个能一起玩的人。
          放得开、勤维护、少玻璃心、敢引导、抗得住冷场——
          语音厅才能从「我在播」变成「他们愿意待」。
        </p>
        <p>
          需要开口和维护文案时，回推荐页打开<strong>心声助聊</strong>，把原话贴进去即可。
        </p>
      </section>
    </article>
  )
}


function TopicsArticle() {
  return (
    <article className="rec-article">
      <p className="rec-kicker">能接住才算好话题</p>
      <h1>{TITLES['article-topics']}</h1>

      <section>
        <p>
          语音厅主播最常见的卡壳不是不会唱，是<strong>不知道聊什么</strong>。
          一安静就慌，一慌就问「在干嘛」「吃了吗」，场子更死。
        </p>
        <p>
          核心标准其实很简单：好话题是让玩家觉得<strong>能接、不尴尬、不是硬逼</strong>。
          能接住，才算好话题。
        </p>
      </section>

      <section>
        <h2>一、聊天一定要和玩家有关系</h2>
        <p>
          自说自话的「今日份感悟」，不如一句跟他当下有关的话。
          话题要落在「他也能接」的点上。
        </p>
        <Dialogue>
          <DLine who="无关">五一假期我准备好好休息，大家也要注意身体哦</DLine>
          <DLine who="有关">五一你们是出逃还是原地躺平？出逃的报个目的地，躺平的我给你们播背景音</DLine>
        </Dialogue>
        <p className="rec-note">有关 ≠ 查户口；是给他一个容易回的口。</p>
      </section>

      <section>
        <h2>二、可以聊生活，但不要聊隐私</h2>
        <p>天气、通勤、晚饭、游戏段位——可以。工资、住址、感情细节、家事——先别。</p>
        <Dialogue>
          <DLine who="越界">你结婚了吗？对象知道你来听直播吗？</DLine>
          <DLine who="刚好">今天通勤多久？路上要是堵，就当免费听我唱歌</DLine>
        </Dialogue>
      </section>

      <section>
        <h2>三、可以聊情绪，但不要卖惨</h2>
        <p>接住「累」「烦」「丧」可以；把自己的房租、委屈摊成催礼物剧本，不行。</p>
        <Dialogue>
          <DLine who="卖惨">我今天真的好难受，你们不支持我我都不知道怎么办了</DLine>
          <DLine who="接情绪">听到你说烦。那今晚不聊正事，听两首解解压。想骂就公屏骂，我撑场</DLine>
        </Dialogue>
      </section>

      <section>
        <h2>四、可以聊选择题，但不要问大空话</h2>
        <p>「你们觉得人生的意义是什么」没人接。「A 还是 B」人人能扣。</p>
        <Dialogue>
          <DLine who="空">大家今晚心情怎么样呢？来聊聊吧</DLine>
          <DLine who="选择题">今晚二选一：想听甜的扣 1，想听燃的扣 2。少数服从多数</DLine>
        </Dialogue>
      </section>

      <section>
        <h2>五、可以轻松吐槽，但不要攻击别人</h2>
        <p>吐槽加班、游戏匹配、自己唱砸——可以。点名嘲讽游客、别的主播、外人——别。</p>
        <Dialogue>
          <DLine who="攻击">就那个谁，又来白嫖，真没意思</DLine>
          <DLine who="轻吐槽">我这高音今天自己跟自己打架。你们要是听着掉了，公屏扣「掉了」，我现场改</DLine>
        </Dialogue>
      </section>

      <section>
        <h2>六、关键是让玩家没有压力</h2>
        <ul>
          <li>不强迫发言：听着也行。</li>
          <li>不连环追问：回一句就够。</li>
          <li>不把沉默当冒犯。</li>
          <li>给简单出口：扣数字、报关键词、选 A/B。</li>
        </ul>
        <Dialogue>
          <DLine who="主持">不想说话的扣个 0，我当你们在。想接话的随时截胡</DLine>
        </Dialogue>
      </section>

      <section>
        <h2>收个尾</h2>
        <p>记住四句：</p>
        <ul>
          <li>可以聊生活，但不要聊隐私；</li>
          <li>可以聊情绪，但不要卖惨；</li>
          <li>可以聊选择题，但不要问大空话；</li>
          <li>可以轻松吐槽，但不要攻击别人。</li>
        </ul>
        <p>
          玩家留下来，往往不是因为你话题多高端，
          而是因为<strong>话题跟他有关，而且他接得住</strong>。
        </p>
        <p>
          卡话题时，把场景和原话丢给<strong>心声助聊</strong>，先拿几句能接住的开口再开场。
        </p>
      </section>
    </article>
  )
}


function SilentArticle() {
  return (
    <article className="rec-article">
      <p className="rec-kicker">沉默不等于没兴趣</p>
      <h1>{TITLES['article-silent']}</h1>

      <section>
        <p>
          进厅不说话，很多主播第一反应是：「是不是不喜欢」「是不是来白嫖」。
          其实更常见的情况是：<strong>他在观察</strong>。
        </p>
        <p>
          沉默 ≠ 没兴趣。他在看这厅安不安全、笑点正不正、会不会被点名尴尬。
          你一上来查岗，观察期直接结束——他走了。
        </p>
      </section>

      <section>
        <h2>新人别急着赶人开口</h2>
        <p>最伤的两句往往是好意：</p>
        <Dialogue>
          <DLine who="别说">怎么不说话啊</DLine>
          <DLine who="别说">别潜水呀，来跟大家打个招呼</DLine>
        </Dialogue>
        <p>
          对沉默玩家，这等于当众点名。他要的是低压力待着，不是立刻表演热情。
        </p>
      </section>

      <section>
        <h2>先给安全感</h2>
        <Dialogue>
          <DLine who="主持">刚进来的朋友不用急着说话，先听着就行，我们这边不查岗。</DLine>
        </Dialogue>
        <p>
          一句「允许沉默」，比十句「快说话」更能让人留下来。
          安全感到位，他才可能从听 → 打字 → 点歌。
        </p>
      </section>

      <section>
        <h2>沉默玩家的常见升级路径</h2>
        <ol>
          <li><strong>安静听：</strong>观察气氛和边界。</li>
          <li><strong>打字：</strong>公屏短回复、扣数字、点表情。</li>
          <li><strong>点歌 / 轻互动：</strong>开始露出喜好。</li>
          <li><strong>送礼 / 上麦：</strong>确认这里值得投入。</li>
          <li><strong>成常客：</strong>因为第一次沉默时没被赶、没被羞。</li>
        </ol>
        <p className="rec-note">别指望跳步。你逼他从 1 直接到 4，他会退回 0——离开。</p>
      </section>

      <section>
        <h2>场子可以热闹，也可以安心安静</h2>
        <p>
          好厅不是全程高音量。
          <strong>想热闹可以热闹，想安静也能安心待</strong>——这两种人要同时伺候。
        </p>
        <ul>
          <li>互动时：把选择题丢给愿意扣的人。</li>
          <li>对沉默者：不点名、不连环问、偶尔给「听着就行」的许可。</li>
          <li>他若主动打字，再轻轻接，不夸张起哄。</li>
        </ul>
        <Dialogue>
          <DLine who="好">刚才扣 1 的那位我看到了。其他人听着也行，不强制打字</DLine>
        </Dialogue>
      </section>

      <section>
        <h2>收个尾</h2>
        <p>
          <strong>安静玩家不是没有价值。</strong>
          很多长期玩家，都是从第一次沉默停留开始的——
          那一次，你没有赶他开口，也没有让他难堪。
        </p>
        <p>
          下次再看到沉默名单，先给安全感，再等他升级。
          需要维护开口时，用<strong>心声助聊</strong>按阶段出一句不查岗的续聊即可。
        </p>
      </section>
    </article>
  )
}


export function RecArticlePage({
  id,
  onBack,
}: {
  id: RecArticleId
  onBack: () => void
}) {
  const title = TITLES[id]
  let body: ReactNode
  switch (id) {
    case 'article-maintain':
      body = <MaintainArticle />
      break
    case 'article-sing':
      body = <SingArticle />
      break
    case 'article-survive':
      body = <SurviveArticle />
      break
    case 'article-topics':
      body = <TopicsArticle />
      break
    case 'article-silent':
      body = <SilentArticle />
      break
    case 'article-age':
    default:
      body = <AgeArticle />
      break
  }
  return (
    <div className="pane">
      <div className="nav">
        <button type="button" aria-label="返回" onClick={onBack}>
          {'<'}
        </button>
        <div className="title rec-nav-title">{title}</div>
        <span className="nav-side" />
      </div>
      <div className="rec-article-scroll">{body}</div>
    </div>
  )
}
