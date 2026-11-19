export type Lang = "en" | "zh";
type Copy = [en: string, zh: string];
export const locales: Lang[] = ["en", "zh"];
export const tr = (lang: Lang, text: Copy) => text[lang === "en" ? 0 : 1];
export const projects = [
  {
    id: "joystick",
    name: "Joystick",
    cover: "/joystick/cover.webp",
    alt: [
      "G1 striding across its generated path and command arrow",
      "G1 沿地面的生成轨迹与指令箭头斜向迈步",
    ],
    topic: ["Humanoid control", "人形运动控制"],
    description: [
      "Generate whole-body motion references for humanoid controllers from speed and steering commands.",
      "根据速度和转向指令，为人形机器人生成可供控制策略跟踪的全身动作参考。",
    ],
  },
  {
    id: "playground",
    name: "PlayGround",
    cover: "/inspection/cover.webp",
    alt: [
      "Third-person view of G1 on the warehouse inspection route",
      "第三人称镜头中的 G1 仓内巡检",
    ],
    topic: ["Interactive simulation", "交互仿真"],
    description: [
      "Build scenes and tasks in physics simulation, then record how robots move, what they observe and how each task unfolds.",
      "在物理仿真中搭建场景、设计任务，让机器人与环境交互，同步采集动作、观测和任务结果。",
    ],
  },
  {
    id: "semoco",
    name: "SeMoCo",
    cover: "/research/phrase.webp",
    alt: [
      "Unitree G1 replaying a text-generated dance",
      "宇树 G1 演绎由文字生成的舞步",
    ],
    topic: ["Human motion modeling", "人体动作建模"],
    description: [
      "Model motion semantics and body movement separately to generate human motion from text.",
      "将动作语义与身体运动细节分开建模，从文字描述生成连贯的人体动作。",
    ],
  },
] as const;
export const semoco = {
  unifiedRepo: "https://github.com/OMEGA-i/SeMoCo",
  inference: "https://github.com/OMEGA-i/SeMoCo/blob/main/docs/INFERENCE.md",
  models: "https://huggingface.co/poisonousID/SeMoCo",
};
export const noteTitle: Copy = [
  "Where does G1 lose ground on a diagonal step?",
  "斜向行走时，G1 的跟踪偏差出在哪里？",
];
