import { useEffect, useState, type ReactNode } from 'react'
import { approveAdminUser, fetchAdminUsers, rejectAdminUser, removeAdminUser, type AdminUser } from './api'

const DOWNLOAD_URL = 'https://vvxqiu.com/#/'
const STREAMER_ENTRY_URL = 'https://f.kdocs.cn/g/Yoh6yviw/'
const SALARY_QUERY_URL = 'https://www.kdocs.cn/etapps/query/q/regrCYpW'

const PRANK_PRICE_ROWS: {
  diamonds: string
  rmb: string
  content: string
  range: string
}[] = [
  { diamonds: '100', rmb: '1', content: '一句祝福', range: '100-5200' },
  { diamonds: '200', rmb: '2', content: '试音', range: '100-5200' },
  { diamonds: '500', rmb: '5', content: '学猫叫', range: '100-5200' },
  { diamonds: '1000', rmb: '10', content: '夹子试音', range: '100-5200' },
  { diamonds: '2000', rmb: '20', content: '介绍自己', range: '100-5200' },
  { diamonds: '3000', rmb: '30', content: '高级试音', range: '100-5200' },
  { diamonds: '5000', rmb: '50', content: '唱一首歌', range: '1010-10000' },
  { diamonds: '5200', rmb: '52', content: '对大头表白', range: '1010-10000' },
  { diamonds: '10000', rmb: '100', content: '撒娇8连', range: '1010-10000' },
  { diamonds: '20000', rmb: '200', content: '夸用户1分钟', range: '3010-30000' },
  { diamonds: '30000', rmb: '300', content: '1分钟花式表白', range: '3010-30000' },
  { diamonds: '50000', rmb: '500', content: '唱6首歌', range: '10100-100000' },
  { diamonds: '52000', rmb: '520', content: '电台20分钟', range: '10100-100000' },
  { diamonds: '100000', rmb: '1000', content: '唱10首歌', range: '10100-100000' },
  { diamonds: '131400', rmb: '1314', content: '10分钟花式表白', range: '30100-334400' },
  { diamonds: '200000', rmb: '2000', content: '冠2首歌+冠哥卡', range: '30100-334400' },
  { diamonds: '233300', rmb: '2333', content: '冠2首歌+冠哥卡', range: '30100-334400' },
]

function Mark({ children }: { children: string }) {
  return <strong className="mine-mark">{children}</strong>
}

function StepCard({
  n,
  children,
  warn,
}: {
  n: number
  children: ReactNode
  warn?: ReactNode
}) {
  return (
    <div className="mine-step">
      <div className="mine-step-num" aria-hidden="true">
        {n}
      </div>
      <div className="mine-step-body">
        <div className="mine-step-text">{children}</div>
        {warn ? <div className="mine-warn">{warn}</div> : null}
      </div>
    </div>
  )
}

function OnboardApplyPage({ onBack }: { onBack: () => void }) {
  const [copied, setCopied] = useState(false)

  function copyUrl() {
    const w = navigator.clipboard
    const done = () => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    }
    if (w && w.writeText) {
      w.writeText(DOWNLOAD_URL).then(done, done)
    } else {
      done()
    }
  }

  return (
    <div className="pane">
      <div className="nav">
        <button type="button" aria-label="back" onClick={onBack}>
          {'<'}
        </button>
        <div className="title">入职流程</div>
        <span className="nav-side" />
      </div>
      <div className="mine-scroll mine-doc">
        <section className="mine-sec">
          <h2 className="mine-sec-title">1. 下载链接</h2>
          <div className="mine-card">
            <div className="mine-card-label">官网链接</div>
            <a
              className="mine-link"
              href={DOWNLOAD_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              {DOWNLOAD_URL}
            </a>
            <button type="button" className="mine-copy" onClick={copyUrl}>
              {copied ? '已复制' : '复制链接'}
            </button>
          </div>
        </section>

        <section className="mine-sec">
          <h2 className="mine-sec-title">2. 账号注册</h2>
          <div className="mine-card mine-card-plain">
            完成注册并登录账号
          </div>
        </section>

        <section className="mine-sec">
          <h2 className="mine-sec-title">3. 签约入职</h2>
          <div className="mine-steps">
            <StepCard n={1}>
              点击「我的」（最下方导航）
            </StepCard>
            <StepCard n={2}>
              右上角两条杠（≡） → 进入设置
            </StepCard>
            <StepCard n={3}>
              点击「设置」 → 实名认证（必须先做，否则后面签约可能卡住）
            </StepCard>
            <StepCard n={4}>按提示填写真实姓名、身份证</StepCard>
            <StepCard n={5}>返回上一级界面</StepCard>
            <StepCard
              n={6}
              warn="如果找不到，把 ID XXXXXX 发到群里让管理开通权限"
            >
              点击「主播中心」找到「签约家族」
            </StepCard>
            <StepCard n={7}>
              搜索家族：输入 <Mark>云梦传媒</Mark>
            </StepCard>
            <StepCard n={8}>申请加入</StepCard>
            <StepCard n={9}>
              签约时长：选择 <Mark>1年</Mark>
            </StepCard>
            <StepCard n={10}>
              结算方式：选择 <Mark>委托家族结算</Mark>
            </StepCard>
          </div>

          <div className="mine-extra">
            <div className="mine-extra-row">
              <span className="mine-extra-k">所属厅</span>
              <span>咨询管理</span>
            </div>
            <div className="mine-extra-row">提交后等待审核（通常很快）</div>
            <div className="mine-extra-row">完成后把 ID 发给管理确认</div>
          </div>
        </section>
      </div>
    </div>
  )
}


