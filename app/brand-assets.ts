export const brand3dAssets = {
  milestone: {
    src: "/brand/growth-milestone-3d.png",
    name: "成长阶梯",
    use: "成长月报、阶段性成果分享",
  },
  evidence: {
    src: "/brand/evidence-network-3d.png",
    name: "证据网络",
    use: "评审、成果库与资料为空时的辅助说明",
  },
  unlock: {
    src: "/brand/level-unlock-3d.png",
    name: "解锁路径",
    use: "提交成功、晋级达成与里程碑通知",
  },
} as const;

export type Brand3dAssetId = keyof typeof brand3dAssets;

/**
 * 已获内部使用授权的千问办公标识。
 * light 用于浅色界面，dark 用于深色承载面；保持源文件比例与原始颜色，不作二次改绘。
 */
export const qwenworkLogos = {
  light: {
    src: "/brand/qwenwork-logo-green-black.png",
    alt: "千问办公",
  },
  dark: {
    src: "/brand/qwenwork-logo-green-white.png",
    alt: "千问办公",
  },
  monochrome: {
    src: "/brand/qwenwork-logo-black.png",
    alt: "千问办公",
  },
} as const;
