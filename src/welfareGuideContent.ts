export type WelfareGuideSection = {
  id: string
  title: string
  style?: string
  lines: string[]
}

export type WelfareGuideContent = {
  title: string
  subtitle?: string
  intro?: string
  poster?: string
  sections: WelfareGuideSection[]
}

export const welfareGuideContent: WelfareGuideContent = {
  title: '福利制度',
  subtitle: '心动予你 · 福利制度',
  intro: '厅内福利一览：麦序分成、主持费、周榜/收光奖励、日常福利与拉新规则。以单个礼物整数报备为准，凑的不算。',
  poster: '/welfare/poster.jpg',
  sections: [
    {
      id: 'platform',
      title: '平台工地 / 玩法',
      lines: [
        '平台工地：VV星球（公众号下载）',
        '平台玩法：盒子抽奖 / 有痛无痛都有',
      ],
    },
    {
      id: 'mic',
      title: '麦序福利',
      lines: [
        '21小时麦序 + 14小时主持：45%',
        '21小时麦序：43%',
        '小于21小时：37%',
      ],
    },
    {
      id: 'host',
      title: '主持福利',
      lines: [
        '一个档 2 个小时',
        '每个档 112r / 周主持费',
        '如有事临时请假，在群里甩档 8r/h',
      ],
    },
    {
      id: 'week-rank',
      title: '周榜奖励',
      lines: [
        '12000 → 188r',
        '8000 → 88r',
        '5000 → 52r',
      ],
    },
    {
      id: 'shouguang',
      title: '收光奖励',
      style: '单笔直刷整数，累加不算。例：188 报 1.0，520 报 5.0。',
      lines: [
        '单笔 >100：返 1%',
        '单笔 >500：返 2%',
        '单笔 >1000：返 3%',
      ],
    },
    {
      id: 'daily',
      title: '日常福利',
      lines: [
        '不定时群红包',
        '节日群红包',
        '生日福利 88r',
        '全麦多多',
        '满勤奖（无请假无旷档）188r / 月',
      ],
    },
    {
      id: 'referral',
      title: '拉新奖励',
      lines: [
        '新人第一个月流水 2%',
        '双方需保持每周 21+ 麦序',
      ],
    },
    {
      id: 'requirements',
      title: '入职要求',
      lines: [
        '积极上麦',
        '团结不挖墙脚，否则罚款 / 开除',
        '找坚持的人；成功需要用心经营',
        '没天赋用时间换机会',
        '坚持排档、用心服务、攒客',
      ],
    },
  ],
}
