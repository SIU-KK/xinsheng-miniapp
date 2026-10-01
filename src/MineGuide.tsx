import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useBackHandler, BackScope } from './uxGestures'
import {
  approveAdminUser,
  deleteMyStreamerProfile,
  fetchAdminUserDetail,
  fetchAdminUsers,
  fetchGuildPointRates,
  updateGuildPointRates,
  fetchMe,
  deleteLiushuiBatch,
  fetchLiushuiBatch,
  fetchLiushuiBatches,
  fetchMyStreamerProfile,
  fetchStreamerProfiles,
  rejectAdminUser,
  removeAdminUser,
  saveAdminUserDetail,
  saveStreamerProfile,
  toUserError,
  saveLiushuiRows,
  updateLiushuiBatch,
  uploadLiushuiExcel,
  deleteActivityBatch,
  fetchActivityBatch,
  fetchActivityBatches,
  uploadActivityExcel,
  deleteCommissionBatch,
  fetchCommissionBatch,
  fetchCommissionBatches,
  uploadCommissionExcel,
  type AdminUser,
  type AdminUserDetailFields,
  type LiushuiBatchListItem,
  type LiushuiBatchSummary,
  type LiushuiDateRange,
  type LiushuiPreviewRow,
  type ActivityBatchListItem,
  type ActivityDateRange,
  type ActivityPreviewRow,
  type CommissionBatchListItem,
  type CommissionDateRange,
  type CommissionPreviewRow,
  type SaveStreamerPhoto,
  type SaveStreamerPayQr,
  type StreamerProfile,
} from './api'
import { compressChatShot } from './chatShot'
import { homeworkContent } from './homeworkContent'
import { pkGuideContent } from './pkGuideContent'
import { newcomerGuideContent } from './newcomerGuideContent'
import { gameGuideContent } from './gameGuideContent'
import { welfareGuideContent } from './welfareGuideContent'
import { penaltyGuideContent } from './penaltyGuideContent'
import { POINT_TYPES } from './pointRate'
import { formatMoney2 } from './liushuiWage'
import {
  getLiushuiBatchCache,
  invalidateLiushuiBatchCache,
  loadLiushuiBatchCached,
  prefetchLiushuiBatches,
  setLiushuiBatchCache,
} from './liushuiCache'
import { MySalaryPage } from './MySalary'
import { RevenueBoardPage } from './RevenueBoard'
import { PayrollBoardPage } from './PayrollBoard'

const DOWNLOAD_URL = 'https://vvxqiu.com/#/'
const GUILD_VEST_TAG = 'ξ·'

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
              找到 <Mark>云梦传媒</Mark>
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
            <p style={{ margin: '8px 0 0', fontSize: 12.5, lineHeight: 1.5, color: '#6f8fd6' }}>
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

/** Bootstrap 会长 (username `admin`) — full guild-president access. */
function isBootstrapAdminName(username: string) {
  return username.trim().toLowerCase() === 'admin'
}

function accountRoleLabel({
  username,
  isDage,
  isFullAdmin,
  isTingGuan,
  isHallOwner,
  pointRate,
}: {
  username: string
  isDage: boolean
  isFullAdmin: boolean
  isTingGuan: boolean
  isHallOwner: boolean
  pointRate: string
}) {
  if (!username.trim()) return '游客'
  if (isBootstrapAdminName(username)) return '会长'
  if (isFullAdmin) return '全满'
  if (isHallOwner) return '厅主'
  if (isTingGuan) return '厅管'
  if (isDage) return '大哥'
  const type = pointRate.trim()
  return (POINT_TYPES as readonly string[]).includes(type) ? type : '主播'
}

export function AccountHeader({
  username,
  userId = '',
  isDage = false,
  isFullAdmin = false,
  isTingGuan = false,
  isHallOwner = false,
  pointRate = '',
  hallNo = null,
  onLogout,
}: {
  username: string
  userId?: string
  isDage?: boolean
  isFullAdmin?: boolean
  isTingGuan?: boolean
  isHallOwner?: boolean
  pointRate?: string
  hallNo?: string | null
  onLogout?: () => void
}) {
  const [streamerId, setStreamerId] = useState('')
  useEffect(() => {
    if (!username) {
      setStreamerId('')
      return
    }
    let cancelled = false
    void fetchMyStreamerProfile()
      .then((p) => {
        if (!cancelled) setStreamerId((p?.streamerId || '').trim())
      })
      .catch(() => {
        if (!cancelled) setStreamerId('')
      })
    return () => {
      cancelled = true
    }
  }, [username, userId])
  const role = accountRoleLabel({ username, isDage, isFullAdmin, isTingGuan, isHallOwner, pointRate })
  const hall = (hallNo || '').trim()
  const idLine = !username
    ? '未登录'
    : streamerId
      ? `主播ID ${streamerId}`
      : '主播ID —'
  return (
    <div className="nav mine-account-nav">
      <div className="mine-account-user" title={username || '游客'}>
        <strong>{username || '游客'}</strong>
        <small>{idLine}</small>
      </div>
      <div className="mine-account-role">
        <strong>{role}</strong>
        <small>所属厅 {hall || '—'}</small>
      </div>
      {onLogout ? (
        <button type="button" className="nav-set mine-account-logout" onClick={onLogout}>
          退出
        </button>
      ) : (
        <span className="mine-account-logout-spacer" aria-hidden="true" />
      )}
    </div>
  )
}

const EMPTY_ADMIN_DETAIL: AdminUserDetailFields = {
  hallNo: '',
  name: '',
  streamerId: '',
  liveTime: '',
  region: '',
  height: '',
  weight: '',
  type: '',
  skills: '',
  pointRate: '',
  referrerId: '',
  linkedId1: '',
  linkedId2: '',
  linkedId3: '',
  isHallOwner: false,
  hallPayMode: 'union',
  hallPointRate: 0.53,
  userFlowPointRate: 0.74,
  myDageIds: [''],
}

function profileToAdminFields(
  p: StreamerProfile | null,
  myDageIds?: string[],
): AdminUserDetailFields {
  const ids =
    Array.isArray(myDageIds) && myDageIds.length
      ? myDageIds.map((x) => String(x || ''))
      : ['']
  if (!p) return { ...EMPTY_ADMIN_DETAIL, myDageIds: ids }
  return {
    hallNo: p.hallNo || '',
    name: p.name || '',
    streamerId: p.streamerId || '',
    liveTime: p.liveTime || '',
    region: p.region || '',
    height: p.height || '',
    weight: p.weight || '',
    type: p.type || '',
    skills: p.skills || '',
    pointRate: p.pointRate || '',
    referrerId: p.referrerId || '',
    linkedId1: p.linkedId1 || '',
    linkedId2: p.linkedId2 || '',
    linkedId3: p.linkedId3 || '',
    isHallOwner: !!p.isHallOwner,
    hallPayMode: p.hallPayMode === 'self' ? 'self' : 'union',
    hallPointRate:
      typeof p.hallPointRate === 'number' && Number.isFinite(p.hallPointRate) ? p.hallPointRate : 0.53,
    userFlowPointRate:
      typeof p.userFlowPointRate === 'number' && Number.isFinite(p.userFlowPointRate)
        ? p.userFlowPointRate
        : 0.74,
    myDageIds: ids,
  }
}

