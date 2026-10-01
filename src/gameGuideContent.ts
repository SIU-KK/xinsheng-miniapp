export type GameGuideSubsection = {
  id: string
  title: string
  note?: string
  lines: string[]
  /** When true, each line gets a copy button (optional for key tips). */
  copyable?: boolean
}

export type GameGuideSection = {
  id: string
  title: string
  note?: string
  lines?: string[]
  subsections?: GameGuideSubsection[]
}

export type GameGuideContent = {
  title: string
  subtitle: string
  tips: string[]
  sections: GameGuideSection[]
}

export const gameGuideContent: GameGuideContent = {
  title: '游戏介绍',
  subtitle: '游戏玩法',
  tips: [
    '⚠️ 很多实分活动风险较高（会赚会亏），建议新玩家谨慎或先观摩。',
    '🎯 平行时空 和 幸运锦鲤 相对友好，可以作为日常推荐。',
    '🔥 凤凰召唤 和 盗墓笔记 适合有经验的大玩咖。',
  ],
  sections: [
    {
      id: 'real',
      title: '实分玩法',
      note:
        '重要提醒：实分活动（赌，会赚会亏，不推荐新玩家）大部分实分活动都在整蛊礼物里面，只能送给有精品整蛊的主播。一眼万年 是其中一种常见玩法。',
      subsections: [
        {
          id: 'yiyan',
          title: '一眼万年',
          lines: [
            '楚辞：5元/次，最高可获得 200元 礼物',
            '元曲：15元/次，最高可获得 500元 礼物',
            '汉赋：30元/次，最高可获得 2000元 礼物',
            '提示：礼物具体效果截图上很清楚，建议直接看礼物面板确认。',
          ],
        },
        {
          id: 'lianyushouhu',
          title: '恋与守护',
          lines: [
            '通过小额钻石投入，有概率获得大额礼物。',
            '最高可获得 5200元 礼物。',
            '亮点：有机会白嫖守护（免费获得守护）。',
          ],
        },
        {
          id: 'xingzuo',
          title: '十二星座',
          lines: [
            '分为占卜和许愿池两种模式',
            '占卜：选择12星座中的一个投入钻石；开奖后若中奖，将获得对应投入金额的倍数礼物。',
            '许愿池：10元/次抽奖；单次可获得 0.1元 ~ 500元 不等的礼物（随机）。',
          ],
        },
      ],
    },
    {
      id: 'virtual',
      title: '虚分玩法',
      subsections: [
        {
          id: 'baijia',
          title: '百家风云',
          lines: ['类似于爬楼梯，没有什么人玩，不推荐'],
        },
        {
          id: 'phoenix',
          title: '凤凰召唤（打鸟）',
          lines: [
            '30元 买蛋 → 70元 孵化（总价值 100元）。',
            '鸟类升级链：三圣鸟（1万经验） ＜ 苍鸾鸟（5.2万经验） ＜ 欲火凤凰（13.14万经验） ＜ 凤凰神女（48.88万经验）',
            '建议：大玩咖升到 S4 后再玩，概率较高。新手不推荐。',
          ],
        },
        {
          id: 'tomb',
          title: '盗墓笔记',
          lines: [
            '挖宝：20元/次（同等价值）。',
            '道具：20元购买摸金符（挖宝道具），附送一个洛阳铲（刷新道具）。',
            '操作：消耗摸金符挖一次，没好东西就用洛阳铲刷新。',
            '经验值等级：C ＜ B ＜ A ＜ S（S级 为实分道具）。',
          ],
        },
        {
          id: 'lingshou',
          title: '灵兽契约',
          lines: [
            '20元 占一个位置（座位）。',
            '时间：每天凌晨 0-2点 和 中午 12-14点。',
            '玩法：十选一，不中获得白泽，中奖后根据坐的人数获得不同经验值奖励。',
            '最高可获得 33.44万经验。',
          ],
        },
        {
          id: 'koi',
          title: '幸运锦鲤',
          lines: [
            '鱼塘：1元/次；海边：5元/次',
            '可获得不同经验值礼物。',
            '海边有概率出至尊大锦鲤或心渡爱河，额外送价值100元的幸运锦鲤。',
            '提示：没事多看锦鲤榜单，每天榜一可获得 520礼物。',
          ],
          copyable: true,
        },
        {
          id: 'cupid',
          title: '爱神降临',
          lines: [
            '天使之恋：20元；爱神降临：30元',
            '参与人数少，看到飘屏恭喜即可，不用重点推。',
          ],
        },
        {
          id: 'parallel',
          title: '二次元 / 异次元（类似大富翁）',
          lines: [
            '二次元：10元；异次元：200元',
            'VIP：二次元VIP 9.9元；异次元VIP 1000元（送5个免费骰子）',
            '亮点：踩到礼物获得经验值，送出后还能获得经验值 → 双倍经验。',
            '虚分增长快，对打PK 非常有用，是目前升级最快的活动之一。',
          ],
          copyable: true,
        },
      ],
    },
  ],
}
