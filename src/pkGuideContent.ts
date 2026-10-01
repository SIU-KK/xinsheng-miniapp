export type PkGuideSection = {
  id: string
  title: string
  style?: string
  lines: string[]
  image?: string
}

export type PkGuideContent = {
  title: string
  intro?: string
  sections: PkGuideSection[]
}

/** Content from the user's 7 annotated Crush screenshots. */
export const pkGuideContent: PkGuideContent = {
  title: 'PK玩法',
  intro: '按下面步骤操作跨房 PK；话术可直接复制。',
  sections: [
    {
      id: 'step1',
      title: '1. 点击底部「…」',
      style: '在厅内底部导航点最右侧礼物旁的「…」更多。',
      lines: ['点击底部「…」打开更多功能'],
      image: '/pk-guide/step1.png',
    },
    {
      id: 'step2',
      title: '2. 点击 PK约战',
      style: '在更多菜单里找到「pk约战」并点开。',
      lines: ['点击 PK约战'],
      image: '/pk-guide/step2.png',
    },
    {
      id: 'step3',
      title: '3. 设置并发起挑战',
      style: '按图中选项设置后点「发起挑战」。',
      lines: [
        '选择跨房PK',
        '时长选择10分钟',
        '选择随机匹配',
        '发起挑战',
        '指定PK在约战方式里选择',
        '惩罚内容不需要选择',
      ],
      image: '/pk-guide/step3.png',
    },
    {
      id: 'step4',
      title: '4. 发起后进入匹配',
      style: '发起挑战后会出现「随机匹配中」。',
      lines: ['发起挑战后会进行匹配'],
      image: '/pk-guide/step4.png',
    },
    {
      id: 'step5',
      title: '5. 没匹配到就再发起',
      style: '倒计时结束仍未匹配到时，点「再次发起」。',
      lines: ['如果时间到了没有匹配到，需要点击「再次发起」'],
      image: '/pk-guide/step5.png',
    },
    {
      id: 'step6',
      title: '6. 匹配成功后',
      style: '先对接话术，再关掉对方声音。',
      lines: [
        '你好，小姐姐，过百自带，待会见',
        '点击对方头像旁边的喇叭，关闭对方声音',
      ],
      image: '/pk-guide/step6.png',
    },
    {
      id: 'step7',
      title: '7. PK 失败 / 胜利怎么处理',
      style: '按结果用下面话术和处理方式。',
      lines: [
        '【如果PK失败】hello 小姐姐 罚么',
        '【如果PK失败】如果对面罚 我们就自带一个',
        '【如何PK胜利】询问上分老板是否惩罚对面',
        '【如何PK胜利】如果老板惩罚就让对面自带一个',
        '【如何PK胜利】如果不惩罚就挂断PK',
      ],
      image: '/pk-guide/step7.png',
    },
  ],
}