function AdminUsersPage({ onBack }: { onBack: () => void }) {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailErr, setDetailErr] = useState('')
  const [detailSaving, setDetailSaving] = useState(false)
  const [detailForm, setDetailForm] = useState<AdminUserDetailFields>({ ...EMPTY_ADMIN_DETAIL })
  const [detailOk, setDetailOk] = useState('')
  const [viewerIsPresident, setViewerIsPresident] = useState(false)
  const [guildStreamerRate, setGuildStreamerRate] = useState(0.558)
  const [guildUserRate, setGuildUserRate] = useState(0.93)
  const [guildSaving, setGuildSaving] = useState(false)
  const [guildSaveMsg, setGuildSaveMsg] = useState('')

  async function load(opts?: { quiet?: boolean }) {
    if (!opts?.quiet) setLoading(true)
    setErr('')
    try {
      const list = await fetchAdminUsers()
      // Pin admin at top (API also pins); keep pending second, then created_at desc
      list.sort((a, b) => {
        const aAdmin = isBootstrapAdminName(a.username) ? 0 : 1
        const bAdmin = isBootstrapAdminName(b.username) ? 0 : 1
        if (aAdmin !== bAdmin) return aAdmin - bAdmin
        const aPend = a.status === 'pending' ? 0 : 1
        const bPend = b.status === 'pending' ? 0 : 1
        if (aPend !== bPend) return aPend - bPend
        return (b.created_at || 0) - (a.created_at || 0)
      })
      setUsers(list)
    } catch (e) {
      setErr(e instanceof Error ? e.message : '加载失败，请重试')
    } finally {
      if (!opts?.quiet) setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    void fetchMe()
      .then((me) => setViewerIsPresident(!!me && isBootstrapAdminName(me.username)))
      .catch(() => setViewerIsPresident(false))
  }, [])

  async function loadDetail(id: string, username?: string) {
    setDetailLoading(true)
    setDetailErr('')
    setDetailOk('')
    setGuildSaveMsg('')
    setDetailForm({ ...EMPTY_ADMIN_DETAIL })
    try {
      const detail = await fetchAdminUserDetail(id)
      setDetailForm(profileToAdminFields(detail.profile, detail.myDageIds))
      if (username && isBootstrapAdminName(username)) {
        try {
          const rates = await fetchGuildPointRates()
          setGuildStreamerRate(rates.streamerPointRate)
          setGuildUserRate(rates.userFlowPointRate)
          setViewerIsPresident(true)
        } catch {
          /* non-会长 cannot load/edit 工会点位 */
        }
      }
    } catch (e) {
      setDetailErr(e instanceof Error ? e.message : '加载详情失败')
    } finally {
      setDetailLoading(false)
    }
  }

  function toggleExpand(u: AdminUser) {
    if (u.canManage === false) {
      setErr('权限不足，无法查看或编辑更高权限账号')
      return
    }
    if (expandedId === u.id) {
      setExpandedId(null)
      setDetailErr('')
      setDetailOk('')
      setGuildSaveMsg('')
      return
    }
    setExpandedId(u.id)
    setErr('')
    void loadDetail(u.id, u.username)
  }

  function setField<K extends keyof AdminUserDetailFields>(key: K, value: AdminUserDetailFields[K]) {
    setDetailForm((prev) => ({ ...prev, [key]: value }))
    setDetailOk('')
  }

  async function saveDetail(id: string) {
    setDetailSaving(true)
    setDetailErr('')
    setDetailOk('')
    const sentMyDageIds = (detailForm.myDageIds || []).map((x) => x.trim()).filter(Boolean)
    try {
      const detail = await saveAdminUserDetail(id, {
        ...detailForm,
        myDageIds: sentMyDageIds,
      })
      const returned = Array.isArray(detail.myDageIds) ? detail.myDageIds : []
      // If server omitted/failed to echo IDs, keep what we just saved so the UI does not blank out.
      const keepIds = returned.length || !sentMyDageIds.length ? returned : sentMyDageIds
      setDetailForm(profileToAdminFields(detail.profile, keepIds))
      setDetailOk('已保存')
    } catch (e) {
      setDetailErr(e instanceof Error ? e.message : '保存失败，请重试')
    } finally {
      setDetailSaving(false)
    }
  }

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
      if (expandedId === id) setExpandedId(null)
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
      if (expandedId === id) setExpandedId(null)
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
          <p className="mine-admin-hint">点击用户名展开资料与流水归属字段，可编辑后保存。</p>
          {loading ? <div className="mine-card mine-card-plain">加载中…</div> : null}
          {err ? <div className="mine-warn">{err}</div> : null}
          {!loading ? (
            <div className="mine-admin-list">
              {users.length === 0 ? (
                <div className="mine-card mine-card-plain">暂无用户</div>
              ) : (
                users.map((u) => {
                  const adminRow = isBootstrapAdminName(u.username)
                  const locked = u.canManage === false
                  const open = expandedId === u.id && !locked
                  return (
                    <div key={u.id} className={'mine-admin-card' + (open ? ' open' : '') + (locked ? ' locked' : '')}>
                      <div className="mine-admin-row">
                        <button
                          type="button"
                          className="mine-admin-main mine-admin-name-btn"
                          onClick={() => toggleExpand(u)}
                          aria-expanded={open}
                          disabled={locked}
                          title={locked ? '权限不足，无法查看更高权限账号' : undefined}
                        >
                          <div className="mine-admin-name">
                            <span className="mine-admin-chevron" aria-hidden="true">
                              {locked ? '🔒' : open ? '▾' : '▸'}
                            </span>
                            {u.username}
                            {adminRow ? <span className="mine-admin-badge approved">会长</span> : null}
                          </div>
                          <div className="mine-admin-meta">
                            <span className={u.status === 'pending' ? 'mine-admin-badge pending' : 'mine-admin-badge approved'}>
                              {u.status === 'pending' ? '待确认' : '已通过'}
                            </span>
                            {u.created_at ? <span>{formatCreatedAt(u.created_at)}</span> : null}
                          </div>
                        </button>
                        {locked ? (
                          <button type="button" className="mine-admin-remove" disabled title="权限不足">
                            不可操作
                          </button>
                        ) : u.status === 'pending' ? (
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
                      {open ? (
                        <div className="mine-admin-detail">
                          {detailLoading ? <div className="mine-muted">加载详情…</div> : null}
                          {detailErr ? <div className="mine-warn">{detailErr}</div> : null}
                          {detailOk ? <div className="mine-admin-ok">{detailOk}</div> : null}
                          {!detailLoading ? (
                            <div className="mine-admin-form">
                              <label className="field-label">
                                主播名
                                <input
                                  className="textin"
                                  value={detailForm.name}
                                  onChange={(e) => setField('name', e.target.value)}
                                  placeholder="主播名称"
                                />
                              </label>
                              <label className="field-label">
                                ID
                                <input
                                  className="textin"
                                  value={detailForm.streamerId}
                                  onChange={(e) => setField('streamerId', e.target.value)}
                                  placeholder="平台 ID"
                                />
                              </label>
                              <label className="field-label">
                                所属厅号
                                <input
                                  className="textin"
                                  value={detailForm.hallNo}
                                  onChange={(e) => setField('hallNo', e.target.value)}
                                  placeholder="厅号"
                                />
                              </label>
                              <label className="field-label mine-admin-check">
                                <span className="mine-admin-check-row">
                                  <input
                                    type="checkbox"
                                    checked={detailForm.isHallOwner}
                                    onChange={(e) => setField('isHallOwner', e.target.checked)}
                                  />
                                  厅主
                                </span>
                                <span className="mine-admin-assoc-hint">勾选后可查看所属厅收益看板；下方选择发薪方式</span>
                              </label>
                              {detailForm.isHallOwner ? (
                                <div className="field-label mine-admin-check">
                                  <span className="mine-admin-assoc-hint">厅主发薪方式</span>
                                  <label className="mine-admin-check-row">
                                    <input
                                      type="radio"
                                      name={`hallPayMode-${u.id}`}
                                      checked={detailForm.hallPayMode !== 'self'}
                                      onChange={() => setField('hallPayMode', 'union')}
                                    />
                                    工会代发工资
                                  </label>
                                  <label className="mine-admin-check-row">
                                    <input
                                      type="radio"
                                      name={`hallPayMode-${u.id}`}
                                      checked={detailForm.hallPayMode === 'self'}
                                      onChange={() => setField('hallPayMode', 'self')}
                                    />
                                    厅主自行发工资
                                  </label>
                                  <span className="mine-admin-assoc-hint">
                                    工会代发：厅收益−该厅主持工资；自行发：厅收益全额
                                  </span>
                                  <label className="field-label" style={{ marginTop: 8 }}>
                                    厅点位
                                    <input
                                      className="textin"
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      max="2"
                                      value={detailForm.hallPointRate}
                                      onChange={(e) => {
                                        const n = Number(e.target.value)
                                        setField(
                                          'hallPointRate',
                                          Number.isFinite(n) ? n : 0.53,
                                        )
                                      }}
                                      placeholder="默认 0.53"
                                    />
                                    <span className="mine-admin-assoc-hint">
                                      主播流水×厅点位；默认 0.53
                                    </span>
                                  </label>
                                  <label className="field-label">
                                    用户流水点位
                                    <input
                                      className="textin"
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      max="2"
                                      value={detailForm.userFlowPointRate}
                                      onChange={(e) => {
                                        const n = Number(e.target.value)
                                        setField(
                                          'userFlowPointRate',
                                          Number.isFinite(n) ? n : 0.74,
                                        )
                                      }}
                                      placeholder="默认 0.74"
                                    />
                                    <span className="mine-admin-assoc-hint">
                                      用户流水×用户流水点位；默认 0.74。厅收入=主播流水×厅点位+用户流水×用户流水点位
                                    </span>
                                  </label>
                                </div>
                              ) : null}
                              <label className="field-label">
                                点位
                                <select
                                  className="textin"
                                  value={detailForm.pointRate}
                                  onChange={(e) => setField('pointRate', e.target.value)}
                                >
                                  <option value="">请选择</option>
                                  {detailForm.pointRate &&
                                  !(POINT_TYPES as readonly string[]).includes(detailForm.pointRate) ? (
                                    <option value={detailForm.pointRate}>
                                      {detailForm.pointRate}（旧值）
                                    </option>
                                  ) : null}
                                  {POINT_TYPES.map((t) => (
                                    <option key={t} value={t}>
                                      {t}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="field-label">
                                介绍人ID
                                <input
                                  className="textin"
                                  value={detailForm.referrerId}
                                  onChange={(e) => setField('referrerId', e.target.value)}
                                  placeholder="介绍人平台 ID"
                                />
                              </label>
                              <div className="mine-admin-assoc">
                                <div className="field-label">关联其他ID</div>
                                <p className="mine-admin-assoc-hint">关联账号表示关联的账号流水也属于这个主播的流水</p>
                                <input
                                  className="textin"
                                  value={detailForm.linkedId1}
                                  onChange={(e) => setField('linkedId1', e.target.value)}
                                  placeholder="关联 ID 1"
                                />
                                <input
                                  className="textin"
                                  value={detailForm.linkedId2}
                                  onChange={(e) => setField('linkedId2', e.target.value)}
                                  placeholder="关联 ID 2"
                                />
                                <input
                                  className="textin"
                                  value={detailForm.linkedId3}
                                  onChange={(e) => setField('linkedId3', e.target.value)}
                                  placeholder="关联 ID 3"
                                />
                              </div>
                              <div className="mine-admin-assoc">
                                <div className="field-label">我的大哥</div>
                                <p className="mine-admin-assoc-hint">
                                  填写大哥充值账号 ID（订单提成 Excel「用户账号」），可添加多项；保存后在「我的工资」展示上个月充值（支付金额合计）。
                                </p>
                                {(detailForm.myDageIds.length ? detailForm.myDageIds : ['']).map(
                                  (val, idx) => (
                                    <div className="mine-admin-dage-row" key={`dage-${idx}`}>
                                      <input
                                        className="textin"
                                        value={val}
                                        onChange={(e) => {
                                          const value = e.target.value
                                          setDetailForm((prev) => {
                                            const cur = prev.myDageIds.length ? [...prev.myDageIds] : ['']
                                            cur[idx] = value
                                            return { ...prev, myDageIds: cur }
                                          })
                                          setDetailOk('')
                                        }}
                                        placeholder={`大哥账号 ID ${idx + 1}`}
                                      />
                                      <button
                                        type="button"
                                        className="mine-admin-dage-del"
                                        title="删除"
                                        disabled={
                                          detailSaving ||
                                          ((detailForm.myDageIds.length || 1) <= 1 && !val.trim())
                                        }
                                        onClick={() => {
                                          const cur = detailForm.myDageIds.length
                                            ? [...detailForm.myDageIds]
                                            : ['']
                                          if (cur.length <= 1) {
                                            setField('myDageIds', [''])
                                            return
                                          }
                                          cur.splice(idx, 1)
                                          setField('myDageIds', cur.length ? cur : [''])
                                        }}
                                      >
                                        ×
                                      </button>
                                    </div>
                                  ),
                                )}
                                <button
                                  type="button"
                                  className="mine-admin-dage-add"
                                  disabled={detailSaving}
                                  onClick={() =>
                                    setField('myDageIds', [
                                      ...(detailForm.myDageIds.length ? detailForm.myDageIds : ['']),
                                      '',
                                    ])
                                  }
                                >
                                  +
                                </button>
                              </div>
                              {viewerIsPresident && adminRow ? (
                                <div className="mine-admin-assoc revenue-guild-rates">
                                  <div className="field-label">工会点位设置</div>
                                  <p className="mine-admin-assoc-hint">
                                    工会收款 = 主播总流水×主播点位 + 用户总流水×用户流水点位（全局，仅会长可改）
                                  </p>
                                  <label className="field-label">
                                    主播点位
                                    <input
                                      className="textin"
                                      type="number"
                                      step="0.001"
                                      min="0"
                                      max="2"
                                      value={guildStreamerRate}
                                      onChange={(e) => {
                                        const n = Number(e.target.value)
                                        setGuildStreamerRate(Number.isFinite(n) ? n : 0.558)
                                        setGuildSaveMsg('')
                                      }}
                                      placeholder="默认 0.558"
                                    />
                                  </label>
                                  <label className="field-label">
                                    用户流水点位
                                    <input
                                      className="textin"
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      max="2"
                                      value={guildUserRate}
                                      onChange={(e) => {
                                        const n = Number(e.target.value)
                                        setGuildUserRate(Number.isFinite(n) ? n : 0.93)
                                        setGuildSaveMsg('')
                                      }}
                                      placeholder="默认 0.93"
                                    />
                                  </label>
                                  <button
                                    type="button"
                                    className="mine-admin-save"
                                    disabled={guildSaving}
                                    onClick={() => {
                                      setGuildSaving(true)
                                      setGuildSaveMsg('')
                                      updateGuildPointRates({
                                        streamerPointRate: guildStreamerRate,
                                        userFlowPointRate: guildUserRate,
                                      })
                                        .then((rates) => {
                                          setGuildStreamerRate(rates.streamerPointRate)
                                          setGuildUserRate(rates.userFlowPointRate)
                                          setGuildSaveMsg('工会点位已保存')
                                        })
                                        .catch((e) => {
                                          setGuildSaveMsg(
                                            e instanceof Error ? e.message : '保存失败，请重试',
                                          )
                                        })
                                        .finally(() => setGuildSaving(false))
                                    }}
                                  >
                                    {guildSaving ? '保存中…' : '保存工会点位'}
                                  </button>
                                  {guildSaveMsg ? <div className="mine-admin-ok">{guildSaveMsg}</div> : null}
                                </div>
                              ) : null}
                              <button
                                type="button"
                                className="mine-admin-save"
                                disabled={detailSaving}
                                onClick={() => void saveDetail(u.id)}
                              >
                                {detailSaving ? '保存中…' : '保存'}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
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



const TYPE_TAG_OPTIONS = [
  '蘿莉', '御姐', '軟妹', '甜妹', '公主', '高冷', '活潑', '元氣', '清純', '傻白甜',
  '傲嬌', '腹黑', '天然呆', '女王', '大女主', '女漢子', '文藝', '小仙女', '女神', '小姐姐',
  '白富美', '鄰家', '性感', '甜美可愛', '綠茶', '白蓮', '豬豬女孩', '寶藏女孩', '精神小妹',
  '蘿莉音', '少女音', '御姐音', '女王音', '娃娃音',
] as const

const SKILL_TAG_OPTIONS = [
  '端游', '王者', '吃鸡', '金铲铲', '卡点', '唱歌', '跳舞', '才艺', '聊天',
  '和平精英', '原神', '永劫无间', '陪聊', '哄睡', '整蛊', '点唱',
] as const

const TAG_JOIN = '、'

function parseTagList(raw: string): string[] {
  if (!raw || !raw.trim()) return []
  const parts = raw.split(/[、,，/|]+/).map((s) => s.trim()).filter(Boolean)
  const seen = new Set<string>()
  const out: string[] = []
  for (const p of parts) {
    if (seen.has(p)) continue
    seen.add(p)
    out.push(p)
  }
  return out
}

function joinTags(tags: string[]): string {
  return tags.join(TAG_JOIN)
}

function toggleTag(list: string[], tag: string): string[] {
  return list.includes(tag) ? list.filter((t) => t !== tag) : [...list, tag]
}

function ChipPick({
  options,
  selected,
  onChange,
}: {
  options: readonly string[]
  selected: string[]
  onChange: (next: string[]) => void
}) {
  return (
    <div className="chip-row sp-chip-row">
      {options.map((opt) => {
        const on = selected.includes(opt)
        return (
          <button
            key={opt}
            type="button"
            className={'chip' + (on ? ' on' : '')}
            aria-pressed={on}
            onClick={() => onChange(toggleTag(selected, opt))}
          >
            {opt}
          </button>
        )
      })}
    </div>
  )
}

type PhotoDraft =
  | { key: string; kind: 'keep'; id: string; url: string }
  | { key: string; kind: 'new'; dataUrl: string }

type PayQrDraft =
  | { kind: 'empty' }
  | { kind: 'keep'; url: string }
  | { kind: 'new'; dataUrl: string }
  | { kind: 'cleared' }

function ProfileFormPage({ onBack }: { onBack: () => void }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [flash, setFlash] = useState<string | null>(null)
  const [existing, setExisting] = useState<StreamerProfile | null>(null)
  const [hallNo, setHallNo] = useState('503151')
  const [name, setName] = useState('念念')
  const [streamerId, setStreamerId] = useState('')
  const [liveTime, setLiveTime] = useState('')
  const [region, setRegion] = useState('')
  const [height, setHeight] = useState('')
  const [weight, setWeight] = useState('')
  const [typeTags, setTypeTags] = useState<string[]>([])
  const [skillTags, setSkillTags] = useState<string[]>([])
  const [photos, setPhotos] = useState<PhotoDraft[]>([])
  const [payQr, setPayQr] = useState<PayQrDraft>({ kind: 'empty' })
  const fileRef = useRef<HTMLInputElement>(null)
  const payQrRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let alive = true
    void fetchMyStreamerProfile()
      .then((p) => {
        if (!alive) return
        setExisting(p)
        if (p) {
          setHallNo(p.hallNo)
          setName(p.name)
          setStreamerId(p.streamerId)
          setLiveTime(p.liveTime)
          setRegion(p.region)
          setHeight(p.height)
          setWeight(p.weight)
          setTypeTags(parseTagList(p.type))
          setSkillTags(parseTagList(p.skills))
          setPhotos(
            (p.photos || []).map((ph) => ({
              key: ph.id,
              kind: 'keep' as const,
              id: ph.id,
              url: ph.url,
            })),
          )
          setPayQr(p.payQrUrl ? { kind: 'keep', url: p.payQrUrl } : { kind: 'empty' })
        }
      })
      .catch((e) => {
        if (!alive) return
        setErr(e instanceof Error ? e.message : '加载失败')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  async function onPickFiles(list: FileList | null) {
    if (!list?.length) return
    setErr('')
    const room = 5 - photos.length
    if (room <= 0) {
      setErr('最多上传 5 张相片')
      return
    }
    const files = Array.from(list).slice(0, room)
    const next: PhotoDraft[] = []
    for (const f of files) {
      try {
        const dataUrl = await compressChatShot(f)
        next.push({ key: 'n-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8), kind: 'new', dataUrl })
      } catch (e) {
        setErr(e instanceof Error ? e.message : '图片处理失败')
        return
      }
    }
    setPhotos((prev) => [...prev, ...next].slice(0, 5))
    if (fileRef.current) fileRef.current.value = ''
  }

  function removePhoto(key: string) {
    setPhotos((prev) => prev.filter((p) => p.key !== key))
  }

  async function onPickPayQr(list: FileList | null) {
    const f = list?.[0]
    if (!f) return
    setErr('')
    try {
      const dataUrl = await compressChatShot(f)
      setPayQr({ kind: 'new', dataUrl })
    } catch (e) {
      setErr(e instanceof Error ? e.message : '收款码处理失败')
    }
    if (payQrRef.current) payQrRef.current.value = ''
  }

  function clearPayQr() {
    setPayQr((prev) => (prev.kind === 'empty' ? prev : { kind: 'cleared' }))
  }

  async function onSave() {
    setErr('')
    if (!hallNo.trim() || !name.trim() || !region.trim()) {
      setErr('请填写厅号、主播、地区')
      return
    }
    if (payQr.kind !== 'keep' && payQr.kind !== 'new') {
      setErr('请上传收款码')
      return
    }
    if (photos.length > 5) {
      setErr('相片最多 5 张')
      return
    }
    setSaving(true)
    try {
      const payloadPhotos: SaveStreamerPhoto[] = photos.map((p) =>
        p.kind === 'keep' ? { keep: true, id: p.id } : { dataUrl: p.dataUrl },
      )
      let payQrPayload: SaveStreamerPayQr | undefined
      if (payQr.kind === 'new') payQrPayload = { dataUrl: payQr.dataUrl }
      else if (payQr.kind === 'keep') payQrPayload = { keep: true }
      const saved = await saveStreamerProfile({
        hallNo: hallNo.trim(),
        name: name.trim(),
        streamerId: streamerId.trim(),
        liveTime: liveTime.trim(),
        region: region.trim(),
        height: height.trim(),
        weight: weight.trim(),
        type: joinTags(typeTags),
        skills: joinTags(skillTags),
        photos: payloadPhotos,
        payQr: payQrPayload,
      })
      setExisting(saved)
      setPhotos(
        (saved.photos || []).map((ph) => ({
          key: ph.id,
          kind: 'keep' as const,
          id: ph.id,
          url: ph.url,
        })),
      )
      setPayQr(saved.payQrUrl ? { kind: 'keep', url: saved.payQrUrl } : { kind: 'empty' })
      setFlash('已保存')
      window.setTimeout(() => setFlash(null), 1400)
    } catch (e) {
      setErr(toUserError(e, '保存失败，请重试'))
    } finally {
      setSaving(false)
    }
  }

  async function onDelete() {
    if (!existing) return
    if (!window.confirm('确定删除自己的主播资料？')) return
    setSaving(true)
    setErr('')
    try {
      await deleteMyStreamerProfile()
      onBack()
    } catch (e) {
      setErr(toUserError(e, '删除失败，请重试'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="pane">
      <div className="nav">
        <button type="button" aria-label="back" onClick={onBack}>
          {'<'}
        </button>
        <div className="title">{existing ? '编辑资料' : '添加资料'}</div>
        <span className="nav-side" />
      </div>
      <div className="mine-scroll mine-doc settings sp-form">
        {loading ? <div className="mine-card mine-card-plain">加载中…</div> : null}
        {!loading ? (
          <>
            <label className="field-label">
              厅号<span>必填</span>
            </label>
            <input className="textin" value={hallNo} onChange={(e) => setHallNo(e.target.value)} placeholder="例如：503151" />

            <label className="field-label">
              主播<span>必填</span>
            </label>
            <input className="textin" value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：念念" />

            <label className="field-label">
              ID<span>选填</span>
            </label>
            <input className="textin" value={streamerId} onChange={(e) => setStreamerId(e.target.value)} placeholder="平台 ID" />

            <label className="field-label">
              直播时间<span>选填</span>
            </label>
            <input className="textin" value={liveTime} onChange={(e) => setLiveTime(e.target.value)} placeholder="例如：每晚 8–12 点" />

            <label className="field-label">
              地区<span>必填</span>
            </label>
            <input className="textin" value={region} onChange={(e) => setRegion(e.target.value)} placeholder="例如：广州" />

            <label className="field-label">
              身高<span>选填</span>
            </label>
            <input className="textin" value={height} onChange={(e) => setHeight(e.target.value)} placeholder="例如：168cm" />

            <label className="field-label">
              体重<span>选填</span>
            </label>
            <input className="textin" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="例如：48kg" />

            <label className="field-label">
              类型<span>可多选</span>
            </label>
            <ChipPick options={TYPE_TAG_OPTIONS} selected={typeTags} onChange={setTypeTags} />

            <label className="field-label">
              技能<span>可多选</span>
            </label>
            <ChipPick options={SKILL_TAG_OPTIONS} selected={skillTags} onChange={setSkillTags} />

            <label className="field-label">
              上传相片<span>选填，最多 5 张</span>
            </label>
            <div className="sp-photo-grid">
              {photos.map((p) => (
                <div key={p.key} className="sp-photo-cell">
                  <img src={p.kind === 'keep' ? p.url : p.dataUrl} alt="" />
                  <button type="button" className="sp-photo-x" onClick={() => removePhoto(p.key)} aria-label="删除">
                    ×
                  </button>
                </div>
              ))}
              {photos.length < 5 ? (
                <button type="button" className="sp-photo-add" onClick={() => fileRef.current?.click()}>
                  +
                </button>
              ) : null}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => void onPickFiles(e.target.files)}
            />

            <label className="field-label">
              收款码<span>必填，上传收款二维码</span>
            </label>
            <div className="sp-payqr">
              {payQr.kind === 'keep' || payQr.kind === 'new' ? (
                <div className="sp-photo-cell">
                  <img src={payQr.kind === 'keep' ? payQr.url : payQr.dataUrl} alt="收款码" />
                  <button type="button" className="sp-photo-x" onClick={clearPayQr} aria-label="删除收款码">
                    ×
                  </button>
                </div>
              ) : (
                <button type="button" className="sp-photo-add" onClick={() => payQrRef.current?.click()}>
                  +
                </button>
              )}
            </div>
            <input
              ref={payQrRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => void onPickPayQr(e.target.files)}
            />

            {err ? <p className="err">{err}</p> : null}

            <button type="button" className="primary sp-save-btn" disabled={saving} onClick={() => void onSave()}>
              {saving ? '保存中…' : existing ? '更新资料' : '保存资料'}
            </button>
            {existing ? (
              <button type="button" className="mine-logout" disabled={saving} onClick={() => void onDelete()}>
                删除资料
              </button>
            ) : null}
          </>
        ) : null}
      </div>
      {flash ? <div className="toast">{flash}</div> : null}
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


function ProfileAddIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="9" r="3.2" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M5.5 19c1.2-3 3.4-4.5 6.5-4.5s5.3 1.5 6.5 4.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path d="M18 4.5v5M15.5 7H20.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}
function VestIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M8.2 4.5h7.6l1.7 3.2v11.8A2 2 0 0 1 15.5 21.5h-7A2 2 0 0 1 6.5 19.5V7.7L8.2 4.5Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M12 4.5v4.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M9.2 12.2h5.6M9.2 15.4h3.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
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


function ActivityIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4.5 16.5l3.2-4.2 2.8 2.4 4.2-5.6 4.8 7.4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M3.5 19h17" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

function LiushuiIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3.5v10.2M12 13.7l-3.2-3.2M12 13.7l3.2-3.2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5.5 16.5v1.2c0 1 .8 1.8 1.8 1.8h9.4c1 0 1.8-.8 1.8-1.8v-1.2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function RevenueBoardIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4.5 18.5V9.5M9.5 18.5V5.5M14.5 18.5v-6M19.5 18.5V8"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path d="M3.5 18.5h17" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

function PayrollIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4.5" y="5.5" width="15" height="13" rx="2.2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8 10.5h8M8 14h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="16" cy="14" r="1.35" fill="currentColor" />
    </svg>
  )
}

function GuildAdminIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4.5 19.5V8.2L12 4.5l7.5 3.7v11.3"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M9 19.5v-5h6v5" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M9.5 10.5h.01M12 10.5h.01M14.5 10.5h.01" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  )
}

function PromoAdminIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 18.5h14M7.5 18.5V8.5l4.5-3 4.5 3v10"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M10.5 12.5h3M10.5 15.5h3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
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


function HomeworkPage({ onBack }: { onBack: () => void }) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  function copyLine(key: string, text: string) {
    const done = () => {
      setCopiedKey(key)
      window.setTimeout(() => setCopiedKey((cur) => (cur === key ? null : cur)), 1600)
    }
    const w = navigator.clipboard
    if (w && w.writeText) {
      w.writeText(text).then(done, done)
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
        <div className="title">作业文本</div>
        <span className="nav-side" />
      </div>
      <div className="mine-scroll mine-doc">
        <section className="mine-sec">
          <div className="mine-callout">
            <div className="mine-callout-label">💡 小贴士</div>
            <ul className="mine-bullets">
              {homeworkContent.tips.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mine-sec">
          <div className="mine-card mine-card-plain">{homeworkContent.usage}</div>
        </section>

        {homeworkContent.sections.map((sec) => (
          <section className="mine-sec" key={sec.id}>
            <h2 className="mine-sec-title">{sec.title}</h2>
            {sec.style ? (
              <div className="mine-tip" style={{ marginBottom: 10 }}>
                <div className="mine-tip-label">风格说明</div>
                <p>{sec.style}</p>
              </div>
            ) : null}
            <div className="hw-lines">
              {sec.lines.map((line, i) => {
                const key = `${sec.id}-${i}`
                const copied = copiedKey === key
                return (
                  <div className="hw-line" key={key}>
                    <div className="hw-line-text">{line}</div>
                    <button
                      type="button"
                      className="mine-copy"
                      onClick={() => copyLine(key, line)}
                    >
                      {copied ? '已复制' : '复制'}
                    </button>
                  </div>
                )
              })}
            </div>
          </section>
        ))}

        <section className="mine-sec">
          <h2 className="mine-sec-title">范本截图</h2>
          <div className="hw-gallery">
            {homeworkContent.examples.map((src) => (
              <a
                key={src}
                className="hw-gallery-item"
                href={src}
                target="_blank"
                rel="noopener noreferrer"
              >
                <img src={src} alt="作业范本截图" loading="lazy" />
              </a>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}



function PkGuidePage({ onBack }: { onBack: () => void }) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  function copyLine(key: string, text: string) {
    const done = () => {
      setCopiedKey(key)
      window.setTimeout(() => setCopiedKey((cur) => (cur === key ? null : cur)), 1600)
    }
    const w = navigator.clipboard
    if (w && w.writeText) {
      w.writeText(text).then(done, done)
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
        <div className="title">{pkGuideContent.title}</div>
        <span className="nav-side" />
      </div>
      <div className="mine-scroll mine-doc">
        {pkGuideContent.intro ? (
          <section className="mine-sec">
            <div className="mine-card mine-card-plain">{pkGuideContent.intro}</div>
          </section>
        ) : null}

        {pkGuideContent.sections.map((sec) => (
          <section className="mine-sec" key={sec.id}>
            <h2 className="mine-sec-title">{sec.title}</h2>
            {sec.style ? (
              <div className="mine-tip" style={{ marginBottom: 10 }}>
                <div className="mine-tip-label">说明</div>
                <p>{sec.style}</p>
              </div>
            ) : null}
            {sec.image ? (
              <a
                className="hw-gallery-item pk-step-shot"
                href={sec.image}
                target="_blank"
                rel="noopener noreferrer"
              >
                <img src={sec.image} alt={sec.title} loading="lazy" />
              </a>
            ) : null}
            <div className="hw-lines pk-lines">
              {sec.lines.map((line, i) => {
                const key = `${sec.id}-${i}`
                const copied = copiedKey === key
                return (
                  <div className="hw-line pk-line" key={key}>
                    <div className="hw-line-text pk-line-text">{line}</div>
                    <button
                      type="button"
                      className="mine-copy"
                      onClick={() => copyLine(key, line)}
                    >
                      {copied ? '已复制' : '复制'}
                    </button>
                  </div>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}


function PkGuideIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7.2 5.5h3.6v13H7.2zM13.2 5.5h3.6v13h-3.6z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M5 12h14"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <circle cx="12" cy="12" r="2.2" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  )
}



function NewcomerGuidePage({ onBack }: { onBack: () => void }) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  function copyLine(key: string, text: string) {
    const done = () => {
      setCopiedKey(key)
      window.setTimeout(() => setCopiedKey((cur) => (cur === key ? null : cur)), 1600)
    }
    const w = navigator.clipboard
    if (w && w.writeText) {
      w.writeText(text).then(done, done)
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
        <div className="title">{newcomerGuideContent.title}</div>
        <span className="nav-side" />
      </div>
      <div className="mine-scroll mine-doc">
        {newcomerGuideContent.intro ? (
          <section className="mine-sec">
            <div className="mine-card mine-card-plain">{newcomerGuideContent.intro}</div>
          </section>
        ) : null}

        {newcomerGuideContent.sections.map((sec) => (
          <section className="mine-sec" key={sec.id}>
            <h2 className="mine-sec-title">{sec.title}</h2>
            {sec.style ? (
              <div className="mine-tip" style={{ marginBottom: 10 }}>
                <div className="mine-tip-label">说明</div>
                <p>{sec.style}</p>
              </div>
            ) : null}
            <div className="hw-lines">
              {sec.lines.map((line, i) => {
                const key = `${sec.id}-${i}`
                const copied = copiedKey === key
                return (
                  <div className="hw-line" key={key}>
                    <div className="hw-line-text">{line}</div>
                    <button
                      type="button"
                      className="mine-copy"
                      onClick={() => copyLine(key, line)}
                    >
                      {copied ? '已复制' : '复制'}
                    </button>
                  </div>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}


function HomeworkIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 3.8h7.4L17.8 7v13.2A1.8 1.8 0 0 1 16 22H7A1.8 1.8 0 0 1 5.2 20.2V5.6A1.8 1.8 0 0 1 7 3.8Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14.2 3.8V7h3.6"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8.4 11.2h7.2M8.4 14.4h7.2M8.4 17.6h4.4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  )
}



function GameGuidePage({ onBack }: { onBack: () => void }) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  function copyLine(key: string, text: string) {
    const done = () => {
      setCopiedKey(key)
      window.setTimeout(() => setCopiedKey((cur) => (cur === key ? null : cur)), 1600)
    }
    const w = navigator.clipboard
    if (w && w.writeText) {
      w.writeText(text).then(done, done)
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
        <div className="title">
          {gameGuideContent.title}
          <small>{gameGuideContent.subtitle}</small>
        </div>
        <span className="nav-side" />
      </div>
      <div className="mine-scroll mine-doc">
        <section className="mine-sec">
          <div className="mine-callout">
            <div className="mine-callout-label">推荐提示</div>
            <ul className="mine-bullets">
              {gameGuideContent.tips.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          </div>
        </section>

        {gameGuideContent.sections.map((sec) => (
          <section className="mine-sec" key={sec.id}>
            <h2 className="mine-sec-title">{sec.title}</h2>
            {sec.note ? (
              <div className="mine-warn" style={{ marginBottom: 12 }}>
                {sec.note}
              </div>
            ) : null}
            {sec.lines && sec.lines.length > 0 ? (
              <div className="mine-card mine-stage" style={{ marginBottom: 12 }}>
                <ul className="mine-bullets">
                  {sec.lines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {sec.subsections?.map((sub) => (
              <div className="mine-card mine-stage" key={sub.id} style={{ marginBottom: 12 }}>
                <div className="mine-factor-name">{sub.title}</div>
                {sub.note ? (
                  <p className="mine-muted-note" style={{ marginBottom: 8 }}>
                    {sub.note}
                  </p>
                ) : null}
                {sub.copyable ? (
                  <div className="hw-lines" style={{ marginTop: 8 }}>
                    {sub.lines.map((line, i) => {
                      const key = `${sub.id}-${i}`
                      const copied = copiedKey === key
                      return (
                        <div className="hw-line" key={key}>
                          <div className="hw-line-text">{line}</div>
                          <button
                            type="button"
                            className="mine-copy"
                            onClick={() => copyLine(key, line)}
                          >
                            {copied ? '已复制' : '复制'}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <ul className="mine-bullets">
                    {sub.lines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  )
}


function GameGuideIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect
        x="4.5"
        y="6.5"
        width="15"
        height="11"
        rx="2.2"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M9 10.2h.01M15 10.2h.01M10.2 14.2c.5.6 1.1.9 1.8.9s1.3-.3 1.8-.9"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8 6.5V5.2M16 6.5V5.2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M7.2 12H5.2M18.8 12H16.8"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  )
}



function WelfareGuidePage({ onBack }: { onBack: () => void }) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  function copyLine(key: string, text: string) {
    const done = () => {
      setCopiedKey(key)
      window.setTimeout(() => setCopiedKey((cur) => (cur === key ? null : cur)), 1600)
    }
    const w = navigator.clipboard
    if (w && w.writeText) {
      w.writeText(text).then(done, done)
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
        <div className="title">
          {welfareGuideContent.title}
          {welfareGuideContent.subtitle ? <small>{welfareGuideContent.subtitle}</small> : null}
        </div>
        <span className="nav-side" />
      </div>
      <div className="mine-scroll mine-doc">
        {welfareGuideContent.poster ? (
          <section className="mine-sec">
            <a
              className="hw-gallery-item pk-step-shot"
              href={welfareGuideContent.poster}
              target="_blank"
              rel="noopener noreferrer"
            >
              <img src={welfareGuideContent.poster} alt="心动予你 · 福利制度海报" loading="lazy" />
            </a>
          </section>
        ) : null}

        {welfareGuideContent.intro ? (
          <section className="mine-sec">
            <div className="mine-card mine-card-plain">{welfareGuideContent.intro}</div>
          </section>
        ) : null}

        {welfareGuideContent.sections.map((sec) => (
          <section className="mine-sec" key={sec.id}>
            <h2 className="mine-sec-title">{sec.title}</h2>
            {sec.style ? (
              <div className="mine-tip" style={{ marginBottom: 10 }}>
                <div className="mine-tip-label">说明</div>
                <p>{sec.style}</p>
              </div>
            ) : null}
            <div className="hw-lines">
              {sec.lines.map((line, i) => {
                const key = `${sec.id}-${i}`
                const copied = copiedKey === key
                return (
                  <div className="hw-line" key={key}>
                    <div className="hw-line-text">{line}</div>
                    <button
                      type="button"
                      className="mine-copy"
                      onClick={() => copyLine(key, line)}
                    >
                      {copied ? '已复制' : '复制'}
                    </button>
                  </div>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}


function WelfareIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 20.2s-6.8-4.1-6.8-9.2A3.7 3.7 0 0 1 12 7.6a3.7 3.7 0 0 1 6.8 3.4c0 5.1-6.8 9.2-6.8 9.2Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.2 11.2h5.6M10.4 14h3.2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  )
}



function PenaltyGuidePage({ onBack }: { onBack: () => void }) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  function copyLine(key: string, text: string) {
    const done = () => {
      setCopiedKey(key)
      window.setTimeout(() => setCopiedKey((cur) => (cur === key ? null : cur)), 1600)
    }
    const w = navigator.clipboard
    if (w && w.writeText) {
      w.writeText(text).then(done, done)
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
        <div className="title">
          {penaltyGuideContent.title}
          {penaltyGuideContent.subtitle ? <small>{penaltyGuideContent.subtitle}</small> : null}
        </div>
        <span className="nav-side" />
      </div>
      <div className="mine-scroll mine-doc">
        {penaltyGuideContent.intro ? (
          <section className="mine-sec">
            <div className="mine-card mine-card-plain">{penaltyGuideContent.intro}</div>
          </section>
        ) : null}

        {penaltyGuideContent.sections.map((sec) => (
          <section className="mine-sec" key={sec.id}>
            <h2 className="mine-sec-title">{sec.title}</h2>
            {sec.style ? (
              <div className="mine-tip" style={{ marginBottom: 10 }}>
                <div className="mine-tip-label">说明</div>
                <p>{sec.style}</p>
              </div>
            ) : null}
            <div className="hw-lines">
              {sec.lines.map((line, i) => {
                const key = `${sec.id}-${i}`
                const copied = copiedKey === key
                return (
                  <div className="hw-line" key={key}>
                    <div className="hw-line-text">{line}</div>
                    <button
                      type="button"
                      className="mine-copy"
                      onClick={() => copyLine(key, line)}
                    >
                      {copied ? '已复制' : '复制'}
                    </button>
                  </div>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}


function PenaltyIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8.2" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M12 7.8v5.2M12 16.2h.01"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  )
}



function numInputDisplay(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return ''
  return String(v)
}

function parseNumInput(raw: string): number | null {
  const t = raw.trim()
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

function rangeLabels(
  batch: LiushuiBatchSummary,
  range: LiushuiDateRange | null,
  listItem?: LiushuiBatchListItem,
): { start: string; end: string } {
  const start =
    range?.startDateLabel ||
    listItem?.startDateLabel ||
    range?.startDate ||
    batch.startDate ||
    ''
  const end =
    range?.endDateLabel ||
    listItem?.endDateLabel ||
    range?.endDate ||
    batch.endDate ||
    ''
  return { start, end }
}


function sortUserFlowRows(rows: LiushuiPreviewRow[]): LiushuiPreviewRow[] {
  return [...rows].sort((a, b) => {
    const av =
      a.totalFlowAmount != null && Number.isFinite(a.totalFlowAmount)
        ? a.totalFlowAmount
        : -Infinity
    const bv =
      b.totalFlowAmount != null && Number.isFinite(b.totalFlowAmount)
        ? b.totalFlowAmount
        : -Infinity
    if (bv !== av) return bv - av
    return (a.userPlatformId || '').localeCompare(b.userPlatformId || '', 'zh')
  })
}


/** streamerId (+ linked IDs) → 所属厅号 from 注册列表 / streamer_profiles */
const STREAMER_HALL_EMPTY = '__empty__'

function buildHallNoByStreamerId(profiles: StreamerProfile[]): Record<string, string> {
  const map: Record<string, string> = {}
  // Pass 1: primary streamerId claims hallNo
  for (const p of profiles) {
    const primary = (p.streamerId || '').trim()
    if (!primary) continue
    if (!(primary in map)) map[primary] = (p.hallNo || '').trim()
  }
  // Pass 2: linked IDs resolve to primary profile hallNo if free
  for (const p of profiles) {
    const primary = (p.streamerId || '').trim()
    if (!primary) continue
    const hall = primary in map ? map[primary] : (p.hallNo || '').trim()
    for (const raw of [p.linkedId1, p.linkedId2, p.linkedId3]) {
      const id = (raw || '').trim()
      if (!id || id === primary) continue
      if (!(id in map)) map[id] = hall
    }
  }
  return map
}

function LiushuiBatchPanel({
  meta,
  expanded,
  onToggle,
  onDelete,
  uploadBusy,
  initialRows,
  initialRange,
  onStatus,
  hallNoByStreamerId,
}: {
  meta: LiushuiBatchListItem
  expanded: boolean
  onToggle: () => void
  onDelete: () => void
  uploadBusy: boolean
  /** Prefill rows (e.g. right after upload) so we skip a fetch */
  initialRows?: LiushuiPreviewRow[]
  initialRange?: LiushuiDateRange | null
  onStatus: (msg: { err?: string; ok?: string }) => void
  /** Streamer-kind: profile 所属厅号 by streamerId (and linked IDs) */
  hallNoByStreamerId: Record<string, string>
}) {
  const cached0 = getLiushuiBatchCache(meta.id)
  const seedRows = cached0?.rows ?? initialRows
  const seedRange = cached0 ? cached0.range : initialRange || null
  const seedLoaded = !!(cached0 || (initialRows && initialRows.length))

  const [batch, setBatch] = useState<LiushuiBatchSummary>(() =>
    cached0 ? { ...meta, ...cached0.batch } : meta,
  )
  const [rows, setRows] = useState<LiushuiPreviewRow[]>(() => {
    const seed = seedRows || []
    return (meta.kind || '') === 'user' ? sortUserFlowRows(seed) : seed
  })
  const [range, setRange] = useState<LiushuiDateRange | null>(() => seedRange)
  const [hostWagePerHour, setHostWagePerHour] = useState<number | null>(() =>
    cached0 ? cached0.hostWagePerHour : meta.hostWagePerHour,
  )
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [loaded, setLoaded] = useState(seedLoaded)
  /** Once opened, keep body mounted (display:none when collapsed) so state/edits survive. */
  const [everOpened, setEverOpened] = useState(
    !!expanded || seedLoaded,
  )
  /** '' = 全部; user: Excel 靓号厅ID; streamer: profile 所属厅号 (or STREAMER_HALL_EMPTY) */
  const [hallFilter, setHallFilter] = useState('')

  // Persist upload seed into module cache (survives page unmount)
  useEffect(() => {
    if (cached0) return
    if (initialRows && initialRows.length) {
      const cachedRows =
        (meta.kind || '') === 'user' ? sortUserFlowRows(initialRows) : initialRows
      setLiushuiBatchCache(meta.id, {
        batch: meta,
        rows: cachedRows,
        range: initialRange || null,
        hostWagePerHour: meta.hostWagePerHour,
      })
      setRows(cachedRows)
    }
    // only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (expanded) setEverOpened(true)
  }, [expanded])

  // Sync meta from parent list refresh (filename/rowCount/labels) without clobbering dirty edits
  useEffect(() => {
    setBatch((prev) => ({
      ...prev,
      ...meta,
      hostWagePerHour: dirty ? prev.hostWagePerHour : meta.hostWagePerHour,
    }))
    if (!dirty) setHostWagePerHour(meta.hostWagePerHour)
  }, [meta, dirty])

  useEffect(() => {
    if (!expanded) {
      // Collapse mid-fetch: clear spinner so it cannot stick
      setLoading(false)
      return
    }
    if (loaded) return
    // Cache hit (e.g. filled by prefetch or prior visit) — hydrate with no spinner
    const hit = getLiushuiBatchCache(meta.id)
    if (hit) {
      setBatch((prev) => ({ ...prev, ...hit.batch }))
      setRows(
        (hit.batch.kind || meta.kind) === 'user' ? sortUserFlowRows(hit.rows) : hit.rows,
      )
      setRange(hit.range)
      setHostWagePerHour(hit.hostWagePerHour)
      setDirty(false)
      setLoaded(true)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const entry = await loadLiushuiBatchCached(meta.id, fetchLiushuiBatch)
        if (cancelled) return
        setBatch(entry.batch)
        setRows(
          (entry.batch.kind || meta.kind) === 'user'
            ? sortUserFlowRows(entry.rows)
            : entry.rows,
        )
        setRange(entry.range)
        setHostWagePerHour(entry.hostWagePerHour)
        setDirty(false)
        setLoaded(true)
      } catch (e) {
        if (!cancelled) {
          onStatus({ err: e instanceof Error ? e.message : '加载批次失败' })
          // Clear loading so expand can retry; do not leave spinner stuck
          setLoaded(false)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // Intentionally omit `loading` from deps — including it cancelled the in-flight
    // fetch on setLoading(true) and left the spinner stuck.
  }, [expanded, loaded, meta.id, onStatus])

  /** Always show persisted snapshot fields — never live-preview from profiles/inputs. */
  function displayPointRate(r: LiushuiPreviewRow): string {
    return r.pointRate?.trim() ? r.pointRate : '—'
  }

  function patchRow(id: string, patch: Partial<LiushuiPreviewRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
    setDirty(true)
  }

  async function onComputeWages() {
    if (saving || uploadBusy) return
    setSaving(true)
    onStatus({ err: '', ok: '' })
    try {
      const savedBatch = await updateLiushuiBatch(batch.id, { hostWagePerHour })
      setBatch(savedBatch)
      setHostWagePerHour(savedBatch.hostWagePerHour)
      const saved = rows.length
        ? await saveLiushuiRows(
            rows.map((r) => ({
              id: r.id,
              hostHours: r.hostHours,
              micHours: r.micHours,
              rewardYuan: r.rewardYuan,
              fineYuan: r.fineYuan,
              addFlowYuan: r.addFlowYuan,
              deductFlowYuan: r.deductFlowYuan,
            })),
          )
        : []
      const nextRows = saved.length
        ? (() => {
            const byId = new Map(saved.map((r) => [r.id, r]))
            return rows.map((r) => byId.get(r.id) || r)
          })()
        : rows
      setRows(nextRows)
      setDirty(false)
      setLiushuiBatchCache(batch.id, {
        batch: savedBatch,
        rows: nextRows,
        range,
        hostWagePerHour: savedBatch.hostWagePerHour,
      })
      onStatus({ ok: `已计算工资并保存（${saved.length || rows.length} 行）· ${batch.filename}` })
    } catch (e) {
      onStatus({ err: e instanceof Error ? e.message : '计算失败，请重试' })
    } finally {
      setSaving(false)
    }
  }

  const labels = rangeLabels(batch, range, meta)
  const headerRange =
    labels.start && labels.end
      ? `${labels.start} ~ ${labels.end}`
      : labels.start || labels.end || ''
  const isUserKind = (batch.kind || meta.kind) === 'user'
  const headerSub = [
    isUserKind ? (headerRange ? `整表 ${headerRange}` : '整表') : headerRange,
    isUserKind
      ? (batch.personCount || batch.rowCount)
        ? `${batch.personCount || batch.rowCount} 人`
        : ''
      : batch.rowCount
        ? `${batch.rowCount} 人`
        : '',
  ]
    .filter(Boolean)
    .join(' · ')

  function streamerRowHallNo(r: LiushuiPreviewRow): string {
    const id = (r.userPlatformId || '').trim()
    if (!id) return ''
    return (hallNoByStreamerId[id] || '').trim()
  }

  const hallOptions = useMemo(() => {
    if (!isUserKind) return [] as string[]
    const set = new Set<string>()
    for (const r of rows) {
      const h = (r.hallNo || '').trim()
      if (h) set.add(h)
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'zh', { numeric: true }))
  }, [isUserKind, rows])

  const streamerHallOptions = useMemo(() => {
    if (isUserKind) return { halls: [] as string[], hasEmpty: false }
    const set = new Set<string>()
    let hasEmpty = false
    for (const r of rows) {
      const h = streamerRowHallNo(r)
      if (h) set.add(h)
      else hasEmpty = true
    }
    return {
      halls: [...set].sort((a, b) => a.localeCompare(b, 'zh', { numeric: true })),
      hasEmpty,
    }
  }, [isUserKind, rows, hallNoByStreamerId])

  const displayRows = useMemo(() => {
    if (!hallFilter) return rows
    if (isUserKind) {
      return rows.filter((r) => (r.hallNo || '').trim() === hallFilter)
    }
    return rows.filter((r) => {
      const h = streamerRowHallNo(r)
      if (hallFilter === STREAMER_HALL_EMPTY) return !h
      return h === hallFilter
    })
  }, [isUserKind, rows, hallFilter, hallNoByStreamerId])

  return (
    <div className={`mine-liushui-fold${expanded ? ' is-open' : ''}`}>
      <div className="mine-liushui-fold-head-row">
        <button
          type="button"
          className="mine-liushui-fold-head"
          aria-expanded={expanded}
          onClick={onToggle}
        >
          <span className="mine-liushui-fold-chevron" aria-hidden="true">
            {expanded ? '▾' : '▸'}
          </span>
          <span className="mine-liushui-fold-title">
            <span className="mine-liushui-fold-name">{batch.filename || '未命名.xlsx'}</span>
            {headerSub ? <span className="mine-liushui-fold-meta">{headerSub}</span> : null}
          </span>
        </button>
        <button
          type="button"
          className="mine-liushui-fold-del"
          disabled={uploadBusy || saving || loading || deleting}
          onClick={(e) => {
            e.stopPropagation()
            if (!window.confirm('确定删除这份流水？')) return
            void (async () => {
              setDeleting(true)
              onStatus({ err: '', ok: '' })
              try {
                await deleteLiushuiBatch(meta.id)
                invalidateLiushuiBatchCache(meta.id)
                onDelete()
                onStatus({ ok: '已删除该批次' })
              } catch (err) {
                onStatus({ err: err instanceof Error ? err.message : '删除失败' })
              } finally {
                setDeleting(false)
              }
            })()
          }}
        >
          {deleting ? '删除中…' : '删除'}
        </button>
      </div>
      {everOpened ? (
        <div
          className="mine-liushui-fold-body"
          hidden={!expanded}
          aria-hidden={!expanded}
        >
          {loading && !rows.length ? (
            <p className="mine-admin-hint">加载中…</p>
          ) : (
            <>
              <div className="mine-liushui-summary">
                {labels.start ? <div>开始日期：{labels.start}</div> : null}
                {labels.end ? <div>结束日期：{labels.end}</div> : null}
                <div>
                  批次：{batch.label} · {batch.filename}
                  {isUserKind ? ' · 用户流水' : ' · 主播流水'}
                </div>
                <div>
                  {isUserKind
                    ? `条数：${batch.rowCount} · 人数：${batch.personCount || batch.rowCount}`
                    : `人数：${batch.rowCount}`}
                  {batch.uploadedAt ? ` · ${formatCreatedAt(batch.uploadedAt)}` : ''}
                </div>
              </div>
              {isUserKind ? null : (
              <div className="mine-liushui-wage">
                <label htmlFor={`mine-liushui-host-wage-${batch.id}`}>主持工资：</label>
                <input
                  id={`mine-liushui-host-wage-${batch.id}`}
                  className="mine-liushui-input"
                  type="text"
                  inputMode="decimal"
                  value={numInputDisplay(hostWagePerHour)}
                  disabled={uploadBusy || saving || loading}
                  onChange={(e) => {
                    setHostWagePerHour(parseNumInput(e.target.value))
                    setDirty(true)
                  }}
                  aria-label="主持工资"
                />
                <span>/小时</span>
              </div>
              )}
              {isUserKind && rows.length ? (
                <div className="mine-liushui-hall-filter" role="group" aria-label="靓号厅ID筛选">
                  <div className="mine-liushui-hall-filter-label">靓号厅ID</div>
                  <div className="chip-row mine-liushui-hall-chips">
                    <button
                      type="button"
                      className={'chip' + (!hallFilter ? ' on' : '')}
                      aria-pressed={!hallFilter}
                      onClick={() => setHallFilter('')}
                    >
                      全部
                    </button>
                    {hallOptions.map((h) => (
                      <button
                        key={h}
                        type="button"
                        className={'chip' + (hallFilter === h ? ' on' : '')}
                        aria-pressed={hallFilter === h}
                        onClick={() => setHallFilter(h)}
                      >
                        {h}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {!isUserKind && rows.length ? (
                <div className="mine-liushui-hall-filter" role="group" aria-label="所属厅号筛选">
                  <div className="mine-liushui-hall-filter-label">所属厅号</div>
                  <div className="chip-row mine-liushui-hall-chips">
                    <button
                      type="button"
                      className={'chip' + (!hallFilter ? ' on' : '')}
                      aria-pressed={!hallFilter}
                      onClick={() => setHallFilter('')}
                    >
                      全部
                    </button>
                    {streamerHallOptions.halls.map((h) => (
                      <button
                        key={h}
                        type="button"
                        className={'chip' + (hallFilter === h ? ' on' : '')}
                        aria-pressed={hallFilter === h}
                        onClick={() => setHallFilter(h)}
                      >
                        {h}
                      </button>
                    ))}
                    {streamerHallOptions.hasEmpty ? (
                      <button
                        type="button"
                        className={
                          'chip' + (hallFilter === STREAMER_HALL_EMPTY ? ' on' : '')
                        }
                        aria-pressed={hallFilter === STREAMER_HALL_EMPTY}
                        onClick={() => setHallFilter(STREAMER_HALL_EMPTY)}
                      >
                        未填厅号
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {rows.length ? (
                <div className="mine-liushui-table-wrap">
                  {isUserKind ? (
                  <table className="mine-liushui-table mine-liushui-table-edit">
                    <thead>
                      <tr>
                        <th>用户昵称</th>
                        <th>ID</th>
                        <th>总流水(元)</th>
                        <th>贡献排名</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayRows.map((r, i) => (
                        <tr key={r.id}>
                          <td>{r.nickname || '—'}</td>
                          <td>{r.userPlatformId || '—'}</td>
                          <td>{r.totalFlowText}</td>
                          <td>{i + 1}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  ) : (
                  <table className="mine-liushui-table mine-liushui-table-edit">
                    <thead>
                      <tr>
                        <th>用户昵称</th>
                        <th>ID</th>
                        <th>总流水(元)</th>
                        <th>添加流水</th>
                        <th>扣除流水</th>
                        <th>点位(只读)</th>
                        <th>主持时长</th>
                        <th>麦序时长</th>
                        <th>奖励</th>
                        <th>罚款</th>
                        <th>实际流水</th>
                        <th>基础工资</th>
                        <th>主持工资</th>
                        <th>总工资</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayRows.map((r) => (
                        <tr key={r.id}>
                          <td>{r.nickname}</td>
                          <td>{r.userPlatformId}</td>
                          <td>{r.totalFlowText}</td>
                          <td>
                            <input
                              className="mine-liushui-input"
                              type="text"
                              inputMode="decimal"
                              value={numInputDisplay(r.addFlowYuan)}
                              disabled={uploadBusy || saving}
                              onChange={(e) =>
                                patchRow(r.id, { addFlowYuan: parseNumInput(e.target.value) })
                              }
                              aria-label="添加流水"
                            />
                          </td>
                          <td>
                            <input
                              className="mine-liushui-input"
                              type="text"
                              inputMode="decimal"
                              value={numInputDisplay(r.deductFlowYuan)}
                              disabled={uploadBusy || saving}
                              onChange={(e) =>
                                patchRow(r.id, { deductFlowYuan: parseNumInput(e.target.value) })
                              }
                              aria-label="扣除流水"
                            />
                          </td>
                          <td className="mine-liushui-readonly" aria-label="点位">
                            {displayPointRate(r)}
                          </td>
                          <td>
                            <input
                              className="mine-liushui-input"
                              type="text"
                              inputMode="decimal"
                              value={numInputDisplay(r.hostHours)}
                              disabled={uploadBusy || saving}
                              onChange={(e) =>
                                patchRow(r.id, { hostHours: parseNumInput(e.target.value) })
                              }
                              aria-label="主持时长"
                            />
                          </td>
                          <td>
                            <input
                              className="mine-liushui-input"
                              type="text"
                              inputMode="decimal"
                              value={numInputDisplay(r.micHours)}
                              disabled={uploadBusy || saving}
                              onChange={(e) =>
                                patchRow(r.id, { micHours: parseNumInput(e.target.value) })
                              }
                              aria-label="麦序时长"
                            />
                          </td>
                          <td>
                            <input
                              className="mine-liushui-input"
                              type="text"
                              inputMode="decimal"
                              value={numInputDisplay(r.rewardYuan)}
                              disabled={uploadBusy || saving}
                              onChange={(e) =>
                                patchRow(r.id, { rewardYuan: parseNumInput(e.target.value) })
                              }
                              aria-label="奖励"
                            />
                          </td>
                          <td>
                            <input
                              className="mine-liushui-input"
                              type="text"
                              inputMode="decimal"
                              value={numInputDisplay(r.fineYuan)}
                              disabled={uploadBusy || saving}
                              onChange={(e) =>
                                patchRow(r.id, { fineYuan: parseNumInput(e.target.value) })
                              }
                              aria-label="罚款"
                            />
                          </td>
                          <td className="mine-liushui-readonly" aria-label="实际流水">
                            {formatMoney2(r.actualFlow)}
                          </td>
                          <td className="mine-liushui-readonly" aria-label="基础工资">
                            {formatMoney2(r.baseWage)}
                          </td>
                          <td className="mine-liushui-readonly" aria-label="主持工资">
                            {formatMoney2(r.hostWage)}
                          </td>
                          <td className="mine-liushui-readonly" aria-label="总工资">
                            {formatMoney2(r.totalWage)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  )}
                  {batch.rowCount > rows.length ? (
                    <p className="mine-admin-hint">
                      {isUserKind
                        ? `预览前 ${rows.length} 条（共 ${batch.rowCount} 条）`
                        : `预览前 ${rows.length} 人（共 ${batch.rowCount} 人）`}
                    </p>
                  ) : null}
                </div>
              ) : !loading ? (
                <p className="mine-admin-hint">暂无行数据</p>
              ) : null}
              {isUserKind ? null : (
              <button
                type="button"
                className="mine-liushui-save"
                disabled={uploadBusy || saving || loading}
                onClick={() => void onComputeWages()}
              >
                {saving ? '计算中…' : dirty ? '计算工资' : '重新计算'}
              </button>
              )}
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}

function AdminLiushuiPage({ onBack }: { onBack: () => void }) {
  const streamerInputRef = useRef<HTMLInputElement>(null)
  const userInputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [busyKind, setBusyKind] = useState<'streamer' | 'user' | null>(null)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')
  const [batches, setBatches] = useState<LiushuiBatchListItem[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  /** Prefill for a just-uploaded batch so panel skips refetch */
  const [seedById, setSeedById] = useState<
    Record<string, { rows: LiushuiPreviewRow[]; range: LiushuiDateRange }>
  >({})
  /** streamerId → 所属厅号 from 注册列表 (for streamer batch hall filter) */
  const [hallNoByStreamerId, setHallNoByStreamerId] = useState<Record<string, string>>(
    {},
  )

  const setStatus = useRef((msg: { err?: string; ok?: string }) => {
    if (msg.err !== undefined) setErr(msg.err)
    if (msg.ok !== undefined) setOk(msg.ok)
  }).current

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const list = await fetchLiushuiBatches()
        if (cancelled) return
        setBatches(list)
        if (list.length) setExpandedId(list[0].id)
        // Background prefetch so expand rarely shows 加载中
        prefetchLiushuiBatches(
          list.map((b) => b.id),
          fetchLiushuiBatch,
        )
      } catch {
        /* optional list prefetch — ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const profiles = await fetchStreamerProfiles()
        if (cancelled) return
        setHallNoByStreamerId(buildHallNoByStreamerId(profiles))
      } catch {
        /* hall filter optional — ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function onPick(file: File | null, kind: 'streamer' | 'user') {
    if (!file || busy) return
    const name = file.name.toLowerCase()
    if (!name.endsWith('.xlsx') && !name.endsWith('.xls')) {
      setErr('请选择 .xlsx 或 .xls 文件')
      setOk('')
      return
    }
    setBusy(true)
    setBusyKind(kind)
    setErr('')
    setOk('')
    try {
      const out = await uploadLiushuiExcel(file, kind)
      let list: LiushuiBatchListItem[]
      try {
        list = await fetchLiushuiBatches()
      } catch {
        list = [
          {
            ...out.batch,
            startDateLabel: out.range.startDateLabel,
            endDateLabel: out.range.endDateLabel,
          },
          ...batches.filter((b) => b.id !== out.batch.id),
        ]
      }
      setBatches(list)
      const seededRows =
        kind === 'user' ? sortUserFlowRows(out.rows) : out.rows
      setSeedById((prev) => ({
        ...prev,
        [out.batch.id]: { rows: seededRows, range: out.range },
      }))
      setLiushuiBatchCache(out.batch.id, {
        batch: out.batch,
        rows: seededRows,
        range: out.range,
        hostWagePerHour: out.batch.hostWagePerHour,
      })
      setExpandedId(out.batch.id)
      setOk(
        kind === 'user'
          ? `已按整表按ID合并为 ${out.batch.personCount || out.rowCount} 人（原始礼物 ${out.rawGiftCount} 条，非按天）`
          : `主播流水上传成功，共 ${out.rowCount} 人（已按注册主播/关联ID汇总）`,
      )
    } catch (e) {
      setErr(e instanceof Error ? e.message : '上传失败，请重试')
    } finally {
      setBusy(false)
      setBusyKind(null)
      if (streamerInputRef.current) streamerInputRef.current.value = ''
      if (userInputRef.current) userInputRef.current.value = ''
    }
  }

  return (
    <div className="pane">
      <div className="nav">
        <button type="button" aria-label="back" onClick={onBack}>
          {'<'}
        </button>
        <div className="title">上传流水</div>
        <span className="nav-side" />
      </div>
      <div className="mine-scroll mine-doc">
        <section className="mine-sec">
          <h2 className="mine-sec-title">上周流水</h2>
          <p className="mine-admin-hint">
            上传上周流水 Excel（.xlsx / .xls，仅解析入库，不保存原文件）。每次上传新增一个批次面板（可折叠，折叠只隐藏不重算）。主播流水按注册列表主播身份汇总并可计算工资；用户流水按用户汇总，展示排名/ID/用户昵称/总流水（按总流水降序）。
          </p>
          <input
            ref={streamerInputRef}
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            className="mine-liushui-file"
            onChange={(e) => void onPick(e.target.files?.[0] || null, 'streamer')}
          />
          <input
            ref={userInputRef}
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            className="mine-liushui-file"
            onChange={(e) => void onPick(e.target.files?.[0] || null, 'user')}
          />
          <div className="mine-liushui-upload-row">
            <button
              type="button"
              className="mine-liushui-upload"
              disabled={busy}
              onClick={() => streamerInputRef.current?.click()}
            >
              {busy && busyKind === 'streamer' ? '上传中…' : '上传上周主播流水'}
            </button>
            <button
              type="button"
              className="mine-liushui-upload"
              disabled={busy}
              onClick={() => userInputRef.current?.click()}
            >
              {busy && busyKind === 'user' ? '上传中…' : '上传上周用户流水'}
            </button>
          </div>
          {err ? (
            <div className="mine-admin-hint" style={{ color: '#e8a0a0' }}>
              {err}
            </div>
          ) : null}
          {ok ? <div className="mine-admin-ok">{ok}</div> : null}
          <div className="mine-liushui-folds">
            {batches.map((b) => (
              <LiushuiBatchPanel
                key={b.id}
                meta={b}
                expanded={expandedId === b.id}
                onToggle={() =>
                  setExpandedId((cur) => (cur === b.id ? null : b.id))
                }
                onDelete={() => {
                  invalidateLiushuiBatchCache(b.id)
                  setBatches((prev) => prev.filter((x) => x.id !== b.id))
                  setSeedById((prev) => {
                    const next = { ...prev }
                    delete next[b.id]
                    return next
                  })
                  setExpandedId((cur) => (cur === b.id ? null : cur))
                }}
                uploadBusy={busy}
                initialRows={seedById[b.id]?.rows}
                initialRange={seedById[b.id]?.range}
                onStatus={setStatus}
                hallNoByStreamerId={hallNoByStreamerId}
              />
            ))}
            {!batches.length ? (
              <p className="mine-admin-hint">暂无上传记录，请先上传主播或用户流水。</p>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  )
}

function ActivityBatchPanel({
  meta,
  expanded,
  onToggle,
  onDelete,
  uploadBusy,
  initialRows,
  initialRange,
  onStatus,
}: {
  meta: ActivityBatchListItem
  expanded: boolean
  onToggle: () => void
  onDelete: () => void
  uploadBusy: boolean
  initialRows?: ActivityPreviewRow[]
  initialRange?: ActivityDateRange
  onStatus: (msg: { err?: string; ok?: string }) => void
}) {
  const [batch, setBatch] = useState(meta)
  const [rows, setRows] = useState<ActivityPreviewRow[]>(initialRows || [])
  const [range, setRange] = useState<ActivityDateRange | null>(initialRange || null)
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const loadedOnce = useRef(!!initialRows)

  useEffect(() => {
    setBatch(meta)
  }, [meta])

  useEffect(() => {
    if (!expanded || loadedOnce.current) return
    let cancelled = false
    setLoading(true)
    void fetchActivityBatch(meta.id)
      .then((out) => {
        if (cancelled) return
        setBatch({
          ...out.batch,
          startDateLabel: out.range.startDateLabel || meta.startDateLabel,
          endDateLabel: out.range.endDateLabel || meta.endDateLabel,
        })
        setRows(out.rows)
        setRange(out.range)
        loadedOnce.current = true
      })
      .catch((e) => {
        if (!cancelled) {
          onStatus({ err: e instanceof Error ? e.message : '加载失败' })
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [expanded, meta.id])

  const labels = {
    start:
      range?.startDateLabel ||
      meta.startDateLabel ||
      range?.startDate ||
      batch.startDate ||
      '',
    end:
      range?.endDateLabel ||
      meta.endDateLabel ||
      range?.endDate ||
      batch.endDate ||
      '',
  }
  const headerRange =
    labels.start && labels.end
      ? `${labels.start} ~ ${labels.end}`
      : labels.start || labels.end || ''
  const headerSub = [headerRange, batch.rowCount ? `${batch.rowCount} 人` : '']
    .filter(Boolean)
    .join(' · ')

  return (
    <div className={`mine-liushui-fold${expanded ? ' is-open' : ''}`}>
      <div className="mine-liushui-fold-head-row">
        <button
          type="button"
          className="mine-liushui-fold-head"
          aria-expanded={expanded}
          onClick={onToggle}
        >
          <span className="mine-liushui-fold-chevron" aria-hidden="true">
            {expanded ? '▾' : '▸'}
          </span>
          <span className="mine-liushui-fold-title">
            <span className="mine-liushui-fold-name">{batch.filename || '未命名.xlsx'}</span>
            {headerSub ? <span className="mine-liushui-fold-meta">{headerSub}</span> : null}
          </span>
        </button>
        <button
          type="button"
          className="mine-liushui-fold-del"
          disabled={uploadBusy || loading || deleting}
          onClick={(e) => {
            e.stopPropagation()
            if (!window.confirm('确定删除这份活跃度？')) return
            void (async () => {
              setDeleting(true)
              onStatus({ err: '', ok: '' })
              try {
                await deleteActivityBatch(meta.id)
                onDelete()
                onStatus({ ok: '已删除该批次' })
              } catch (err) {
                onStatus({ err: err instanceof Error ? err.message : '删除失败' })
              } finally {
                setDeleting(false)
              }
            })()
          }}
        >
          {deleting ? '…' : '删除'}
        </button>
      </div>
      {expanded ? (
        <div className="mine-liushui-fold-body">
          {loading ? <p className="mine-admin-hint">加载中…</p> : null}
          {!loading && rows.length ? (
            <div className="mine-liushui-table-wrap">
              <table className="mine-liushui-table mine-liushui-table-edit">
                <thead>
                  <tr>
                    <th>主播昵称</th>
                    <th>主播ID</th>
                    <th>打招呼人数</th>
                    <th>打招呼信息数量</th>
                    <th>有效作业</th>
                    <th>有效回复</th>
                    <th>动态广场</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>{r.nickname || '—'}</td>
                      <td>{r.streamerId || '—'}</td>
                      <td>{r.greetPeople}</td>
                      <td>{r.greetMsgs}</td>
                      <td>{r.strangerGreetPeople}</td>
                      <td>{r.strangerReplyPeople}</td>
                      <td>{r.plazaPosts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : !loading ? (
            <p className="mine-admin-hint">暂无行数据</p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function AdminActivityPage({ onBack }: { onBack: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')
  const [batches, setBatches] = useState<ActivityBatchListItem[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [seedById, setSeedById] = useState<
    Record<string, { rows: ActivityPreviewRow[]; range: ActivityDateRange }>
  >({})

  const setStatus = useRef((msg: { err?: string; ok?: string }) => {
    if (msg.err !== undefined) setErr(msg.err)
    if (msg.ok !== undefined) setOk(msg.ok)
  }).current

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const list = await fetchActivityBatches()
        if (cancelled) return
        setBatches(list)
        if (list.length) setExpandedId(list[0].id)
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function onPick(file: File | null) {
    if (!file || busy) return
    const name = file.name.toLowerCase()
    if (!name.endsWith('.xlsx') && !name.endsWith('.xls')) {
      setErr('请选择 .xlsx 或 .xls 文件')
      setOk('')
      return
    }
    setBusy(true)
    setErr('')
    setOk('')
    try {
      const out = await uploadActivityExcel(file)
      let list: ActivityBatchListItem[]
      try {
        list = await fetchActivityBatches()
      } catch {
        list = [
          {
            ...out.batch,
            startDateLabel: out.range.startDateLabel,
            endDateLabel: out.range.endDateLabel,
          },
          ...batches.filter((b) => b.id !== out.batch.id),
        ]
      }
      setBatches(list)
      setSeedById((prev) => ({
        ...prev,
        [out.batch.id]: { rows: out.rows, range: out.range },
      }))
      setExpandedId(out.batch.id)
      setOk(`活跃度上传成功，共 ${out.rowCount} 人（已按主播ID汇总）`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : '上传失败，请重试')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="pane">
      <div className="nav">
        <button type="button" aria-label="back" onClick={onBack}>
          {'<'}
        </button>
        <div className="title">上传活跃度数据</div>
        <span className="nav-side" />
      </div>
      <div className="mine-scroll mine-doc">
        <section className="mine-sec">
          <h2 className="mine-sec-title">上周活跃度</h2>
          <p className="mine-admin-hint">
            上传上周活跃度 Excel（.xlsx / .xls，仅解析入库，不保存原文件）。按主播ID合并求和；表头需含
            打招呼人数 / 打招呼信息数量 / 主播向陌生人打招呼人数 / 陌生人回复人数 /
            主播发布动态广场动态数。日期范围取表内最小～最大日期。
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            className="mine-liushui-file"
            onChange={(e) => void onPick(e.target.files?.[0] || null)}
          />
          <div className="mine-liushui-upload-row">
            <button
              type="button"
              className="mine-liushui-upload"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              {busy ? '上传中…' : '上传上周活跃度'}
            </button>
          </div>
          {err ? (
            <div className="mine-admin-hint" style={{ color: '#e8a0a0' }}>
              {err}
            </div>
          ) : null}
          {ok ? <div className="mine-admin-ok">{ok}</div> : null}
          <div className="mine-liushui-folds">
            {batches.map((b) => (
              <ActivityBatchPanel
                key={b.id}
                meta={b}
                expanded={expandedId === b.id}
                onToggle={() => setExpandedId((cur) => (cur === b.id ? null : b.id))}
                onDelete={() => {
                  setBatches((prev) => prev.filter((x) => x.id !== b.id))
                  setSeedById((prev) => {
                    const next = { ...prev }
                    delete next[b.id]
                    return next
                  })
                  setExpandedId((cur) => (cur === b.id ? null : cur))
                }}
                uploadBusy={busy}
                initialRows={seedById[b.id]?.rows}
                initialRange={seedById[b.id]?.range}
                onStatus={setStatus}
              />
            ))}
            {!batches.length ? (
              <p className="mine-admin-hint">暂无上传记录，请先上传活跃度数据。</p>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  )
}

function CommissionIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect
        x="4"
        y="3.5"
        width="16"
        height="17"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

function CommissionBatchPanel({
  meta,
  expanded,
  onToggle,
  onDelete,
  uploadBusy,
  initialRows,
  initialRange,
  onStatus,
}: {
  meta: CommissionBatchListItem
  expanded: boolean
  onToggle: () => void
  onDelete: () => void
  uploadBusy: boolean
  initialRows?: CommissionPreviewRow[]
  initialRange?: CommissionDateRange
  onStatus: (msg: { err?: string; ok?: string }) => void
}) {
  const [batch, setBatch] = useState(meta)
  const [rows, setRows] = useState<CommissionPreviewRow[]>(initialRows || [])
  const [range, setRange] = useState<CommissionDateRange | null>(initialRange || null)
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const loadedOnce = useRef(!!initialRows)

  useEffect(() => {
    setBatch(meta)
  }, [meta])

  useEffect(() => {
    if (!expanded || loadedOnce.current) return
    let cancelled = false
    setLoading(true)
    void fetchCommissionBatch(meta.id)
      .then((out) => {
        if (cancelled) return
        setBatch({
          ...out.batch,
          startDateLabel: out.range.startDateLabel || meta.startDateLabel,
          endDateLabel: out.range.endDateLabel || meta.endDateLabel,
        })
        setRows(out.rows)
        setRange(out.range)
        loadedOnce.current = true
      })
      .catch((e) => {
        if (!cancelled) {
          onStatus({ err: e instanceof Error ? e.message : '加载失败' })
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [expanded, meta.id])

  const labels = {
    start:
      range?.startDateLabel ||
      meta.startDateLabel ||
      range?.startDate ||
      batch.startDate ||
      '',
    end:
      range?.endDateLabel ||
      meta.endDateLabel ||
      range?.endDate ||
      batch.endDate ||
      '',
  }
  const headerRange =
    labels.start && labels.end
      ? `${labels.start} ~ ${labels.end}`
      : labels.start || labels.end || ''
  const headerSub = [headerRange, batch.rowCount ? `${batch.rowCount} 人` : '']
    .filter(Boolean)
    .join(' · ')

  return (
    <div className={`mine-liushui-fold${expanded ? ' is-open' : ''}`}>
      <div className="mine-liushui-fold-head-row">
        <button
          type="button"
          className="mine-liushui-fold-head"
          aria-expanded={expanded}
          onClick={onToggle}
        >
          <span className="mine-liushui-fold-chevron" aria-hidden="true">
            {expanded ? '▾' : '▸'}
          </span>
          <span className="mine-liushui-fold-title">
            <span className="mine-liushui-fold-name">{batch.filename || '未命名.xlsx'}</span>
            {headerSub ? <span className="mine-liushui-fold-meta">{headerSub}</span> : null}
          </span>
        </button>
        <button
          type="button"
          className="mine-liushui-fold-del"
          disabled={uploadBusy || loading || deleting}
          onClick={(e) => {
            e.stopPropagation()
            if (!window.confirm('确定删除这份订单提成？')) return
            void (async () => {
              setDeleting(true)
              onStatus({ err: '', ok: '' })
              try {
                await deleteCommissionBatch(meta.id)
                onDelete()
                onStatus({ ok: '已删除该批次' })
              } catch (err) {
                onStatus({ err: err instanceof Error ? err.message : '删除失败' })
              } finally {
                setDeleting(false)
              }
            })()
          }}
        >
          {deleting ? '…' : '删除'}
        </button>
      </div>
      {expanded ? (
        <div className="mine-liushui-fold-body">
          {loading ? <p className="mine-admin-hint">加载中…</p> : null}
          {!loading && rows.length ? (
            <div className="mine-liushui-table-wrap">
              <table className="mine-liushui-table mine-liushui-table-edit">
                <thead>
                  <tr>
                    <th>用户昵称</th>
                    <th>用户账号</th>
                    <th>支付金额</th>
                    <th>销售金额</th>
                    <th>累计金额</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>{r.nickname || '—'}</td>
                      <td>{r.userAccount || '—'}</td>
                      <td>{formatMoney2(r.payAmount)}</td>
                      <td>{formatMoney2(r.saleAmount)}</td>
                      <td>{formatMoney2(r.cumulativeAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : !loading ? (
            <p className="mine-admin-hint">暂无行数据</p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function AdminCommissionPage({ onBack }: { onBack: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')
  const [batches, setBatches] = useState<CommissionBatchListItem[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [seedById, setSeedById] = useState<
    Record<string, { rows: CommissionPreviewRow[]; range: CommissionDateRange }>
  >({})

  const setStatus = useRef((msg: { err?: string; ok?: string }) => {
    if (msg.err !== undefined) setErr(msg.err)
    if (msg.ok !== undefined) setOk(msg.ok)
  }).current

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const list = await fetchCommissionBatches()
        if (cancelled) return
        setBatches(list)
        if (list.length) setExpandedId(list[0].id)
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function onPick(file: File | null) {
    if (!file || busy) return
    const name = file.name.toLowerCase()
    if (!name.endsWith('.xlsx') && !name.endsWith('.xls')) {
      setErr('请选择 .xlsx 或 .xls 文件')
      setOk('')
      return
    }
    setBusy(true)
    setErr('')
    setOk('')
    try {
      const out = await uploadCommissionExcel(file)
      let list: CommissionBatchListItem[]
      try {
        list = await fetchCommissionBatches()
      } catch {
        list = [
          {
            ...out.batch,
            startDateLabel: out.range.startDateLabel,
            endDateLabel: out.range.endDateLabel,
          },
          ...batches.filter((b) => b.id !== out.batch.id),
        ]
      }
      setBatches(list)
      setSeedById((prev) => ({
        ...prev,
        [out.batch.id]: { rows: out.rows, range: out.range },
      }))
      setExpandedId(out.batch.id)
      setOk(`订单提成上传成功，共 ${out.rowCount} 人（已按用户账号汇总）`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : '上传失败，请重试')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="pane">
      <div className="nav">
        <button type="button" aria-label="back" onClick={onBack}>
          {'<'}
        </button>
        <div className="title">订单提成记录</div>
        <span className="nav-side" />
      </div>
      <div className="mine-scroll mine-doc">
        <section className="mine-sec">
          <h2 className="mine-sec-title">订单提成</h2>
          <p className="mine-admin-hint">
            一个月上传一次。上传订单提成 Excel（.xlsx / .xls，仅解析入库，不保存原文件）。解析字段：用户账号 /
            用户昵称 / 支付金额 / 销售金额 / 累计金额 / 支付时间。按用户账号汇总支付金额与销售金额，累计金额取该账号最新支付时间那一行的累计金额。日期范围取表内最小～最大支付时间。
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            className="mine-liushui-file"
            onChange={(e) => void onPick(e.target.files?.[0] || null)}
          />
          <div className="mine-liushui-upload-row">
            <button
              type="button"
              className="mine-liushui-upload"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              {busy ? '上传中…' : '上传本月订单提成'}
            </button>
          </div>
          {err ? (
            <div className="mine-admin-hint" style={{ color: '#e8a0a0' }}>
              {err}
            </div>
          ) : null}
          {ok ? <div className="mine-admin-ok">{ok}</div> : null}
          <div className="mine-liushui-folds">
            {batches.map((b) => (
              <CommissionBatchPanel
                key={b.id}
                meta={b}
                expanded={expandedId === b.id}
                onToggle={() => setExpandedId((cur) => (cur === b.id ? null : b.id))}
                onDelete={() => {
                  setBatches((prev) => prev.filter((x) => x.id !== b.id))
                  setSeedById((prev) => {
                    const next = { ...prev }
                    delete next[b.id]
                    return next
                  })
                  setExpandedId((cur) => (cur === b.id ? null : cur))
                }}
                uploadBusy={busy}
                initialRows={seedById[b.id]?.rows}
                initialRange={seedById[b.id]?.range}
                onStatus={setStatus}
              />
            ))}
            {!batches.length ? (
              <p className="mine-admin-hint">暂无上传记录，请先上传订单提成。</p>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  )
}

export function MinePage({
  username,
  userId = '',
  isDage = false,
  canAccessRevenueBoard: canAccessRevenueBoardProp = false,
  canAccessPayrollBoard: canAccessPayrollBoardProp = false,
  isFullAdmin: isFullAdminProp = false,
  isTingGuan: isTingGuanProp = false,
  isHallOwner = false,
  pointRate = '',
  hallNo = null,
  onLogout,
  onLogin,
}: {
  username: string
  userId?: string
  /** Point-rate role selected in 注册列表. */
  isDage?: boolean
  canAccessRevenueBoard?: boolean
  canAccessPayrollBoard?: boolean
  isFullAdmin?: boolean
  isTingGuan?: boolean
  isHallOwner?: boolean
  pointRate?: string
  hallNo?: string | null
  onLogout: () => void
  onLogin?: () => void
}) {
  type MineView = 'list' | 'welfare' | 'penalty' | 'onboard' | 'howEnter' | 'prank' | 'growth' | 'comms' | 'pmUnlock' | 'adminUsers' | 'adminLiushui' | 'adminActivity' | 'adminCommission' | 'addProfile' | 'homework' | 'pkGuide' | 'newcomerGuide' | 'gameGuide' | 'mySalary' | 'revenueBoard' | 'payrollBoard'
  const [view, setView] = useState<MineView>('list')
  const [flash, setFlash] = useState<string | null>(null)
  const [vestCopied, setVestCopied] = useState(false)
  const loggedIn = !!username
  // 会长(admin)/全满 = full admin menus; 厅管 = payroll only (no 收益看板); 厅主 = revenue scoped;
  // 半满 without 厅主 = normal 主播 (no special menus); 大哥 = whitelist
  const isAdmin = isBootstrapAdminName(username) || isFullAdminProp
  const canAccessRevenueBoard =
    !isDage && (isAdmin || canAccessRevenueBoardProp || (isHallOwner && !!((hallNo || '').trim())))
  const canAccessPayrollBoard =
    !isDage && (isAdmin || canAccessPayrollBoardProp || isTingGuanProp)
  const dageMineViews = new Set<MineView>([
    'list',
    'welfare',
    'penalty',
    'onboard',
    'howEnter',
    'prank',
    'addProfile',
    'gameGuide',
    'mySalary',
  ])
  // Keep defensive guards even if a forbidden view is reached through stale state.
  // Activity upload/listing is admin-only on both the UI and API; never mount its
  // component for a normal user, because mounting it would fetch the admin APIs.
  const effectiveView =
    isDage && !dageMineViews.has(view)
      ? 'list'
      : !isAdmin && (view === 'adminActivity' || view === 'adminCommission' || view === 'adminUsers' || view === 'adminLiushui')
        ? 'list'
        : !canAccessRevenueBoard && view === 'revenueBoard'
          ? 'list'
          : !canAccessPayrollBoard && view === 'payrollBoard'
            ? 'list'
            : view
  const showMineItem = (item: MineView) => !isDage || dageMineViews.has(item)

  // All Mine entries now open directly from the main list.
  const parentView: MineView = 'list'
  useBackHandler(effectiveView !== 'list' ? () => setView(parentView) : null)

  const GUILD_ADMIN_URL = 'https://f.vvxqiu.com/#/login'
  const PROMO_ADMIN_URL = 'http://oa.91dingyu.com/Default.aspx'
  /** Open external admin console — URL only, no credential popup. */
  function openExternalAdmin(url: string) {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
  const showGuildAdminLink = loggedIn && !isDage && (isAdmin || isHallOwner)
  const showPromoAdminLink = loggedIn && !isDage && isAdmin
  const showAdminTools = loggedIn && !isDage && isAdmin
  const showExtLinksGroup = showGuildAdminLink || showPromoAdminLink

  function copyGuildVest() {
    const done = () => {
      setVestCopied(true)
      setFlash('已复制')
      window.setTimeout(() => {
        setVestCopied(false)
        setFlash(null)
      }, 1500)
    }
    const w = navigator.clipboard
    if (w && w.writeText) {
      w.writeText(GUILD_VEST_TAG).then(done, done)
    } else {
      done()
    }
  }

  if (effectiveView === 'welfare') {
    return <WelfareGuidePage onBack={() => setView('list')} />
  }

  if (effectiveView === 'penalty') {
    return <PenaltyGuidePage onBack={() => setView('list')} />
  }

  if (effectiveView === 'onboard') {
    return <OnboardApplyPage onBack={() => setView('list')} />
  }

  if (effectiveView === 'howEnter') {
    return <HowToEnterHallPage onBack={() => setView('list')} />
  }

  if (effectiveView === 'prank') {
    return <PrankSettingsPage onBack={() => setView('list')} />
  }

  if (effectiveView === 'growth') {
    return <GrowthGuidePage onBack={() => setView('list')} />
  }

  if (effectiveView === 'comms') {
    return <CommsGuidePage onBack={() => setView('list')} />
  }

  if (effectiveView === 'pmUnlock') {
    return <PmUnlockPage onBack={() => setView('list')} />
  }

  if (effectiveView === 'addProfile') {
    return <ProfileFormPage onBack={() => setView('list')} />
  }

  if (effectiveView === 'homework') {
    return <HomeworkPage onBack={() => setView('list')} />
  }

  if (effectiveView === 'pkGuide') {
    return <PkGuidePage onBack={() => setView('list')} />
  }

  if (effectiveView === 'newcomerGuide') {
    return <NewcomerGuidePage onBack={() => setView('list')} />
  }

  if (effectiveView === 'gameGuide') {
    return <GameGuidePage onBack={() => setView('list')} />
  }

  if (effectiveView === 'mySalary') {
    return <MySalaryPage onBack={() => setView('list')} />
  }

  if (effectiveView === 'adminUsers') {
    return <AdminUsersPage onBack={() => setView('list')} />
  }

  if (effectiveView === 'adminLiushui') {
    return <AdminLiushuiPage onBack={() => setView('list')} />
  }

  if (effectiveView === 'adminActivity') {
    return <AdminActivityPage onBack={() => setView('list')} />
  }

  if (effectiveView === 'adminCommission') {
    return <AdminCommissionPage onBack={() => setView('list')} />
  }

  if (effectiveView === 'revenueBoard') {
    // 会长/全满: full board (never hall-lock). 厅主-only: lock to own hall + hide guild totals.
    const hallLocked = !isAdmin && isHallOwner ? (hallNo || '').trim() || null : null
    return (
      <RevenueBoardPage
        username={username}
        lockedHallNo={hallLocked}
        hideOverviewTotals={Boolean(hallLocked)}
        onBack={() => setView('list')}
      />
    )
  }

  if (effectiveView === 'payrollBoard') {
    return (
      <BackScope>
        <PayrollBoardPage onBack={() => setView('list')} />
      </BackScope>
    )
  }

  return (
    <div className="pane">
      <AccountHeader
        username={username}
        userId={userId}
        isDage={isDage}
        isFullAdmin={isAdmin}
        isTingGuan={isTingGuanProp}
        isHallOwner={isHallOwner}
        pointRate={pointRate}
        hallNo={hallNo}
        onLogout={loggedIn ? onLogout : undefined}
      />
      <div className="mine-scroll">
        {loggedIn && (showMineItem('addProfile') || !isDage) ? (
          <div className="mine-group">
            <div className="mine-group-title">资料</div>
            <div className="mine-grid">
              {showMineItem('addProfile') ? (
                <button type="button" className="mine-tile" onClick={() => setView('addProfile')}>
                  <span className="mine-glyph">
                    <ProfileAddIcon />
                  </span>
                  <span className="mine-label">添加资料</span>
                </button>
              ) : null}
              {!isDage ? (
                <button type="button" className="mine-tile" onClick={copyGuildVest}>
                  <span className="mine-glyph">
                    <VestIcon />
                  </span>
                  <span className="mine-label">{vestCopied ? '已复制' : '工会马甲'}</span>
                  <span className="mine-sub">{GUILD_VEST_TAG}</span>
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="mine-group">
          <div className="mine-group-title">制度与入职</div>
          <div className="mine-grid">
            <button type="button" className="mine-tile" onClick={() => setView('welfare')}>
              <span className="mine-glyph">
                <WelfareIcon />
              </span>
              <span className="mine-label">福利制度</span>
            </button>
            <button type="button" className="mine-tile" onClick={() => setView('penalty')}>
              <span className="mine-glyph">
                <PenaltyIcon />
              </span>
              <span className="mine-label">处罚规则</span>
            </button>
            <button type="button" className="mine-tile" onClick={() => setView('onboard')}>
              <span className="mine-glyph">
                <ApplyIcon />
              </span>
              <span className="mine-label">入职流程</span>
            </button>
          </div>
        </div>

        {(showMineItem('howEnter') || showMineItem('prank') || showMineItem('pmUnlock') || (loggedIn && (showMineItem('pkGuide') || showMineItem('gameGuide')))) ? (
          <div className="mine-group">
            <div className="mine-group-title">新人必看</div>
            <div className="mine-grid">
              {showMineItem('howEnter') ? (
                <button type="button" className="mine-tile" onClick={() => setView('howEnter')}>
                  <span className="mine-glyph"><HallIcon /></span>
                  <span className="mine-label">如何进厅</span>
                </button>
              ) : null}
              {showMineItem('prank') ? (
                <button type="button" className="mine-tile" onClick={() => setView('prank')}>
                  <span className="mine-glyph"><PrankIcon /></span>
                  <span className="mine-label">设置整蛊</span>
                </button>
              ) : null}
              {showMineItem('pmUnlock') ? (
                <button type="button" className="mine-tile" onClick={() => setView('pmUnlock')}>
                  <span className="mine-glyph"><UnlockIcon /></span>
                  <span className="mine-label">私信解锁要求</span>
                </button>
              ) : null}
              {loggedIn && showMineItem('pkGuide') ? (
                <button type="button" className="mine-tile" onClick={() => setView('pkGuide')}>
                  <span className="mine-glyph"><PkGuideIcon /></span>
                  <span className="mine-label">PK玩法</span>
                </button>
              ) : null}
              {loggedIn && showMineItem('gameGuide') ? (
                <button type="button" className="mine-tile" onClick={() => setView('gameGuide')}>
                  <span className="mine-glyph"><GameGuideIcon /></span>
                  <span className="mine-label">游戏介绍</span>
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {loggedIn && (showMineItem('homework') || showMineItem('growth') || showMineItem('comms')) ? (
          <div className="mine-group">
            <div className="mine-group-title">成长技巧</div>
            <div className="mine-grid">
              {showMineItem('homework') ? (
                <button type="button" className="mine-tile" onClick={() => setView('homework')}>
                  <span className="mine-glyph"><HomeworkIcon /></span>
                  <span className="mine-label">作业文本</span>
                </button>
              ) : null}
              {showMineItem('growth') ? (
                <button type="button" className="mine-tile" onClick={() => setView('growth')}>
                  <span className="mine-glyph"><GrowthIcon /></span>
                  <span className="mine-label">大哥养成</span>
                </button>
              ) : null}
              {showMineItem('comms') ? (
                <button type="button" className="mine-tile" onClick={() => setView('comms')}>
                  <span className="mine-glyph"><CommsIcon /></span>
                  <span className="mine-label">沟通技巧</span>
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {showAdminTools ? (
          <div className="mine-group">
            <div className="mine-group-title">数据录入</div>
            <div className="mine-grid">
              <button type="button" className="mine-tile" onClick={() => setView('adminLiushui')}>
                <span className="mine-glyph"><LiushuiIcon /></span>
                <span className="mine-label">上传流水</span>
              </button>
              <button type="button" className="mine-tile" onClick={() => setView('adminActivity')}>
                <span className="mine-glyph"><ActivityIcon /></span>
                <span className="mine-label">上传活跃度</span>
              </button>
              <button type="button" className="mine-tile" onClick={() => setView('adminCommission')}>
                <span className="mine-glyph"><CommissionIcon /></span>
                <span className="mine-label">订单提成记录</span>
              </button>
            </div>
          </div>
        ) : null}

        {loggedIn && (showMineItem('mySalary') || canAccessRevenueBoard || canAccessPayrollBoard) ? (
          <div className="mine-group">
            <div className="mine-group-title">薪资与看板</div>
            <div className="mine-grid">
              {showMineItem('mySalary') ? (
                <button type="button" className="mine-tile" onClick={() => setView('mySalary')}>
                  <span className="mine-glyph">
                    <SalaryIcon />
                  </span>
                  <span className="mine-label">我的工资</span>
                </button>
              ) : null}
              {!isDage && canAccessRevenueBoard ? (
                <button type="button" className="mine-tile" onClick={() => setView('revenueBoard')}>
                  <span className="mine-glyph">
                    <RevenueBoardIcon />
                  </span>
                  <span className="mine-label">收益看板</span>
                </button>
              ) : null}
              {!isDage && canAccessPayrollBoard ? (
                <button type="button" className="mine-tile" onClick={() => setView('payrollBoard')}>
                  <span className="mine-glyph">
                    <PayrollIcon />
                  </span>
                  <span className="mine-label">工资发放</span>
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {showAdminTools ? (
          <div className="mine-group">
            <div className="mine-group-title">管理工具</div>
            <div className="mine-grid">
              <button type="button" className="mine-tile" onClick={() => setView('adminUsers')}>
                <span className="mine-glyph">
                  <UsersIcon />
                </span>
                <span className="mine-label">注册列表</span>
              </button>
            </div>
          </div>
        ) : null}

        {showExtLinksGroup ? (
          <div className="mine-group">
            <div className="mine-group-title">外部后台</div>
            <div className="mine-grid">
              {showGuildAdminLink ? (
                <button
                  type="button"
                  className="mine-tile"
                  onClick={() => openExternalAdmin(GUILD_ADMIN_URL)}
                >
                  <span className="mine-glyph">
                    <GuildAdminIcon />
                  </span>
                  <span className="mine-label">工会后台</span>
                </button>
              ) : null}
              {showPromoAdminLink ? (
                <button
                  type="button"
                  className="mine-tile"
                  onClick={() => openExternalAdmin(PROMO_ADMIN_URL)}
                >
                  <span className="mine-glyph">
                    <PromoAdminIcon />
                  </span>
                  <span className="mine-label">推广后台</span>
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

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