function HowToEnterHallPage({ onBack }: { onBack: () => void }) {
  return (
    <div className="pane">
      <div className="nav">
        <button type="button" aria-label="back" onClick={onBack}>
          {'<'}
        </button>
        <div className="title">如何进厅</div>
        <span className="nav-side" />
      </div>
      <div className="mine-scroll mine-doc">
        <section className="mine-sec">
          <h2 className="mine-sec-title">如何进入工会厅</h2>
          <div className="mine-steps">
            <StepCard n={1}>点击下方导航 「我的」</StepCard>
            <StepCard n={2}>进入资料（往下滑动）</StepCard>
            <StepCard n={3}>
              找到 <Mark>星月传媒</Mark>
            </StepCard>
            <StepCard n={4}>点击进入后，往下滑找到厅工会厅选择自己的所属厅</StepCard>
          </div>
        </section>
      </div>
    </div>
  )
}

function PrankSettingsPage({ onBack }: { onBack: () => void }) {
  return (
    <div className="pane">
      <div className="nav">
        <button type="button" aria-label="back" onClick={onBack}>
          {'<'}
        </button>
        <div className="title">整蛊设置</div>
        <span className="nav-side" />
      </div>
      <div className="mine-scroll mine-doc">
        <section className="mine-sec">
          <h2 className="mine-sec-title">设置整蛊</h2>
          <div className="mine-steps">
            <StepCard n={1}>
              点击屏幕下方 <Mark>骷髅头</Mark> 图标
            </StepCard>
            <StepCard n={2}>
              点击 <Mark>精品整蛊</Mark>
            </StepCard>
            <StepCard n={3}>
              点击右上角 <Mark>我的菜单</Mark>
            </StepCard>
            <StepCard n={4}>
              点击 <Mark>编辑</Mark>
            </StepCard>
            <StepCard n={5}>
              点击 <Mark>添加</Mark>
            </StepCard>
            <StepCard n={6}>
              上方选择 <Mark>价格区间</Mark>
            </StepCard>
            <StepCard n={7}>
              中间选择 <Mark>整蛊内容</Mark>
            </StepCard>
            <StepCard n={8}>
              选择内容后，在下方 <Mark>自定义金额</Mark>（选自己能做的整蛊）
            </StepCard>
            <StepCard n={9}>保存即可</StepCard>
          </div>
          <div className="mine-extra">
            <div className="mine-warn">记得给价格排序方便用户下单</div>
            <div className="mine-warn">整蛊一定要及时做，超过时间不完成，会被冻结流水。</div>
          </div>
        </section>

        <section className="mine-sec">
          <h2 className="mine-sec-title">常用整蛊参考</h2>
          <div className="mine-table-wrap">
            <table className="mine-table">
              <thead>
                <tr>
                  <th>常用价格(钻)</th>
                  <th>对应RMB</th>
                  <th>常用内容</th>
                  <th>价格区间</th>
                </tr>
              </thead>
              <tbody>
                {PRANK_PRICE_ROWS.map((row) => (
                  <tr key={`${row.diamonds}-${row.content}`}>
                    <td>{row.diamonds}</td>
                    <td>{row.rmb}</td>
                    <td>{row.content}</td>
                    <td>{row.range}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}


function GrowthGuidePage({ onBack }: { onBack: () => void }) {
  return (
    <div className="pane">
      <div className="nav">
        <button type="button" aria-label="back" onClick={onBack}>
          {'<'}
        </button>
        <div className="title">
          大哥养成
          <small>陪玩成长全阶段指南</small>
        </div>
        <span className="nav-side" />
      </div>
      <div className="mine-scroll mine-doc">
        <section className="mine-sec">
          <div className="mine-callout">
            <div className="mine-callout-label">注意</div>
            <p>
              尽量放松，找不到话题可先暂时什么都不讲，放着熟悉的歌曲跟着哼几句，第一次直播1-2小时为宜，直播前准备好润喉片、蜂蜜水，谨防排档说话过多导致嗓子不适应。
            </p>
          </div>
        </section>

        <section className="mine-sec">
          <h2 className="mine-sec-title">👶 1-3天：新手适应期</h2>
          <div className="mine-card mine-stage">
            <ul className="mine-bullets">
              <li>熟悉环境，和家族陪玩搞好关系，找到最放松的排档状态</li>
              <li>控制排档时间，每天分2-3场，每场1-2小时为宜，避免嗓子疲劳</li>
            </ul>
            <div className="mine-tip">
              <div className="mine-tip-label">嗓子疼偏方</div>
              <p>生鸡蛋+开水冲服，可加蜂蜜或黄酒调味（亲测有效！）</p>
            </div>
          </div>
        </section>

        <section className="mine-sec">
          <h2 className="mine-sec-title">📅 4-7天：习惯养成期</h2>
          <div className="mine-card mine-stage">
            <ul className="mine-bullets">
              <li>练习感谢话术，对玩家送礼物要及时回应</li>
              <li>固定排档时间，多聊热门话题，提升厅内氛围</li>
            </ul>
          </div>
        </section>

        <section className="mine-sec">
          <h2 className="mine-sec-title">🚀 7-15天：老板发展期</h2>
          <div className="mine-card mine-stage">
            <ul className="mine-bullets">
              <li>挖掘个人特色，用独特风格活跃厅内氛围</li>
              <li>学习新歌、尝试电音，多和老板发语音/图片维护关系</li>
            </ul>
          </div>
        </section>

        <section className="mine-sec">
          <h2 className="mine-sec-title">🧘 16-40天：心态调整期</h2>
          <div className="mine-card mine-stage">
            <ul className="mine-bullets">
              <li>学习大陪玩的朋友圈运营技巧，分析老板性格找准要礼物时机</li>
              <li>老板给别人刷礼物时保持平常心，学会反思自身不足，不抱怨不浮躁</li>
              <li>
                学会反思：排档老板不多、礼物少的原因（唱歌/不够活跃/老板认识新陪玩等），从自身找原因；老板离开不责怪，平常心重头再来
              </li>
            </ul>
          </div>
        </section>

        <section className="mine-sec">
          <h2 className="mine-sec-title">🎯 41-100天：能力成长期</h2>
          <div className="mine-card mine-stage">
            <ul className="mine-bullets">
              <li>给长期支持的老板送小礼物（特产、手工品），巩固关系防流失</li>
              <li>用撒娇开玩笑方式向忠实老板要礼物，保持朋友心态，不生硬索取</li>
            </ul>
          </div>
        </section>

        <section className="mine-sec">
          <h2 className="mine-sec-title">🏆 100天之后：稳定成型期</h2>
          <div className="mine-card mine-stage">
            <ul className="mine-bullets">
              <li>恭喜坚持3个月；已积累经验与稳定老板资源</li>
              <li>学习新才艺（乐器、舞蹈），度过视觉疲劳期</li>
              <li>保持良好排档习惯，持续提升，成为合格陪玩</li>
            </ul>
          </div>
        </section>

        <section className="mine-sec">
          <h2 className="mine-sec-title">⚠️ 陪玩禁忌事项</h2>
          <div className="mine-warn mine-warn-list">
            <ul className="mine-bullets">
              <li>外出旅游不要告诉玩家真实目的，避免心理落差</li>
              <li>选歌以欢快、DJ、热门为主，避免伤感沉闷</li>
              <li>得意期不超过3个月，中小老板寿命通常15天-7个月，低谷期及时反省</li>
              <li>心情不佳时避免排档，不在厅内传消极情绪</li>
              <li>尽量说标准普通话，纠正地方口音</li>
              <li>被老板辱骂不要回骂，可请管理禁言或踢走</li>
              <li>新人避开大陪玩排档时段，推荐早晨6-9点或凌晨12-2点</li>
              <li>平常心对待离开的玩家，不抱怨其他陪玩收获</li>
              <li>最好固定1-2个平台，精力有限难兼顾多平台</li>
              <li>不要向不熟悉的玩家直接要礼物，先做朋友再谈支持</li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  )
}


function Dialogue({ lines }: { lines: { who: string; text: string }[] }) {
  return (
    <div className="mine-dialogue">
      {lines.map((line, i) => (
        <div key={i} className="mine-dialogue-line">
          <span className="mine-dialogue-who">{line.who}</span>
          <span className="mine-dialogue-text">{line.text}</span>
        </div>
      ))}
    </div>
  )
}

const STRATEGY_MOVES: { name: string; tip: string }[] = [
  { name: '关心杀', tip: '日常问候、嘘寒问暖，简单关心就能温暖用户、建立情感连接。' },
  { name: '钓鱼杀', tip: '给常刷礼物的用户回赠小礼物，建立捆绑关系，让用户持续为你付出。' },
  { name: '毅力杀', tip: '持续互动、偶尔调侃，用户总会被你的坚持打动，产生消费行为。' },
  { name: '悲情杀', tip: '装可爱、可怜、心情不好、生病，利用同情心获取用户礼物和支持。' },
  { name: '团队杀', tip: '套路一下小姐妹：团结合作，轮流一起上。' },
  { name: '机智杀', tip: '了解用户爱好和嗜好，对症下药，精准获取关注和兴趣。' },
  { name: '陪伴杀', tip: '表面不粘人，长期陪伴让用户养成习惯，离不开你。' },
  { name: '性欲杀', tip: '最直接：直击要害，跟他磕炮，找机会磕他。' },
  { name: '真心杀', tip: '用感情套路用户，培养依赖感和责任感，让用户心甘情愿为你花钱。' },
  { name: '绝杀', tip: '张嘴要礼物，不要直接开骂——看准时机直接开口。' },
]

function CommsGuidePage({ onBack }: { onBack: () => void }) {
  return (
    <div className="pane">
      <div className="nav">
        <button type="button" aria-label="back" onClick={onBack}>
          {'<'}
        </button>
        <div className="title">
          沟通技巧
          <small>云梦传媒陪玩话术指南</small>
        </div>
        <span className="nav-side" />
      </div>
      <div className="mine-scroll mine-doc">
        <section className="mine-sec">
          <h2 className="mine-sec-title">沟通原则</h2>
          <div className="mine-card mine-stage">
            <ul className="mine-bullets">
              <li>
                <Mark>避免过度客套</Mark>
                ：真诚≠过分礼貌；过多「请」「对不起」会产生距离感，显得不够坦诚。
              </li>
              <li>
                <Mark>直率坦诚</Mark>
                ：多数时候直抒胸臆更能建信任、避免虚伪感；视老板情况决定直率或委婉。
              </li>
            </ul>
          </div>
        </section>

        <section className="mine-sec">
          <h2 className="mine-sec-title">🎭 沟通策略组合拳</h2>
          <div className="mine-card mine-card-plain" style={{ marginBottom: 10 }}>
            表达方式视对象、目的、情境而定。有时要直率，有时要委婉——直时不直、该委婉时不委婉，同样达不到效果。
          </div>
          <div className="mine-strategy-grid">
            {STRATEGY_MOVES.map((m) => (
              <div key={m.name} className="mine-strategy">
                <div className="mine-strategy-name">{m.name}</div>
                <div className="mine-strategy-tip">{m.tip}</div>
              </div>
            ))}
          </div>
          <div className="mine-callout" style={{ marginTop: 12 }}>
            <div className="mine-callout-label">收尾</div>
            <p>
              看看你们适合哪种。面对不同的人，就用不同的方法！加油宝贝们，等你们发财了别忘我啊。
            </p>
          </div>
        </section>

        <section className="mine-sec">
          <h2 className="mine-sec-title">🎣 高效获客实战指南</h2>
          <div className="mine-steps">
            <StepCard n={1}>
              <Mark>利益绑定</Mark>
              ：给有实力的用户发微信红包，用10%的投入换长期稳定回报。
            </StepCard>
            <StepCard n={2}>
              <Mark>情感渗透</Mark>
              ：日常问候、关心、适当示弱，走进用户生活，建立情感依赖。
            </StepCard>
            <StepCard n={3}>
              <Mark>关系运营</Mark>
              ：下档后用心维护用户关系；上档只是成果展示，努力就会有收获。
            </StepCard>
            <StepCard n={4}>
              <Mark>主动引导</Mark>
              ：调整心态，委婉引导消费，用巧妙话术让用户不知不觉为你付出，收益最大化。
            </StepCard>
          </div>
        </section>

        <section className="mine-sec">
          <h2 className="mine-sec-title">💼 陪玩职业素养</h2>
          <div className="mine-steps">
            <StepCard n={1}>
              <Mark>状态在线</Mark>
              ：接活状态要好，爆音有特色，反应快不废话；目标是留住用户而非只拿保底。
            </StepCard>
            <StepCard n={2}>
              <Mark>拒绝敷衍</Mark>
              ：别把陪玩当打卡工作；快速开麦认真接活，换位思考——体验差就不会再来。
            </StepCard>
            <StepCard n={3}>
              <Mark>专注自身</Mark>
              ：不背后议论他人；管好自己，接好活、挣好钱、维护好自己的用户即可。
            </StepCard>
            <StepCard n={4}>
              <Mark>控制脾气</Mark>
              ：收起公主病；用户是来消费的，不是看你脸色的。驱赶用户就是驱赶市场。
            </StepCard>
            <StepCard n={5}>
              <Mark>情商在线</Mark>
              ：问有质量的问题，避免低级趣味；按用户类型调话题，尊重每一个互动。
            </StepCard>
          </div>
          <div className="mine-tip" style={{ marginTop: 12 }}>
            <div className="mine-tip-label">用户分层</div>
            <p>
              区分高价值用户和普通用户，把时间花在能带来收益的用户身上；用有限时间创造无限收益，通过暧昧关系维持市场。
            </p>
          </div>
        </section>

        <section className="mine-sec">
          <h2 className="mine-sec-title">🌟 陪玩成功六要素</h2>
          <div className="mine-card mine-stage">
            <div className="mine-factor">
              <div className="mine-factor-name">1. 学会做人</div>
              <p>拒绝自私、轻浮、见利忘义；用户心里都清楚，真诚才能长久。</p>
            </div>
            <div className="mine-factor">
              <div className="mine-factor-name">2. 不忘初心</div>
              <p>
                不忘初心，方得始终。行业有起有落——高潮时不骄傲，低谷时不气馁；永远保持新人心态，不断学习进步。
              </p>
            </div>
            <div className="mine-factor">
              <div className="mine-factor-name">3. 把控关系 / 平衡关系</div>
              <p>平等对待新老用户，不偏不倚，维持公平互动环境，避免用户流失。</p>
            </div>
            <div className="mine-factor">
              <div className="mine-factor-name">4. 存在感</div>
              <p>
                刷存在感：让每个进厅用户都有被重视的感觉。尽可能私聊游客打个招呼，让对方觉得受到重视——他们才会喜欢呆在你的厅陪着你。持续下去，久而久之就能进一步积累人气和老板。
              </p>
            </div>
            <div className="mine-factor">
              <div className="mine-factor-name">5. 暗渡陈仓</div>
              <p>
                合理分配精力维护土豪用户。注意：不要只在排档时跟土豪聊天；不要上传礼物截图到相册——这样做必定影响人气，土豪也不喜欢看到这一面。
              </p>
            </div>
            <div className="mine-factor">
              <div className="mine-factor-name">6. 自由 / 心态自由</div>
              <p>
                接受用户的流动性；土豪有刷礼物给别人的自由。记住曾经的陪伴和付出，保持平和心态。
              </p>
            </div>
          </div>
        </section>

        <section className="mine-sec">
          <h2 className="mine-sec-title">💬 聊天技巧全攻略</h2>
          <div className="mine-card mine-stage">
            <div className="mine-factor">
              <div className="mine-factor-name">关键字联想法</div>
              <p>通过对方给出的有限内容，展开新话题。</p>
              <div className="mine-tip">
                <div className="mine-tip-label">例子</div>
                <p>
                  「我平常就在家里呆着看看电影什么的。」→ 提取关键词：电影
                  <br />
                  延伸：「你平常都看些什么电影？」「喜欢看电影的人通常都很感性，看来你也是这样咯。」
                </p>
              </div>
            </div>
            <div className="mine-factor">
              <div className="mine-factor-name">故事分享法</div>
              <p>对话内容 80% 通过分享彼此故事完成。</p>
            </div>
            <div className="mine-factor">
              <div className="mine-factor-name">开放式圈套</div>
              <p>勾起对方好奇心，引发持续兴趣。别只回「很好」，试试：</p>
              <Dialogue
                lines={[
                  { who: '他', text: '你今天过得怎么样？' },
                  { who: '你', text: '真的是一言难尽' },
                  { who: '他', text: '怎么了？' },
                  { who: '你', text: '太恶心了！你一定不会想知道的。' },
                ]}
              />
              <p className="mine-muted-note">效果：他对你的故事会产生强烈兴趣。</p>
            </div>
            <div className="mine-factor">
              <div className="mine-factor-name">幽默感</div>
              <p>幽默是思维方式；做有趣的人，比讲笑话更重要。</p>
            </div>
          </div>
        </section>

        <section className="mine-sec">
          <h2 className="mine-sec-title">🎯 开场白技巧</h2>
          <div className="mine-card mine-stage" style={{ marginBottom: 12 }}>
            <div className="mine-factor-name">好奇型开场白</div>
            <p className="mine-muted-note">回复率高，适合思维活跃的女生</p>
            <ul className="mine-bullets">
              <li>我好像在哪看到过你</li>
              <li>我从你的眼睛里看到……</li>
              <li>鸡蛋和石头相撞，石头却碎了，你知道为什么吗？</li>
              <li>我觉得你好像一个明星</li>
            </ul>
            <div className="mine-tip">
              <div className="mine-tip-label">特点</div>
              <p>引发好奇心，但对聊天能力要求较高。</p>
            </div>
          </div>
          <div className="mine-card mine-stage">
            <div className="mine-factor-name">有趣型开场白</div>
            <p className="mine-muted-note">展现自信，适合幽默活跃的女生</p>
            <ul className="mine-bullets">
              <li>漂亮的先说话</li>
              <li>我妈让我给你打个招呼</li>
              <li>我今天是第几个给你打招呼的仙女？哈哈</li>
              <li>你在干嘛呢？有没有想我呀？</li>
            </ul>
            <div className="mine-tip">
              <div className="mine-tip-label">特点</div>
              <p>与众不同，让对方产生好奇，但需要足够自信。</p>
            </div>
          </div>
        </section>

        <section className="mine-sec">
          <h2 className="mine-sec-title">🔄 话题延续技巧</h2>
          <div className="mine-card mine-card-plain" style={{ marginBottom: 10 }}>
            开场后对方回复了，却不知道聊什么？试试这些方法。
          </div>
          <div className="mine-warn mine-warn-list" style={{ marginBottom: 12 }}>
            <div className="mine-callout-label" style={{ marginBottom: 8 }}>
              禁忌话题 · 查户口四问
            </div>
            <ul className="mine-bullets">
              <li>你是做什么的？</li>
              <li>你是哪里人？</li>
              <li>你今年多大了？</li>
              <li>你平时喜欢干什么？</li>
            </ul>
            <p style={{ margin: '8px 0 0', fontSize: 12.5, lineHeight: 1.5, color: '#f0c98a' }}>
              这类话题容易让对方反感，聊天刚开始一定要避免。
            </p>
          </div>
          <div className="mine-card mine-stage" style={{ marginBottom: 12 }}>
            <div className="mine-factor-name">❌ 错误示范</div>
            <Dialogue
              lines={[
                { who: '你', text: '干嘛呢？' },
                { who: '他', text: '看电影' },
                { who: '你', text: '吃饭了嘛？' },
                { who: '他', text: '刚吃了黄焖鸡' },
                { who: '你', text: '好吃吗？' },
                { who: '他', text: '还可以' },
                { who: '你', text: '你最近忙吗？' },
                { who: '他', text: '不忙' },
              ]}
            />
            <p className="mine-muted-note">问题：不断切换话题、没有延伸，聊天容易中断。</p>
          </div>
          <div className="mine-card mine-stage" style={{ marginBottom: 12 }}>
            <div className="mine-factor-name">✅ 正确示范</div>
            <Dialogue
              lines={[
                { who: '你', text: '干嘛呢？' },
                { who: '他', text: '看电影（关键词：电影）' },
                { who: '你', text: '前任嘛？（延伸：最近热播）' },
                { who: '他', text: '你怎么知道？' },
                { who: '你', text: '我也看了，看的时候哭死了，我特别喜欢韩庚。' },
                { who: '他', text: '我也挺喜欢的，不过郑凯也挺帅的。' },
                { who: '你', text: '是啊，郑凯有一种痞痞的感觉。' },
                { who: '他', text: '哈哈，看来你跟我有相同的看法啊。' },
              ]}
            />
          </div>
          <div className="mine-tip">
            <div className="mine-tip-label">核心技巧</div>
            <p>每个关键词都能延伸出多个话题，保持对话连贯性。</p>
          </div>
        </section>

        <section className="mine-sec">
          <h2 className="mine-sec-title">📱 引导加微信</h2>
          <div className="mine-card mine-stage">
            <div className="mine-factor">
              <div className="mine-factor-name">黄金时机</div>
              <p>
                开场白过后，通过延伸话题完成基础聊天互动，此时是引导加微信的最佳时机。微信朋友圈可全方位展示生活与品质，大幅提升吸引力。
              </p>
            </div>
            <div className="mine-factor">
              <div className="mine-factor-name">关键原则</div>
              <p>男人做事需要合理理由；铺垫后给出恰当理由，成功率翻倍。</p>
            </div>
            <div className="mine-factor">
              <div className="mine-factor-name">话术模板</div>
              <ul className="mine-bullets">
                <li>
                  <Mark>通用型</Mark>
                  ：这个不常用，不妨微信聊吧。（适用于任何情况）
                </li>
                <li>
                  <Mark>时差型</Mark>
                  ：这个聊天像有时差一样，要不然微信聊吧。（沟通间隔几小时时）
                </li>
                <li>
                  <Mark>便捷型</Mark>
                  ：切换太麻烦，我们微信聊。（沟通愉快时）
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section className="mine-sec">
          <h2 className="mine-sec-title">实操补充</h2>
          <div className="mine-card mine-stage">
            <ul className="mine-bullets">
              <li>
                <Mark>跨厅挖掘</Mark>
                ：开小号去其他公会厅，私聊用户带到自己厅
              </li>
              <li>
                <Mark>每日目标</Mark>
                ：每天认识 2 个新朋友；从签名、动态、地区找话题，坚持 3 天必有收获
              </li>
              <li>
                <Mark>缓慢接触</Mark>
                ：不熟悉前不要要礼物；先建立信任，让对方主动支持你
              </li>
              <li>
                <Mark>关系维护</Mark>
                ：像对待家人一样关心支持你的老板；尊重他、懂他、引导他宠爱你
              </li>
              <li>
                <Mark>公屏欢迎</Mark>
                ：老板进来公屏欢迎、问好或说想念有趣的话；禁止说别人私事/隐私，私事请私聊；禁止揭老板短
              </li>
              <li>
                <Mark>自我要求</Mark>
                ：设定目标并完成，不找借口；排麦少就主动拓展市场
              </li>
              <li>
                <Mark>工作态度</Mark>
                ：准备好设备，坐正接活；服务行业态度决定一切
              </li>
              <li>
                <Mark>心态管理</Mark>
                ：遇到难相处的老板保持冷静；好态度能收获更多支持
              </li>
              <li>
                <Mark>适当反刷</Mark>
                ：对实力强的老板适当回刷礼物，维护关系，别太吝啬
              </li>
              <li>
                <Mark>和谐相处</Mark>
                ：外出以交友为主，不惹事，为人和善
              </li>
              <li>
                <Mark>自我激励</Mark>
                ：认真对待工作；哪怕只是玩也要做出样子，活泼有趣才能脱颖而出
              </li>
              <li>
                <Mark>为人素养</Mark>
                ：不干涉同事私事，保持分寸，避免引起反感
              </li>
              <li>
                <Mark>欲擒故纵</Mark>
                ：让老板主动喜欢你；保持神秘感，适当撒娇任性增加情趣
              </li>
              <li>
                <Mark>拓展人脉</Mark>
                ：多建立家人关系；男女老板都要维护，关系越多市场越大
              </li>
              <li>
                <Mark>自我提升</Mark>
                ：排麦时和有消费能力的老板聊天，提升吸引力，让对方主动找你
              </li>
              <li>
                <Mark>客户接待</Mark>
                ：老板来了热情欢迎；熟人送关心，陌生人用有趣的私聊文本
              </li>
            </ul>
          </div>
        </section>

        <section className="mine-sec">
          <h2 className="mine-sec-title">🎯 核心总结</h2>
          <div className="mine-card mine-stage">
            <ul className="mine-bullets">
              <li>① 为人善良，保持礼貌</li>
              <li>② 提升自己，保证质量</li>
              <li>③ 寻找市场，保持市场</li>
              <li>④ 运用技巧，欲擒故纵</li>
              <li>⑤ 坚持不懈，死磕到底</li>
            </ul>
            <div className="mine-callout">
              <div className="mine-callout-label">加油</div>
              <p>
                陪玩行业只要努力就有收获。公会顶尖陪陪日均收入 1000+，坚持就能成功。
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}



const PM_UNLOCK_ROWS: { hours: string; level: string; lv: string; daily: string; friends: string }[] = [
  { hours: '3 小时', level: '3级私聊权限', lv: '3', daily: '30人', friends: '30人' },
  { hours: '6 小时', level: '2级私聊权限', lv: '2', daily: '40人', friends: '40人' },
  { hours: '15 小时', level: '1级私聊权限', lv: '1', daily: '50人', friends: '50人' },
]

function PmUnlockPage({ onBack }: { onBack: () => void }) {
  return (
    <div className="pane">
      <div className="nav">
        <button type="button" aria-label="back" onClick={onBack}>
          {'<'}
        </button>
        <div className="title">解锁私信</div>
        <span className="nav-side" />
      </div>
      <div className="mine-scroll mine-doc">
        <section className="mine-sec">
          <h2 className="mine-sec-title">解锁私信要求</h2>
          <div className="mine-card mine-card-plain" style={{ marginBottom: 10 }}>
            根据累计开播时长解锁不同私聊权限：
          </div>
          <div className="mine-unlock-list">
            {PM_UNLOCK_ROWS.map((row) => (
              <div key={row.level} className="mine-unlock-card">
                <div className="mine-unlock-badge" aria-hidden="true">
                  {row.lv}
                </div>
                <div className="mine-unlock-body">
                  <div className="mine-unlock-req">
                    累计满 <Mark>{row.hours}</Mark>
                  </div>
                  <div className="mine-unlock-level">{row.level}</div>
                  <div className="mine-unlock-meta">
                    每天可私聊 {row.daily} / 好友上限 {row.friends}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mine-sec">
          <h2 className="mine-sec-title">更高权限解锁方式</h2>
          <div className="mine-card mine-stage">
            <p>如需开通更多私聊人数，需同时满足：</p>
            <ul className="mine-bullets">
              <li>
                <Mark>48小时内</Mark>开播达到 <Mark>3小时</Mark>
              </li>
              <li>
                收礼金额大于 <Mark>100元</Mark>
              </li>
            </ul>
            <div className="mine-tip">
              <div className="mine-tip-label">开通</div>
              <p>满足后在工会后台添加私聊白名单即可。</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}




function formatCreatedAt(ts: number) {
  if (!ts) return ''
  try {
    return new Date(ts).toLocaleString('zh-CN', { hour12: false })
  } catch {
    return ''
  }
}

function isAdminName(username: string) {
  return username.trim().toLowerCase() === 'admin'
}

function AdminUsersPage({ onBack }: { onBack: () => void }) {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  async function load(opts?: { quiet?: boolean }) {
    if (!opts?.quiet) setLoading(true)
    setErr('')
    try {
      setUsers(await fetchAdminUsers())
    } catch (e) {
      setErr(e instanceof Error ? e.message : '加载失败，请重试')
    } finally {
      if (!opts?.quiet) setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function approve(id: string) {
    setBusyId(id)
    setErr('')
    try {
      await approveAdminUser(id)
      await load({ quiet: true })
    } catch (e) {
      setErr(e instanceof Error ? e.message : '同意失败，请重试')
    } finally {
      setBusyId(null)
    }
  }

  async function reject(id: string) {
    setBusyId(id)
    setErr('')
    try {
      await rejectAdminUser(id)
      await load({ quiet: true })
    } catch (e) {
      setErr(e instanceof Error ? e.message : '拒绝失败，请重试')
    } finally {
      setBusyId(null)
    }
  }

  async function remove(id: string, username: string) {
    if (!window.confirm(`确定移除账号「${username}」？此操作不可恢复。`)) return
    setBusyId(id)
    setErr('')
    try {
      await removeAdminUser(id)
      await load({ quiet: true })
    } catch (e) {
      setErr(e instanceof Error ? e.message : '移除失败，请重试')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="pane">
      <div className="nav">
        <button type="button" aria-label="back" onClick={onBack}>
          {'<'}
        </button>
        <div className="title">注册列表</div>
        <span className="nav-side" />
      </div>
      <div className="mine-scroll mine-doc">
        <section className="mine-sec">
          <h2 className="mine-sec-title">用户注册审核</h2>
          {loading ? <div className="mine-card mine-card-plain">加载中…</div> : null}
          {err ? <div className="mine-warn">{err}</div> : null}
          {!loading ? (
            <div className="mine-admin-list">
              {users.length === 0 ? (
                <div className="mine-card mine-card-plain">暂无用户</div>
              ) : (
                users.map((u) => {
                  const adminRow = isAdminName(u.username)
                  return (
                    <div key={u.id} className="mine-admin-row">
                      <div className="mine-admin-main">
                        <div className="mine-admin-name">{u.username}</div>
                        <div className="mine-admin-meta">
                          <span className={u.status === 'pending' ? 'mine-admin-badge pending' : 'mine-admin-badge approved'}>
                            {u.status === 'pending' ? '待确认' : '已通过'}
                          </span>
                          {u.created_at ? <span>{formatCreatedAt(u.created_at)}</span> : null}
                        </div>
                      </div>
                      {u.status === 'pending' ? (
                        <div className="mine-admin-actions">
                          <button
                            type="button"
                            className="mine-admin-approve"
                            disabled={busyId === u.id}
                            onClick={() => void approve(u.id)}
                          >
                            {busyId === u.id ? '处理中…' : '同意'}
                          </button>
                          <button
                            type="button"
                            className="mine-admin-reject"
                            disabled={busyId === u.id}
                            onClick={() => void reject(u.id)}
                          >
                            拒绝
                          </button>
                        </div>
                      ) : adminRow ? (
                        <button type="button" className="mine-admin-remove" disabled title="不能移除管理员">
                          移除账号
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="mine-admin-remove"
                          disabled={busyId === u.id}
                          onClick={() => void remove(u.id, u.username)}
                        >
                          {busyId === u.id ? '移除中…' : '移除账号'}
                        </button>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  )
}

function HallIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4.5 19.5h15M6 19.5V9.8L12 5l6 4.8v9.7"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10 19.5v-5h4v5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function SalaryIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4.5" y="5.5" width="15" height="13" rx="2.2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8 9.5h8M8 12.5h5M8 15.5h3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

function UsersIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM16.5 10a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3.8 18.5c.7-2.6 2.8-4 5.2-4s4.5 1.4 5.2 4M14.2 14.8c1.5-.4 3.1.1 4.2 1.6.5.7.8 1.5.9 2.1"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function EntryIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7.5 4.5h7.2A2.3 2.3 0 0 1 17 6.8v4.2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7.5 4.5A2.3 2.3 0 0 0 5.2 6.8v11.4A2.3 2.3 0 0 0 7.5 20.5h6.2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8.8 9h4.4M8.8 12.4h3.2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M13.6 16.2 18.4 11.4a1.2 1.2 0 0 1 1.7 1.7l-4.8 4.8-2.2.5.5-2.2Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ApplyIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M8 4.5h8.5A2.5 2.5 0 0 1 19 7v13.5H8A2.5 2.5 0 0 1 5.5 18V7A2.5 2.5 0 0 1 8 4.5Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.5 9h5M9.5 12.5h5M9.5 16h3"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M14.5 4.5V3.8A1.3 1.3 0 0 0 13.2 2.5h-2.4A1.3 1.3 0 0 0 9.5 3.8v.7"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function PrankIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3.5c-3.6 0-6.5 2.4-6.5 6.2 0 2.4 1.1 4.1 2.4 5.5.6.6 1 1.3 1.1 2.1v.4h6v-.4c.1-.8.5-1.5 1.1-2.1 1.3-1.4 2.4-3.1 2.4-5.5C18.5 5.9 15.6 3.5 12 3.5Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.2 9.2h.01M14.8 9.2h.01M9.6 12.2c.7.8 1.5 1.2 2.4 1.2s1.7-.4 2.4-1.2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.5 17.7h5M10.2 20.2h3.6"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  )
}


function GrowthIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 20.5V10"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M12 10c0-3.2 1.8-6 4.8-7.2-.3 2.4.6 4.6 2.4 6.2-2.6.4-4.8 2.4-5.6 5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 12.5c-1.2-2.2-3.4-3.6-5.8-3.8 1.6 1.5 2.3 3.6 2 5.8 1.5-.7 2.9-1.2 3.8-2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7 20.5h10"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  )
}


function CommsIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5.5 7.5A3 3 0 0 1 8.5 4.5h7A3 3 0 0 1 18.5 7.5v4A3 3 0 0 1 15.5 14.5H12l-3.2 2.6c-.5.4-1.3.05-1.3-.6v-2H8.5A3 3 0 0 1 5.5 11.5v-4Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9 8.8h6M9 11.2h3.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  )
}


function UnlockIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M8 11V8.2A4 4 0 0 1 16 8.4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect
        x="6.4"
        y="11"
        width="11.2"
        height="8.7"
        rx="2.2"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M12 14.1v2.4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function MinePage({
  username,
  onLogout,
  onLogin,
}: {
  username: string
  onLogout: () => void
  onLogin?: () => void
}) {
  type MineView = 'list' | 'onboard' | 'howEnter' | 'prank' | 'growth' | 'comms' | 'pmUnlock' | 'adminUsers'
  const [view, setView] = useState<MineView>('list')
  const [flash, setFlash] = useState<string | null>(null)
  const loggedIn = !!username
  const isAdmin = username.trim().toLowerCase() === 'admin'

  function requireLogin() {
    setFlash('请先登录')
    window.setTimeout(() => setFlash(null), 1600)
    onLogin?.()
  }

  function openExternal(url: string) {
    if (!loggedIn) {
      requireLogin()
      return
    }
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  if (view === 'onboard') {
    return <OnboardApplyPage onBack={() => setView('list')} />
  }

  if (view === 'howEnter') {
    return <HowToEnterHallPage onBack={() => setView('list')} />
  }

  if (view === 'prank') {
    return <PrankSettingsPage onBack={() => setView('list')} />
  }

  if (view === 'growth') {
    return <GrowthGuidePage onBack={() => setView('list')} />
  }

  if (view === 'comms') {
    return <CommsGuidePage onBack={() => setView('list')} />
  }

  if (view === 'pmUnlock') {
    return <PmUnlockPage onBack={() => setView('list')} />
  }

  if (view === 'adminUsers') {
    return <AdminUsersPage onBack={() => setView('list')} />
  }

  return (
    <div className="pane">
      <div className="nav">
        <span className="nav-side" />
        <div className="title">
          {username || '游客'}
          <small>云梦传媒</small>
        </div>
        <span className="nav-side" />
      </div>
      <div className="mine-scroll">
        <div className="mine-grid">
          <button type="button" className="mine-tile" onClick={() => setView('onboard')}>
            <span className="mine-glyph">
              <ApplyIcon />
            </span>
            <span className="mine-label">入职流程</span>
          </button>
          <button type="button" className="mine-tile" onClick={() => setView('howEnter')}>
            <span className="mine-glyph">
              <HallIcon />
            </span>
            <span className="mine-label">如何进厅</span>
          </button>
          <button type="button" className="mine-tile" onClick={() => setView('prank')}>
            <span className="mine-glyph">
              <PrankIcon />
            </span>
            <span className="mine-label">设置整蛊</span>
          </button>
          <button type="button" className="mine-tile" onClick={() => setView('pmUnlock')}>
            <span className="mine-glyph">
              <UnlockIcon />
            </span>
            <span className="mine-label">解锁私信</span>
          </button>
          <button type="button" className="mine-tile" onClick={() => openExternal(SALARY_QUERY_URL)}>
            <span className="mine-glyph">
              <SalaryIcon />
            </span>
            <span className="mine-label">工资查询</span>
          </button>
          <button type="button" className="mine-tile" onClick={() => openExternal(STREAMER_ENTRY_URL)}>
            <span className="mine-glyph">
              <EntryIcon />
            </span>
            <span className="mine-label">主播录入</span>
          </button>
          <button type="button" className="mine-tile" onClick={() => setView('growth')}>
            <span className="mine-glyph">
              <GrowthIcon />
            </span>
            <span className="mine-label">大哥养成</span>
          </button>
          <button type="button" className="mine-tile" onClick={() => setView('comms')}>
            <span className="mine-glyph">
              <CommsIcon />
            </span>
            <span className="mine-label">沟通技巧</span>
          </button>
          {isAdmin ? (
            <button type="button" className="mine-tile" onClick={() => setView('adminUsers')}>
              <span className="mine-glyph">
                <UsersIcon />
              </span>
              <span className="mine-label">注册列表</span>
            </button>
          ) : null}
        </div>
        {loggedIn ? (
          <button type="button" className="mine-logout" onClick={onLogout}>
            退出登录
          </button>
        ) : onLogin ? (
          <button type="button" className="mine-login" onClick={onLogin}>
            登录 / 注册
          </button>
        ) : null}
      </div>
      {flash ? <div className="toast">{flash}</div> : null}
    </div>
  )
}
