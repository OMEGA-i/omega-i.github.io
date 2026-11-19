import type { Lang } from "./content";
export const notes = [
  {
    slug:"simulation-data", project:"Joystick × PlayGround", projectId:"playground",
    title:["Why use simulation to collect embodied interaction data?", "为什么用仿真生产具身交互数据？"],
    summary:["Joystick turns movement intent into a whole-body reference. PlayGround records what the robot sees and what its actions change as it carries out a task.",
      "Joystick 把运动意图变成全身动作参考，PlayGround 让机器人带着任务进入场景，记录它沿途看见什么、做了什么，以及行动带来的结果。"],
    cover:"/research/simulation-cover.webp"
  },
  {
    slug:"codec-and-generation", project:"SeMoCo", projectId:"semoco",
    title:["Why can a better reconstruction make generation worse?", "重建得更准，为什么生成反而变差？"],
    summary:["A recording specifies every footstep. A caption leaves room for many. What should a motion representation preserve for a generator?",
      "一段记录确定了每个脚步，一句文字却容许许多种走法。要让生成器学会动作，表示应当保存哪些细节？"],
    cover:"/research/codec-cover.webp"
  }
] as const;
export type Note = typeof notes[number];
export const legacyNotes:Record<string,string> = {
  "inside-a-motion-packet":"codec-and-generation/#depth",
  "g1-command":"simulation-data/#reference",
  "one-rollout-three-views":"simulation-data/#turn",
  "joystick-on-webgpu":"simulation-data/#webgpu",
  "warehouse-inspection":"simulation-data/#inspection"
};
export const essayUrl=(lang:Lang,slug:string)=>`/${lang}/blog/${slug}/`;
