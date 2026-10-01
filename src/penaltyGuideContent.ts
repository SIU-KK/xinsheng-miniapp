export type PenaltyGuideSection = {
  id: string
  title: string
  style?: string
  lines: string[]
}

export type PenaltyGuideContent = {
  title: string
  subtitle?: string
  intro?: string
  sections: PenaltyGuideSection[]
}

export const penaltyGuideContent: PenaltyGuideContent = {
  title: '处罚规则',
  subtitle: '厅内处罚与禁止行为',
  intro: '请严格遵守下列规则。违规将按对应条款处罚；有事（请假、换挡等）务必提前报备。',
  sections: [
    {
      id: 'host',
      title: '主持',
      lines: [
        '主持不放BGM，不欢迎老板 → 扣除本档主持费',
      ],
    },
    {
      id: 'black-mic',
      title: '本档黑麦罚10元',
      style: '下列情况均按本档黑麦罚 10 元处理：',
      lines: [
        '档内报备超过两次',
        '十分钟内不说话',
        '喊人找不到人',
        '吃全麦不摇旗',
      ],
    },
    {
      id: 'forbidden',
      title: '其他禁止行为',
      lines: [
        '不要扰乱市场',
        '厅里和群里禁止传播消极态度',
        '禁止小团体、禁止私下和老板聊天去蛐蛐别人',
        '禁止群里吵架',
        '礼物刷错人（30元以内）不算',
        '改名字要报备',
        '开多个号要把名字改备注',
        'S爆开小号禁止搞骑大马/大花轿',
        '排挡时不要随便跳麦',
        '必须开启整蛊 + 粉丝团',
        '禁止擦边、搞颜色',
        '禁止骂老板',
        '禁止私下收转账',
        '任何事情（请假、换挡等）都要提前报备',
        '禁止出现卡麦情况',
        '一周内工资不满10，不发放',
      ],
    },
  ],
}
