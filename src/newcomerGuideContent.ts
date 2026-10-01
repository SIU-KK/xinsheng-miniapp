export type NewcomerGuideSection = {
  id: string
  title: string
  style?: string
  lines: string[]
}

export type NewcomerGuideContent = {
  title: string
  intro?: string
  sections: NewcomerGuideSection[]
}

export const newcomerGuideContent: NewcomerGuideContent = {
  title: '对接新人',
  intro: '玩家刚进房时可用的对接话术，点复制即可粘贴。',
  sections: [
    {
      id: 'intro-player',
      title: '如何给玩家介绍 / 玩家刚进房',
      lines: [
        '～ 欢迎❤️ 小宝宝来到5031\n\n你是刚玩这个平台么？要不要麦上的妹妹给你介绍一下呀～',
        '这个平台有很多好玩的游戏，新玩家可能有时候会看不懂，需要的话我可以给你介绍一下。',
        '我们厅有很多优质的小姐姐哦，对哪位小姐姐感兴趣可以告诉我，\n\n我可以帮你介绍介绍，你也可以点开左下角的小信封，里面有麦上妹妹给你发的私信，你也可以先打开看看。',
        '或者先花2块钱听个全麦试音，感受一下氛围也行～',
        '一起交个朋友😘',
      ],
    },
    {
      id: 'game-intro',
      title: '游戏介绍',
      lines: [
        '你可以点开右下角骷髅头旁边的热门活动',
        '你刚玩的话荐你玩幸运锦鲤，这个有1块一次的，还有5块一次的。可以先试着完一下看看。里面有很多不同的礼物。和礼物特效',
        '想升级快就去平行时空，10块的二次元超有趣，像大富翁一样，还双倍经验～',
      ],
    },
  ],
}
